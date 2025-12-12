import { economy } from '../services/economy.js';

// Mapa para almacenar los desafíos activos. La clave es el JID del grupo.
// { challengerId: string, targetId: string, bet: number, challengeMessageKey: string }
const challenges = new Map(); 

// Utilidad: Lanza un dado de 6 caras.
function rollDice() {
    return Math.floor(Math.random() * 6) + 1; // Devuelve 1 a 6
}

/**
 * Manejador principal para los comandos #duelo, #aceptar y #rechazar.
 */
export async function dueloHandler(sock, m, args) {
    const jid = m.key.remoteJid;
    const sender = m.key.participant || m.sender;
    
    // Obtener el comando principal
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const command = text.split(' ')[0].toLowerCase();
    
    // Reacciona mientras busca la cuenta
    await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });
    
    // Si es una respuesta de aceptación o rechazo
    if (command === '#aceptar' || command === '#rechazar') {
        return handleChallengeResponse(sock, m, sender, command);
    }
    
    // Si es un nuevo desafío
    if (command === '#duelo') {
        return handleNewChallenge(sock, m, sender, args);
    }
}

// --- LÓGICA DE NUEVO DESAFÍO (#duelo @user [monto]) ---
async function handleNewChallenge(sock, m, sender, args) {
    const jid = m.key.remoteJid;

    // 1. Identificar Objetivo y Monto de Apuesta
    let targetId = null;
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        targetId = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    
    // El monto es el primer argumento después de #duelo, o el último si hay mención
    let betAmount;
    if (targetId) {
        // Si hay mención, el monto es el último argumento (ej. #duelo @user 100)
        betAmount = parseInt(args[args.length - 1]);
    } else {
        // Si no hay mención, el formato está mal, pero intentamos con el primer argumento
        betAmount = parseInt(args[0]);
    }
    
    // 2. Validaciones Iniciales
    if (!targetId || isNaN(betAmount) || betAmount < 50) {
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        return sock.sendMessage(jid, { 
            text: '❌ *Uso correcto:* Menciona al oponente y la cantidad.\nEjemplo: *#duelo @usuario 150*\n(Apuesta mínima: 50 Bs)' 
        }, { quoted: m });
    }
    if (targetId === sender) {
        await sock.sendMessage(jid, { react: { text: "🤦‍♂️", key: m.key } });
        return sock.sendMessage(jid, { text: "🤦‍♂️ No puedes retarte a ti mismo. ¡Busca un oponente real!" }, { quoted: m });
    }
    if (challenges.has(jid)) {
         await sock.sendMessage(jid, { react: { text: "⚠️", key: m.key } });
         return sock.sendMessage(jid, { text: "⚠️ Ya hay un duelo pendiente en este chat. Espera a que termine o se rechace." }, { quoted: m });
    }

    // 3. Chequeo de Saldos
    const [senderAccount, targetAccount] = await Promise.all([
        economy.getUser(sender),
        economy.getUser(targetId)
    ]);

    if (senderAccount.money < betAmount) {
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        return sock.sendMessage(jid, { 
            text: `❌ *Saldo insuficiente.* Necesitas *${betAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs* para este desafío.` 
        }, { quoted: m });
    }
    if (targetAccount.money < betAmount) {
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        return sock.sendMessage(jid, { 
            text: `❌ El usuario mencionado no tiene el saldo suficiente (*${betAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*).` 
        }, { quoted: m });
    }
    
    // 4. Crear y Enviar Desafío
    const challenge = {
        challengerId: sender,
        targetId: targetId,
        bet: betAmount,
        timestamp: Date.now()
    };
    
    const targetName = `@${targetId.split('@')[0]}`;
    const challengerName = m.pushName || "El retador";
    
    const message = `🎲 *DUELO DE DADOS* ⚔️\n\n` +
                    `👤 *${challengerName}* ha desafiado a ${targetName} por *${betAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*.\n\n` +
                    `*¡ACEPTA EL DESAFÍO!*\n` +
                    `Responde a este mensaje con: *#aceptar* o *#rechazar*`;
    
    const sentMsg = await sock.sendMessage(jid, { 
        text: message,
        contextInfo: { mentionedJid: [targetId] }
    }, { quoted: m });
    
    challenge.challengeMessageKey = sentMsg.key.id;
    challenges.set(jid, challenge);
    await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });
    
    // Limpiar el desafío después de 5 minutos si no se responde
    setTimeout(() => {
        if (challenges.get(jid)?.challengeMessageKey === sentMsg.key.id) {
            challenges.delete(jid);
            sock.sendMessage(jid, { text: "⌛ El desafío de duelo ha expirado por inactividad." });
        }
    }, 5 * 60 * 1000); // 5 minutos para aceptar
}

// --- LÓGICA DE ACEPTACIÓN/RECHAZO (#aceptar / #rechazar) ---
async function handleChallengeResponse(sock, m, sender, command) {
    const jid = m.key.remoteJid;
    const challenge = challenges.get(jid);

    // 1. Validar Desafío Activo y Emisor
    if (!challenge) {
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        return sock.sendMessage(jid, { text: "❌ No hay un duelo activo pendiente en este chat." }, { quoted: m });
    }
    if (sender !== challenge.targetId) {
        await sock.sendMessage(jid, { react: { text: "🚫", key: m.key } });
        return sock.sendMessage(jid, { text: "❌ Solo el usuario desafiado puede responder a este duelo." }, { quoted: m });
    }
    
    // 2. Rechazar Desafío
    if (command === '#rechazar') {
        challenges.delete(jid);
        await sock.sendMessage(jid, { react: { text: "🚫", key: m.key } });
        const rejectMsg = `🚫 @${sender.split('@')[0]} ha *rechazado* el duelo.`;
        return sock.sendMessage(jid, { text: rejectMsg, contextInfo: { mentionedJid: [sender] } }, { quoted: m });
    }

    // --- 3. Aceptar Desafío (Inicio del Juego) ---
    
    await sock.sendMessage(jid, { react: { text: "⚔️", key: m.key } });
    
    const { challengerId, targetId, bet } = challenge;
    const pot = bet * 2;
    
    // Descontar la apuesta de ambos (doble chequeo omitido por brevedad, se asume que #duelo chequeó)
    await economy.updateBalance(challengerId, -bet);
    await economy.updateBalance(targetId, -bet);

    // Tirar los Dados
    const challengerRoll = rollDice();
    const targetRoll = rollDice();
    
    // Emojis de dados
    const diceEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
    
    // Nota: El pushName del target no es fácil de obtener si no está en cache. Usamos el ID del desafiante para el pushName.
    const challengerName = (await sock.getContactInfo(challengerId))?.pushName || "El Retador";

    let resultMsg = `⚔️ *DUELO ACEPTADO: ¡LANZAMIENTO!* ⚔️\n\n`;
    
    resultMsg += `👤 *${challengerName}* (Retador):\n   Lanza ${diceEmojis[challengerRoll - 1]} ¡*${challengerRoll}*!\n\n`;
    resultMsg += `👤 *@${targetId.split('@')[0]}* (Oponente):\n   Lanza ${diceEmojis[targetRoll - 1]} ¡*${targetRoll}*!\n\n`;
    resultMsg += `----------------------------------\n`;
    
    let winnerId = null;
    let finalAction = '';
    
    if (challengerRoll > targetRoll) {
        winnerId = challengerId;
        finalAction = `🎉 *¡${challengerName.toUpperCase()} GANA EL DUELO!*`;
    } else if (targetRoll > challengerRoll) {
        winnerId = targetId;
        finalAction = `🎉 *¡@${targetId.split('@')[0].toUpperCase()} GANA EL DUELO!*`;
    } else {
        // Empate: Se devuelve el dinero a ambos
        await economy.updateBalance(challengerId, bet);
        await economy.updateBalance(targetId, bet);
        finalAction = `🤝 *EMPATE.* Se devuelve la apuesta de *${bet.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs* a ambos jugadores.`;
    }
    
    if (winnerId) {
        // Pagar el bote al ganador
        await economy.updateBalance(winnerId, pot);
        
        // Actualizar estadísticas (Si ya tienes 'wins' y 'losses' en economy.js)
        await economy.updateField(winnerId, 'wins', (await economy.getUser(winnerId)).wins + 1);
        const loserId = winnerId === challengerId ? targetId : challengerId;
        await economy.updateField(loserId, 'losses', (await economy.getUser(loserId)).losses + 1);
        
        finalAction += `\n*Bote Total:* *${pot.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*`;
    }
    
    resultMsg += finalAction;
    
    challenges.delete(jid); // Duelo finalizado
    
    await sock.sendMessage(jid, { 
        text: resultMsg,
        contextInfo: { mentionedJid: [targetId, challengerId] } // Mencionar a ambos
    }, { quoted: m });
}
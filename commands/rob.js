import { economy } from '../services/economy.js';

const MIN_ROB_AMOUNT = 50; // Cantidad mínima que se puede apostar/robar
const MAX_ROB_PERCENT = 0.10; // Máximo 10% del saldo del objetivo
const BASE_SUCCESS_CHANCE = 0.40; // 40% de probabilidad base de éxito
const COOLDOWN_TIME = 15 * 60 * 1000; // 15 minutos de cooldown por usuario

// Mapa para gestionar el cooldown del comando de robo
const robCooldowns = new Map();

/**
 * Comando de Robo/Ataque. Permite al usuario robar un porcentaje del saldo de otro.
 * Uso: #rob @usuario
 */
export async function robCommand(sock, m) {
    const jid = m.key.remoteJid;
    const attackerId = m.key.participant || m.sender;
    
    // Identificar al objetivo (mention/quoted)
    let targetId = null;
    
    // 1. Obtener la mención
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        targetId = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    
    if (!targetId) {
        return sock.sendMessage(jid, { 
            text: '❌ *Uso correcto:* Menciona al usuario que deseas robar con *#rob @usuario*' 
        }, { quoted: m });
    }

    // Comprobación de sí mismo
    if (targetId === attackerId) {
        return sock.sendMessage(jid, { text: "🤦‍♂️ No puedes robarte a ti mismo, eso es solo mover dinero de una mano a otra." }, { quoted: m });
    }
    
    // Comprobación de bot (asumiendo que el JID del bot está en m.key.remoteJid si es privado, pero en grupos m.participant es mejor)
    // Para simplificar, asumiremos que si el ID termina en s.whatsapp.net y no es el atacante, es un objetivo válido.
    
    await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

    // 2. Cooldown
    const lastRob = robCooldowns.get(attackerId);
    const now = Date.now();
    if (lastRob && (now - lastRob) < COOLDOWN_TIME) {
        const remaining = COOLDOWN_TIME - (now - lastRob);
        const minutes = Math.ceil(remaining / (60 * 1000));
        await sock.sendMessage(jid, { react: { text: "⏰", key: m.key } });
        return sock.sendMessage(jid, { text: `🚨 Debes esperar *${minutes} minuto(s)* antes de intentar otro robo.` }, { quoted: m });
    }

    try {
        const targetAccount = await economy.getUser(targetId);
        const attackerAccount = await economy.getUser(attackerId);
        
        // 3. Validar cuentas y saldo del objetivo
        if (targetAccount.money < MIN_ROB_AMOUNT) {
            return sock.sendMessage(jid, { text: `🛡️ El usuario objetivo tiene menos de ${MIN_ROB_AMOUNT} Bs. ¡No vale la pena el riesgo!` }, { quoted: m });
        }

        // 4. Lógica de éxito/fracaso
        const successChance = BASE_SUCCESS_CHANCE; // 40%
        const isSuccess = Math.random() < successChance;
        let finalMessage = ``;
        
        // Registrar el intento (Covers both success and failure)
        robCooldowns.set(attackerId, now);

        if (isSuccess) {
            // Robo exitoso
            const maxRob = Math.floor(targetAccount.money * MAX_ROB_PERCENT);
            // La cantidad robada se toma entre el mínimo y el máximo permitido
            const stolenAmount = Math.max(MIN_ROB_AMOUNT, Math.min(maxRob, Math.floor(targetAccount.money * Math.random() * MAX_ROB_PERCENT)));

            // Transferencia de saldo
            await economy.updateBalance(targetId, -stolenAmount);
            await economy.updateBalance(attackerId, stolenAmount);
            
            finalMessage = `💰 *¡ROBO EXITOSO!* 🏃‍♂️💨\n\n` +
                           `Has logrado robar *${stolenAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs* del saldo del objetivo.\n\n` +
                           `*Tu nuevo saldo:* ${(attackerAccount.money + stolenAmount).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`;

            await sock.sendMessage(jid, { react: { text: "💸", key: m.key } });
        } else {
            // Fracaso (Atacante pierde dinero por ser atrapado o fallar)
            // Penalización: 5% del saldo del atacante
            const penaltyAmount = Math.floor(attackerAccount.money * 0.05);
            const loss = Math.max(MIN_ROB_AMOUNT, penaltyAmount); 
            
            await economy.updateBalance(attackerId, -loss);
            
            finalMessage = `🚨 *¡FUISTE ATRAPADO!* 🚓\n\n` +
                           `Fallaste en el intento de robo. Tuviste que pagar una fianza de *${loss.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs* para evitar la cárcel.\n\n` +
                           `*Tu nuevo saldo:* ${(attackerAccount.money - loss).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`;

            await sock.sendMessage(jid, { react: { text: "🚓", key: m.key } });
        }
        
        await sock.sendMessage(jid, { text: finalMessage }, { quoted: m });
        
    } catch (error) {
        console.error('Error en robCommand:', error);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { text: "❌ Ocurrió un error en el sistema de robo." }, { quoted: m });
    }
}
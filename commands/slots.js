import { economy } from '../services/economy.js';

// Definición de los símbolos y sus probabilidades/pagos (8 Símbolos)
const WEIGHTED_SYMBOLS = [
    { emoji: '💩', weight: 30, multiplier: 0.0, name: 'Caca' }, // Antes 35, ahora 30 (Menos chances de perder)
    { emoji: '🍇', weight: 28, multiplier: 1.0, name: 'Uvas' }, // Antes 25, ahora 28 (Más chances de doble bajo)
    { emoji: '🍋', weight: 18, multiplier: 1.5, name: 'Limón' }, // Antes 15, ahora 18 (Más chances de doble medio)
    { emoji: '🍉', weight: 10, multiplier: 2.0, name: 'Sandía' }, 
    { emoji: '🔔', weight: 7, multiplier: 3.0, name: 'Campana' }, 
    { emoji: '🍒', weight: 4, multiplier: 4.0, name: 'Cerezas' }, // Antes 5, ahora 4 (Ajuste para total 100)
    { emoji: '💰', weight: 2, multiplier: 8.0, name: 'Bolsa' }, 
    { emoji: '7️⃣', weight: 1, multiplier: 20.0, name: 'Siete' } // Jackpot Alto
]; // El peso total es 100

// Genera un array de 100 items ponderados para un sorteo justo
const SLOT_ITEMS = WEIGHTED_SYMBOLS.flatMap(s => Array(s.weight).fill(s.emoji)); 

// Función principal para girar los tres rodillos
function spinSlots() {
    const results = [
        SLOT_ITEMS[Math.floor(Math.random() * SLOT_ITEMS.length)],
        SLOT_ITEMS[Math.floor(Math.random() * SLOT_ITEMS.length)],
        SLOT_ITEMS[Math.floor(Math.random() * SLOT_ITEMS.length)]
    ];
    return results;
}

/**
 * Tragamonedas de tres rodillos. Uso: #slots [apuesta]
 */
export async function slotsCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    const sender = m.sender;
    
    // --- 1. Validar Apuesta ---
    const betAmount = parseInt(args[0]);
    if (isNaN(betAmount) || betAmount < 10) {
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        return sock.sendMessage(jid, { 
            text: '❌ *Uso correcto:* *#slots [apuesta]*\n(Apuesta mínima: 10 Bs)' 
        }, { quoted: m });
    }
    
    await sock.sendMessage(jid, { react: { text: "🎰", key: m.key } });

    const userAccount = await economy.getUser(sender);
    if (userAccount.money < betAmount) {
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        return sock.sendMessage(jid, { text: `❌ Saldo insuficiente. Necesitas *${betAmount.toLocaleString('es-VE')} Bs*.` }, { quoted: m });
    }

    // --- 2. Proceso de Juego y Pago ---
    
    // Descontar la apuesta antes de girar
    await economy.updateBalance(sender, -betAmount); 

    const [r1, r2, r3] = spinSlots();
    let multiplier = 0;
    let winType = '😭 Sin Coincidencia';

    // 1. Triple Coincidencia
    if (r1 === r2 && r2 === r3) {
        const symbolData = WEIGHTED_SYMBOLS.find(s => s.emoji === r1);
        multiplier = symbolData ? symbolData.multiplier * 5 : 0; // Jackpot x5
        winType = `💰 ¡JACKPOT! Triple ${symbolData.name}`;
    } 
    // 2. Doble Coincidencia
    else {
        const results = [r1, r2, r3];
        // Contar las ocurrencias de cada símbolo
        const counts = {};
        results.forEach(x => { counts[x] = (counts[x] || 0) + 1; });

        let winningEmoji = null;
        
        // Buscar el símbolo que aparece exactamente 2 veces
        for (const emoji in counts) {
            if (counts[emoji] === 2) {
                winningEmoji = emoji;
                break;
            }
        }
        
        if (winningEmoji) {
            const symbolData = WEIGHTED_SYMBOLS.find(s => s.emoji === winningEmoji);
            // Multiplicador: 2.5x el multiplicador base del símbolo
            multiplier = symbolData ? symbolData.multiplier * 2.5 : 0; 
            winType = `✨ Coincidencia Doble - Doble ${symbolData.name}`;
        }
    }
    
    // 3. Generar y enviar mensaje (Mensaje limpio y profesional, sin saldo final)
    let finalMessage = `🎰 *Tragamonedas* 🎰\n`;
    finalMessage += `\n— — — — — — —\n`;
    finalMessage += `   ${r1} | ${r2} | ${r3}\n`; 
    finalMessage += `— — — — — — —\n\n`;

    if (multiplier > 0) {
        const netGain = Math.floor(betAmount * multiplier); 
        const totalPayout = betAmount + netGain; // Devuelve la apuesta inicial + ganancia neta
        
        await economy.updateBalance(sender, totalPayout); 
        
        finalMessage += `${winType}\n`;
        finalMessage += `*Monto Ganado (Neto):* *${netGain.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*\n`;
        finalMessage += `🎉 ¡Felicidades! Se ha acreditado la ganancia.`;

        await sock.sendMessage(jid, { react: { text: "🤑", key: m.key } });
    } else {
        finalMessage += `😭 *¡FALLASTE!* 😭\n`;
        finalMessage += `*Monto Perdido:* *${betAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*\n`;
        finalMessage += `¡Mejor suerte la próxima!`;

        await sock.sendMessage(jid, { react: { text: "😭", key: m.key } });
    }

    await sock.sendMessage(jid, { text: finalMessage }, { quoted: m });
}
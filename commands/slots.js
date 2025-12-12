import { economy } from '../services/economy.js';

// Definición de los símbolos y sus probabilidades/pagos (8 Símbolos)
const WEIGHTED_SYMBOLS = [
    { emoji: '💩', weight: 35, multiplier: 0.0, name: 'Caca' }, // Alta probabilidad de pérdida (no paga)
    { emoji: '🍇', weight: 25, multiplier: 1.0, name: 'Uvas' }, 
    { emoji: '🍋', weight: 15, multiplier: 1.5, name: 'Limón' }, 
    { emoji: '🍉', weight: 10, multiplier: 2.0, name: 'Sandía' }, 
    { emoji: '🔔', weight: 7, multiplier: 3.0, name: 'Campana' }, 
    { emoji: '🍒', weight: 5, multiplier: 4.0, name: 'Cerezas' }, 
    { emoji: '💰', weight: 2, multiplier: 8.0, name: 'Bolsa' }, 
    { emoji: '7️⃣', weight: 1, multiplier: 20.0, name: 'Siete' } // Jackpot Alto (1% de probabilidad por rodillo)
];

// Genera un array de 100 items ponderados para un sorteo justo
const SLOT_ITEMS = WEIGHTED_SYMBOLS.flatMap(s => Array(s.weight).fill(s.emoji)); 

// Función principal para girar los tres rodillos (usa el nuevo SLOT_ITEMS)
function spinSlots() {
    const items = SLOT_ITEMS;
    const results = [
        items[Math.floor(Math.random() * items.length)],
        items[Math.floor(Math.random() * items.length)],
        items[Math.floor(Math.random() * items.length)]
    ];
    return results;
}

/**
 * Tragamonedas de tres rodillos. Uso: #slots [apuesta]
 */
export async function slotsCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    // Asegurarse de que el sender use el JID del participante para la economía
    const sender = m.key.participant || m.sender;
    
    // Validar apuesta
    const betAmount = parseInt(args[0]);
    
    if (isNaN(betAmount) || betAmount < 20) {
        return sock.sendMessage(jid, { 
            text: "❌ *Uso correcto:* #slots [monto]\nLa apuesta mínima es de *20 Bs*." 
        }, { quoted: m });
    }

    // 1. Verificar y descontar saldo
    await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });
    const user = await economy.getUser(sender);
    
    if (user.money < betAmount) {
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        return sock.sendMessage(jid, { text: `❌ *Saldo insuficiente.*\n💰 Tu cuenta: *${user.money.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*` }, { quoted: m });
    }

    // Descontar apuesta inmediatamente
    await economy.updateBalance(sender, -betAmount);
    
    // 2. Girar y evaluar
    const results = spinSlots();
    const [r1, r2, r3] = results;
    
    const counts = {};
    results.forEach(r => counts[r] = (counts[r] || 0) + 1);
    
    let multiplier = 0;
    let winType = '';
    
    // Evaluar ganancias
    if (counts[r1] === 3) { // Jackpot! Triple Coincidencia
        const symbolData = WEIGHTED_SYMBOLS.find(s => s.emoji === r1);
        multiplier = symbolData ? symbolData.multiplier * 20 : 0; // Multiplicador x20 (Jackpot)
        winType = `🔥 *JACKPOT* - Triple ${symbolData.name}`;
    } else if (counts[r1] === 2 || counts[r2] === 2) { // Doble Coincidencia
        const winningEmoji = counts[r1] === 2 ? r1 : r2;
        const symbolData = WEIGHTED_SYMBOLS.find(s => s.emoji === winningEmoji);
        multiplier = symbolData ? symbolData.multiplier * 2.5 : 0; // Multiplicador x2.5 (Doble)
        winType = `✨ Coincidencia Doble - Doble ${symbolData.name}`;
    }
    
    // 3. Generar y enviar mensaje (Mensaje limpio y profesional, sin saldo final)
    let finalMessage = `🎰 *Resultado de Tragamonedas* 🎰\n`;
    finalMessage += `\n— — — — — — —\n`;
    finalMessage += `   ${r1} | ${r2} | ${r3}\n`; 
    finalMessage += `— — — — — — —\n\n`;

    if (multiplier > 0) {
        const netGain = Math.floor(betAmount * multiplier); 
        const totalPayout = betAmount + netGain; 
        
        await economy.updateBalance(sender, totalPayout); 
        
        finalMessage += `${winType}\n`;
        finalMessage += `*Monto Ganado (Neto):* *${netGain.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*\n`;
        finalMessage += `🎉 ¡Felicidades! Se ha acreditado la ganancia.`;

        await sock.sendMessage(jid, { react: { text: "🤑", key: m.key } });
    } else {
        finalMessage += `😭 *¡FALLASTE!* 😭\n`;
        finalMessage += `Perdiste tu apuesta de *${betAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*.`;

        await sock.sendMessage(jid, { react: { text: "😢", key: m.key } });
    }
    
    // Solo el resultado, sin el saldo final
    await sock.sendMessage(jid, { text: finalMessage }, { quoted: m });
}
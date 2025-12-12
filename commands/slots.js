import { economy } from '../services/economy.js';

// Definición de los símbolos y sus pagos
const SYMBOLS = [
    { emoji: '🍇', multiplier: 1 }, // Uvas (paga poco)
    { emoji: '🍉', multiplier: 1.5 }, // Sandías
    { emoji: '🔔', multiplier: 2 }, // Campana
    { emoji: '🍒', multiplier: 3 }, // Cerezas
    { emoji: '7️⃣', multiplier: 5 }  // Siete (el Jackpot)
];

const SLOT_ITEMS = SYMBOLS.flatMap(s => Array(10 - s.multiplier * 2).fill(s.emoji)); // Distribuye la probabilidad
// Ejemplo: 7️⃣ aparece menos veces que 🍇

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
 * Pago: x3 (triple), x2 (doble), x0 (nada)
 */
export async function slotsCommand(sock, m, args) {
    const jid = m.key.remoteJid;
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
        return sock.sendMessage(jid, { text: `❌ *Saldo insuficiente.*\n💰 Tu cuenta: *${user.money} Bs*` }, { quoted: m });
    }

    // Descontar apuesta inmediatamente
    await economy.updateBalance(sender, -betAmount);
    
    // 2. Girar y evaluar
    const results = spinSlots();
    const [r1, r2, r3] = results;
    
    // Contar ocurrencias de cada símbolo
    const counts = {};
    results.forEach(r => counts[r] = (counts[r] || 0) + 1);
    
    let multiplier = 0;
    let winType = '';
    let winningSymbol = '';

    // Evaluar ganancias
    if (counts[r1] === 3) { // Jackpot! Triple Coincidencia
        winningSymbol = r1;
        const symbolData = SYMBOLS.find(s => s.emoji === r1);
        multiplier = symbolData ? symbolData.multiplier * 15 : 10; // Jackpot paga mucho (x15 base)
        winType = `🔥 *JACKPOT* (${r1} x3)`;
    } else if (counts[r1] === 2 || counts[r2] === 2) { // Doble Coincidencia
        winningSymbol = counts[r1] === 2 ? r1 : r2;
        const symbolData = SYMBOLS.find(s => s.emoji === winningSymbol);
        multiplier = symbolData ? symbolData.multiplier * 3 : 2; // Doble paga (x3 base)
        winType = `✨ Coincidencia Doble (${winningSymbol} x2)`;
    }
    // Si multiplier sigue siendo 0, es pérdida.
    
    // 3. Generar y enviar mensaje
    let finalMessage = `🎰 *TRAGAMONEDAS* 🎰\n\n`;
    finalMessage += `_Apuesta: ${betAmount} Bs_\n\n`;
    finalMessage += `   ${r1} | ${r2} | ${r3}\n\n`;

    let earnings = 0;

    if (multiplier > 0) {
        earnings = betAmount * (multiplier + 1); // +1 para devolver la apuesta inicial
        await economy.updateBalance(sender, earnings); 
        
        const netGain = earnings - betAmount;

        finalMessage += `${winType}\n`;
        finalMessage += `🎉 *¡GANASTE ${netGain.toLocaleString('es-VE')} Bs!*`;

        await sock.sendMessage(jid, { react: { text: "🤑", key: m.key } });
    } else {
        finalMessage += `😭 *¡FALLASTE!* 😭\n`;
        finalMessage += `Perdiste tus *${betAmount} Bs*.`;

        await sock.sendMessage(jid, { react: { text: "😢", key: m.key } });
    }
    
    const newBalance = (await economy.getUser(sender)).money;
    finalMessage += `\n\n💰 Saldo Actual: *${newBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*`;

    await sock.sendMessage(jid, { text: finalMessage }, { quoted: m });
}
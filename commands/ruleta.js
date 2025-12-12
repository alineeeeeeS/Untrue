import { economy } from '../services/economy.js';

// Define las casillas de la ruleta: [Número, Color, Tipo]
const ROULETTE_WHEEL = [
    [0, 'verde', 'cero'], [1, 'rojo', 'impar'], [2, 'negro', 'par'], [3, 'rojo', 'impar'],
    [4, 'negro', 'par'], [5, 'rojo', 'impar'], [6, 'negro', 'par'], [7, 'rojo', 'impar'],
    [8, 'negro', 'par'], [9, 'rojo', 'impar'], [10, 'negro', 'par'], [11, 'negro', 'impar'],
    [12, 'rojo', 'par'], [13, 'negro', 'impar'], [14, 'rojo', 'par'], [15, 'negro', 'impar'],
    [16, 'rojo', 'par'], [17, 'negro', 'impar'], [18, 'rojo', 'par'], [19, 'rojo', 'impar'],
    [20, 'negro', 'par'], [21, 'rojo', 'impar'], [22, 'negro', 'par'], [23, 'rojo', 'impar'],
    [24, 'negro', 'par'], [25, 'rojo', 'impar'], [26, 'negro', 'par'], [27, 'rojo', 'impar'],
    [28, 'negro', 'par'], [29, 'negro', 'impar'], [30, 'rojo', 'par'], [31, 'negro', 'impar'],
    [32, 'rojo', 'par'], [33, 'negro', 'impar'], [34, 'rojo', 'par'], [35, 'negro', 'impar'],
    [36, 'rojo', 'par']
];

// Función para obtener la casilla ganadora
function spinWheel() {
    const index = Math.floor(Math.random() * ROULETTE_WHEEL.length);
    const [number, color, type] = ROULETTE_WHEEL[index];
    
    // Retorna el objeto del resultado
    return { number, color, type };
}

/**
 * Ruleta simple. Uso: #ruleta [apuesta] [tipo: color|numero|par/impar]
 * Ejemplo: #ruleta 50 rojo
 * #ruleta 200 13
 */
export async function ruletaCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    const sender = m.key.participant || m.sender;
    
    // Validar argumentos
    if (args.length < 2) {
        return sock.sendMessage(jid, { 
            text: '❌ *Uso correcto:*\n▸ #ruleta [monto] [rojo/negro/par/impar/0-36]\n\nEjemplos:\n*#ruleta 50 rojo*\n*#ruleta 200 13*' 
        }, { quoted: m });
    }

    const betAmount = parseInt(args[0]);
    let userBet = args[1].toLowerCase();
    
    if (isNaN(betAmount) || betAmount < 10) {
        return sock.sendMessage(jid, { text: "❌ La apuesta mínima es de *10 Bs*." }, { quoted: m });
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
    
    // 2. Definir multiplicador (pago) y tipo de apuesta
    let multiplier = 0;
    let betType = '';

    if (['rojo', 'negro'].includes(userBet)) {
        multiplier = 2; // Paga 2:1 (Recibes el doble de lo apostado, incluyendo la apuesta)
        betType = `Color ${userBet.toUpperCase()}`;
    } else if (['par', 'impar'].includes(userBet)) {
        multiplier = 2; // Paga 2:1
        betType = `Resultado ${userBet.toUpperCase()}`;
    } else if (userBet === '0' || (parseInt(userBet) >= 1 && parseInt(userBet) <= 36)) {
        multiplier = 35; // Paga 35:1 (Pagas 36, incluyendo la apuesta devuelta)
        betType = `Número ${userBet}`;
    } else {
        // Devolver apuesta si el formato de apuesta es inválido
        await economy.updateBalance(sender, betAmount);
        await sock.sendMessage(jid, { react: { text: "❓", key: m.key } });
        return sock.sendMessage(jid, { text: "❌ Apuesta inválida. Apuesta a *rojo*, *negro*, *par*, *impar* o un *número del 0 al 36*." }, { quoted: m });
    }

    // 3. Girar la Ruleta
    const result = spinWheel();
    const resultNumber = result.number;
    const resultColor = result.color;
    const resultType = result.type;
    
    // --- Lógica de la Ganancia ---
    let won = false;
    let reason = '';

    // Apuesta a color
    if (['rojo', 'negro'].includes(userBet) && userBet === resultColor) {
        won = true;
        reason = `¡Acertaste el color ${resultColor.toUpperCase()}!`;
    } 
    // Apuesta a par/impar
    else if (['par', 'impar'].includes(userBet) && userBet === resultType) {
        won = true;
        reason = `¡Acertaste ${resultType.toUpperCase()}!`;
    } 
    // Apuesta a número (incluyendo 0)
    else if (userBet === resultNumber.toString()) {
        won = true;
        reason = `¡ACERTASTE EL NÚMERO ${resultNumber}!`;
    }
    
    // 4. Calcular y pagar / informar pérdida
    let finalMessage = ``;
    let earnings = 0;
    
    // Iconos de color
    const colorEmoji = resultColor === 'rojo' ? '🔴' : resultColor === 'negro' ? '⚫' : '🟢';

    if (won) {
        // Multiplicador incluye la devolución de la apuesta inicial.
        earnings = betAmount * multiplier;
        await economy.updateBalance(sender, earnings); 
        
        finalMessage = `🎉 *¡GANASTE!* 🎉\n\n` +
                       `Tu Apuesta: *${betAmount} Bs* a ${betType}\n` +
                       `Resultado: *${colorEmoji} ${resultNumber}* (${resultColor.toUpperCase()})\n\n` +
                       `Recibes: *${earnings} Bs* (Ganancia neta: ${earnings - betAmount} Bs)`;

        await sock.sendMessage(jid, { react: { text: "💰", key: m.key } });
    } else {
        finalMessage = `❌ *PERDISTE* ❌\n\n` +
                       `Tu Apuesta: *${betAmount} Bs* a ${betType}\n` +
                       `Resultado: *${colorEmoji} ${resultNumber}* (${resultColor.toUpperCase()})\n\n` +
                       `¡Mejor suerte la próxima!`;

        await sock.sendMessage(jid, { react: { text: "😭", key: m.key } });
    }
    
    const newBalance = (await economy.getUser(sender)).money;
    finalMessage += `\n\n💰 Saldo Actual: *${newBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*`;

    await sock.sendMessage(jid, { text: finalMessage }, { quoted: m });
}
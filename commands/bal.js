import { economy } from '../services/economy.js';

export async function balCommand(sock, m) {
    const jid = m.key.remoteJid;
    const sender = m.sender;
    
    await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });
    
    try {
        const user = await economy.getUser(sender);
        
        const message = `🏦 *TU CUENTA DE BANCO*\n\n` +
                        `👤 Usuario: ${m.pushName || "Desconocido"}\n` +
                        `💰 Saldo Disponible: *${user.money.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*\n\n` +
                        `📈 Victorias (BJ): ${user.wins}\n` +
                        `📉 Derrotas (BJ): ${user.losses}`;

        await sock.sendMessage(jid, { react: { text: "💰", key: m.key } });
        await sock.sendMessage(jid, { text: message }, { quoted: m });
        
    } catch (error) {
        console.error('Error en balCommand:', error);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { text: "❌ Ocurrió un error al consultar tu saldo. Intenta más tarde." }, { quoted: m });
    }
}
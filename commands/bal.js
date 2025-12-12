import { economy } from '../services/economy.js';

export async function balCommand(sock, m) {
    const jid = m.key.remoteJid;
    // Asegurarse de que el sender use el JID del participante para la economía
    const sender = m.key.participant || m.sender; 
    
    await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });
    
    try {
        const user = await economy.getUser(sender);
        
        const message = `🏦 *ESTADO DE CUENTA*\n\n` + 
                        `👤 *Usuario:* ${m.pushName || "Desconocido"}\n` +
                        `💰 Saldo Disponible: *${user.money.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*\n\n` +
                        `▸ Usa *#perfil* para ver tus estadísticas de juego.`; 

        await sock.sendMessage(jid, { react: { text: "💰", key: m.key } });
        await sock.sendMessage(jid, { text: message }, { quoted: m });
        
    } catch (error) {
        console.error('Error en balCommand:', error);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { text: "❌ Ocurrió un error al consultar tu saldo. Intenta más tarde." }, { quoted: m });
    }
}
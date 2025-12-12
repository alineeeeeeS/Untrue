import { economy } from '../services/economy.js';

const REWARD = 200;
const COOLDOWN_TIME = 24 * 60 * 60 * 1000; // 24 horas

export async function dailyCommand(sock, m) {
    const jid = m.key.remoteJid;
    const sender = m.sender;
    
    await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });
    
    try {
        const user = await economy.getUser(sender);
        const now = Date.now();
        
        const lastDailyTimestamp = new Date(user.lastDaily).getTime();

        if (now - lastDailyTimestamp < COOLDOWN_TIME) {
            const remaining = COOLDOWN_TIME - (now - lastDailyTimestamp);
            
            // Convertir milisegundos restantes a horas y minutos
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            
            let timeRemaining = '';
            if (hours > 0) timeRemaining += `${hours} hora${hours > 1 ? 's' : ''}`;
            if (minutes > 0) timeRemaining += `${hours > 0 ? ' y ' : ''}${minutes} minuto${minutes > 1 ? 's' : ''}`;
            
            await sock.sendMessage(jid, { react: { text: "⏰", key: m.key } });
            return sock.sendMessage(jid, { text: `⏳ Ya reclamaste tu bono. Vuelve en *${timeRemaining.trim()}* para recibir *${REWARD} Bs*.` }, { quoted: m });
        }

        // 1. Acreditar recompensa
        const newBalance = await economy.updateBalance(sender, REWARD);
        
        // 2. Actualizar tiempo del último reclamo
        await economy.updateField(sender, 'lastDaily', now);

        await sock.sendMessage(jid, { react: { text: "🎁", key: m.key } });
        await sock.sendMessage(jid, { text: `🎁 *BONO DIARIO*\n\nHas recibido *${REWARD} Bs*.\n💰 Nuevo Saldo: *${newBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*` }, { quoted: m });

    } catch (error) {
        console.error('Error en dailyCommand:', error);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { text: "❌ Ocurrió un error al reclamar tu bono. Intenta más tarde." }, { quoted: m });
    }
}
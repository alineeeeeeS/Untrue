import { economy } from '../services/economy.js';

/**
 * Comando de Pago/Transferencia. Permite transferir dinero a otro usuario.
 * Uso: #pay @usuario [monto]
 */
export async function payCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    const senderId = m.key.participant || m.sender;
    
    // 1. Identificar objetivo y monto
    let targetId = null;
    let amount = 0;
    
    // Si hay menciones, el objetivo es el mencionado
    if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        targetId = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
        amount = parseInt(args[args.length - 1]); // El monto debe ser el último argumento
    } 
    
    // Validaciones de formato
    if (!targetId || isNaN(amount) || amount <= 0) {
        return sock.sendMessage(jid, { 
            text: '❌ *Uso correcto:* Menciona al usuario y la cantidad.\nEjemplo: *#pay @usuario 150*' 
        }, { quoted: m });
    }

    // Comprobación de sí mismo
    if (targetId === senderId) {
        return sock.sendMessage(jid, { text: "🤦‍♂️ No puedes pagarte a ti mismo, usa #bal para ver tu saldo." }, { quoted: m });
    }
    
    await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

    try {
        const senderAccount = await economy.getUser(senderId);
        
        // 2. Verificar saldo
        if (senderAccount.money < amount) {
            await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
            return sock.sendMessage(jid, { 
                text: `❌ *Saldo insuficiente.*\n💰 Tu cuenta: *${senderAccount.money.toLocaleString('es-VE')} Bs*` 
            }, { quoted: m });
        }

        // 3. Ejecutar Transferencia (Descontar del remitente y acreditar al objetivo)
        await economy.updateBalance(senderId, -amount); // Descontar
        await economy.updateBalance(targetId, amount);   // Acreditar (getUser lo crea si no existe)

        const newBalance = (await economy.getUser(senderId)).money;

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });
        await sock.sendMessage(jid, { 
            text: `✅ *TRANSFERENCIA EXITOSA*\n\n` +
                  `Has transferido *${amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs* al usuario mencionado.\n\n` +
                  `💰 Tu nuevo saldo: *${newBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs*`
        }, { quoted: m });
        
    } catch (error) {
        console.error('Error en payCommand:', error);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { text: "❌ Ocurrió un error al procesar la transferencia." }, { quoted: m });
    }
}
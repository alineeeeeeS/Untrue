/**
 * Función para mencionar a todos los miembros del grupo
 */
export async function todosCommand(sock, m, args) {
    try {
        const jid = m.key.remoteJid;

        // Verificar que el comando se ejecute en un grupo
        if (!jid.endsWith('@g.us')) {
            await sock.sendMessage(
                jid,
                { 
                    text: `❌ *ESTE COMANDO SOLO FUNCIONA EN GRUPOS*` 
                },
                { quoted: m }
            );
            return;
        }

        // Obtener información del grupo
        const groupMetadata = await sock.groupMetadata(jid);
        const participants = groupMetadata.participants;

        // Filtrar solo a los usuarios (excluir bots si los hay)
        const users = participants.filter(p => !p.id.includes('@s.whatsapp.net') || !p.id.startsWith('0'));

        if (users.length === 0) {
            await sock.sendMessage(
                jid,
                { 
                    text: `❌ *NO SE ENCONTRARON USUARIOS EN EL GRUPO*` 
                },
                { quoted: m }
            );
            return;
        }

        // Crear las menciones
        let mentionText = `📢 *MENCIÓN GENERAL* 📢\n\n`;

        users.forEach((user, index) => {
            // Usar el nombre del participante o un nombre por defecto
            const userName = user.name || `Usuario ${index + 1}`;
            mentionText += `@${user.id.split('@')[0]} `; // Mención
        });

        mentionText += `\n\n👥 *Total: ${users.length} usuarios*`;

        // Preparar las menciones para el mensaje
        const mentionedJid = users.map(user => user.id);

        // Enviar el mensaje con menciones
        await sock.sendMessage(
            jid,
            { 
                text: mentionText,
                mentions: mentionedJid
            },
            { quoted: m }
        );

        console.log(`✅ Mención general enviada a ${users.length} usuarios en el grupo`);

    } catch (error) {
        console.error('❌ Error en todosCommand:', error);
        await sock.sendMessage(
            m.key.remoteJid,
            { 
                text: `❌ *ERROR*\n\nNo se pudo realizar la mención general.\nError: ${error.message}` 
            },
            { quoted: m }
        );
    }
}
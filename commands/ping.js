/**
 * Comando para medir la latencia (ping) del bot.
 * @param {import('@whiskeysockets/baileys').WASocket} sock 
 * @param {import('@whiskeysockets/baileys').WAMessage} m 
 */
export async function pingCommand(sock, m) {
    // 1. Tomamos el tiempo de inicio
    const startTime = Date.now();

    // 2. Enviamos el mensaje (así medimos el tiempo que tarda la API)
    const sentMsg = await sock.sendMessage(m.key.remoteJid, { text: 'Pong! 📡' }, { quoted: m });

    // 3. Calculamos la diferencia
    const endTime = Date.now();
    const pingTime = endTime - startTime;

    // 4. Editamos el mensaje original con el resultado
    await sock.sendMessage(m.key.remoteJid, { text: `Pong! 📡 Tiempo de respuesta: *${pingTime}ms*` }, { edit: sentMsg.key });
}
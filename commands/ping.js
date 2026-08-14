export async function pingCommand(sock, m) {
    const start = Date.now();
    const sent = await sock.sendMessage(m.key.remoteJid, { text: 'Pong...' }, { quoted: m });
    const ping = Date.now() - start;

    await sock.sendMessage(m.key.remoteJid, {
        text: `Pong — ${ping}ms`
    }, { edit: sent.key });
}

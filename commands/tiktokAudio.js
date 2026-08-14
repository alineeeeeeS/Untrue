import { downloadTiktokAudio, cleanUpFile } from '../services/tiktokDownloader.js';

export async function tiktokAudioCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    const url = args[0];
    let filePath = null;

    if (!url || !url.includes('tiktok.com')) {
        await sock.sendMessage(jid, {
            text: 'Uso: #tta [link]'
        }, { quoted: m });
        return;
    }

    try {
        const result = await downloadTiktokAudio(url);

        if (result?.error === 'FFMPEG_NOT_AVAILABLE') {
            await sock.sendMessage(jid, {
                text: 'FFmpeg no disponible. Usa #tt para descargar el video.'
            }, { quoted: m });
            return;
        }

        if (!result?.filePath) {
            throw new Error(result?.message || 'No se pudo extraer el audio');
        }

        filePath = result.filePath;
        const info = result.videoInfo || {};

        await sock.sendMessage(jid, {
            audio: { url: filePath },
            mimetype: 'audio/mpeg',
            ptt: false
        }, { quoted: m });

        if (info.author) {
            await sock.sendMessage(jid, {
                text: `*${info.author}*`
            }, { quoted: m });
        }

    } catch (error) {
        console.error('Error in tta:', error.message);
        await sock.sendMessage(jid, {
            text: `Error: ${error.message}`
        }, { quoted: m });
    } finally {
        cleanUpFile(filePath);
    }
}

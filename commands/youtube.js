import { downloadYoutubeVideo, cleanUpFile } from '../services/youtubeDownloader.js';
import fs from 'fs';

function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
        ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
        : `${m}:${s.toString().padStart(2, '0')}`;
}

export async function youtubeCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    let filePath = null;

    if (!args?.length) {
        await sock.sendMessage(jid, {
            text: 'Uso: #ytv [enlace] o #ytv [búsqueda]'
        }, { quoted: m });
        return;
    }

    try {
        await sock.sendMessage(jid, {
            text: 'Descargando video...'
        }, { quoted: m });

        const result = await downloadYoutubeVideo(args);

        if (!result?.filePath || !fs.existsSync(result.filePath)) {
            throw new Error('No se pudo descargar el video');
        }

        filePath = result.filePath;
        const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);
        const info = result.videoInfo || {};

        const caption =
            `*${info.title || 'Video'}*\n` +
            `Autor: ${info.author || 'Desconocido'}\n` +
            `Duración: ${formatDuration(info.duration)}\n` +
            `${sizeMB} MB`;

        await sock.sendMessage(jid, {
            video: fs.readFileSync(filePath),
            caption,
            mimetype: 'video/mp4'
        }, { quoted: m });

    } catch (error) {
        console.error('Error in ytv:', error.message);
        await sock.sendMessage(jid, {
            text: `Error: ${error.message}`
        }, { quoted: m });
    } finally {
        cleanUpFile(filePath);
    }
}

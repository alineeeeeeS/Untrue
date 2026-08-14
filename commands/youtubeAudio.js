import { downloadYoutubeAudio, cleanUpFile } from '../services/youtubeDownloader.js';
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

function getMimetype(ext) {
    const map = {
        m4a: 'audio/mp4',
        mp4: 'audio/mp4',
        mp3: 'audio/mpeg',
        webm: 'audio/webm',
        ogg: 'audio/ogg',
        aac: 'audio/aac'
    };
    return map[ext] || 'audio/mpeg';
}

export async function youtubeAudioCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    let filePath = null;

    if (!args?.length) {
        await sock.sendMessage(jid, {
            text: 'Uso: #yta [enlace] o #yta [búsqueda]'
        }, { quoted: m });
        return;
    }

    try {
        await sock.sendMessage(jid, {
            text: 'Descargando audio...'
        }, { quoted: m });

        const result = await downloadYoutubeAudio(args);

        if (!result?.filePath || !fs.existsSync(result.filePath)) {
            throw new Error('No se pudo descargar el audio');
        }

        filePath = result.filePath;
        const ext = filePath.split('.').pop().toLowerCase();
        const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);
        const info = result.videoInfo || {};

        const caption =
            `*${info.title || 'Audio'}*\n` +
            `Autor: ${info.author || 'Desconocido'}\n` +
            `Duración: ${formatDuration(info.duration)}\n` +
            `${sizeMB} MB`;

        await sock.sendMessage(jid, {
            audio: fs.readFileSync(filePath),
            mimetype: getMimetype(ext),
            fileName: `${(info.title || 'audio').substring(0, 40)}.${ext}`,
            ptt: false
        }, { quoted: m });

        await sock.sendMessage(jid, { text: caption }, { quoted: m });

    } catch (error) {
        console.error('Error in yta:', error.message);
        await sock.sendMessage(jid, {
            text: `Error: ${error.message}`
        }, { quoted: m });
    } finally {
        cleanUpFile(filePath);
    }
}

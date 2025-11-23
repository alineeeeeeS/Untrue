import { downloadYoutubeVideo, cleanUpFile } from '../services/youtubeDownloader.js';
import fs from 'fs';
import logger from '../services/logger.js';

const MAX_FILE_SIZE_WARNING_BYTES = 15 * 1024 * 1024; // 15MB

export async function youtubeCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!args || args.length === 0) {
        await sock.sendMessage(remoteJid, { 
            text: `❌ *COMANDO INVÁLID*\n\nUsa: #yt [enlace] o #yt [búsqueda]` 
        }, { quoted: m });
        return;
    }

    let filePath = null;

    try {
        await sock.sendPresenceUpdate('composing', remoteJid);
        logger.message(remoteJid, `#yt ${args.join(' ')}`, 'received');

        const downloadResult = await downloadYoutubeVideo(args);

        if (!downloadResult || !downloadResult.filePath) {
            await sock.sendMessage(remoteJid, { 
                text: `⚠️ *ERROR EN LA DESCARGA*\n\nNo se pudo descargar el video.` 
            }, { quoted: m });
            return;
        }

        filePath = downloadResult.filePath;
        const stats = fs.statSync(filePath);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

        // Construir caption
        const caption = `▶️ *VIDEO DE YOUTUBE*\n\n` +
                       `🎬 *Título:* ${downloadResult.videoInfo.title}\n` +
                       `👤 *Autor:* ${downloadResult.videoInfo.author}\n` +
                       `🕒 *Duración:* ${formatDuration(downloadResult.videoInfo.duration)}\n` +
                       `📅 *Subido:* ${downloadResult.videoInfo.uploadDate}\n\n` +
                       `✅ *Descargado en MP4*`;

        // Enviar video
        await sock.sendMessage(remoteJid, { 
            video: fs.readFileSync(filePath),
            caption: caption,
            mimetype: 'video/mp4'
        }, { quoted: m });

        // Log exitoso
        logger.command(remoteJid, 'yt', args, true, { 
            type: 'video',
            size: fileSizeMB,
            title: downloadResult.videoInfo.title
        });

        console.log(`✅ Video YouTube enviado: ${fileSizeMB} MB`);

    } catch (error) {
        logger.command(remoteJid, 'yt', args, false, error.message);
        logger.error('command', 'Error en youtube', { error: error.message });

        await sock.sendMessage(remoteJid, { 
            text: `❌ *ERROR*\n\n${error.message}` 
        }, { quoted: m });
    } finally {
        cleanUpFile(filePath);
        await sock.sendPresenceUpdate('available', remoteJid);
    }
}

function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
}
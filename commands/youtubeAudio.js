import { downloadYoutubeAudio, cleanUpFile } from '../services/youtubeDownloader.js';
import fetch from 'node-fetch';
import fs from 'fs';
import logger from '../services/logger.js';

/** Límite de tamaño para la ADVERTENCIA (15MB) */
const MAX_FILE_SIZE_WARNING_MB = 15;
const MAX_FILE_SIZE_WARNING_BYTES = MAX_FILE_SIZE_WARNING_MB * 1024 * 1024;

export async function youtubeAudioCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!args || args.length === 0) {
        await sock.sendMessage(remoteJid, { 
            text: `❌ *COMANDO INVÁLIDO*\n\nUsa: #ytaudio [enlace] o #ytaudio [búsqueda]` 
        }, { quoted: m });
        return;
    }

    let filePath = null;

    try {
        await sock.sendPresenceUpdate('composing', remoteJid);
        logger.message(remoteJid, `#ytaudio ${args.join(' ')}`, 'received');

        const downloadResult = await downloadYoutubeAudio(args);

        if (!downloadResult || !downloadResult.filePath) {
            await sock.sendMessage(remoteJid, { 
                text: `⚠️ *ERROR EN LA DESCARGA*\n\nNo se pudo descargar el audio. Verifica el enlace o intenta con otro video.\n\nPosibles soluciones:\n• El video puede ser muy largo\n• Problemas temporales de YouTube\n• Intenta con un video más corto` 
            }, { quoted: m });
            logger.command(remoteJid, 'ytaudio', args, false, 'No se pudo descargar el audio');
            return;
        }

        filePath = downloadResult.filePath;

        if (!fs.existsSync(filePath)) {
            throw new Error("Archivo de audio no encontrado después de la descarga");
        }

        const stats = fs.statSync(filePath);
        const fileLength = stats.size;
        const fileSizeMB = (fileLength / 1024 / 1024).toFixed(2);

        // Detectar formato del archivo
        const fileExtension = filePath.split('.').pop().toLowerCase();
        const mimetype = getMimetype(fileExtension);
        const formatName = getFormatName(fileExtension);

        // Construir caption
        const caption = `🎵 *AUDIO DE YOUTUBE*\n\n` +
                       `🎵 *Título:* ${downloadResult.videoInfo.title}\n` +
                       `👤 *Autor:* ${downloadResult.videoInfo.author}\n` +
                       `🕒 *Duración:* ${formatDuration(downloadResult.videoInfo.duration)}\n` +
                       `📅 *Subido:* ${downloadResult.videoInfo.uploadDate}\n` +
                       `📁 *Formato:* ${formatName}\n\n` +
                       `✅ *Audio extraído en alta calidad*`;

        // Obtener thumbnail si está disponible
        let thumbnailBuffer = null;
        if (downloadResult.videoInfo.thumbnail) {
            try {
                const response = await fetch(downloadResult.videoInfo.thumbnail);
                thumbnailBuffer = Buffer.from(await response.arrayBuffer());
            } catch (thumbnailError) {
                console.warn("No se pudo obtener thumbnail:", thumbnailError.message);
            }
        }

        // Advertencia de tamaño
        if (fileLength > MAX_FILE_SIZE_WARNING_BYTES) {
            console.warn(`⚠️ ADVERTENCIA: El archivo es de ${fileSizeMB} MB.`);
        }

        // Leer archivo de audio
        const audioBuffer = fs.readFileSync(filePath);

        // Preparar mensaje
        const audioMessage = { 
            audio: audioBuffer,
            mimetype: mimetype,
            fileName: `${downloadResult.videoInfo.title.substring(0, 50)}.${fileExtension}`,
            caption: caption
        };

        // Agregar thumbnail si está disponible
        if (thumbnailBuffer) {
            audioMessage.contextInfo = {
                externalAdReply: {
                    title: downloadResult.videoInfo.title.substring(0, 60),
                    body: downloadResult.videoInfo.author.substring(0, 40),
                    thumbnail: thumbnailBuffer,
                    sourceUrl: downloadResult.videoInfo.url || 'https://www.youtube.com',
                    mediaType: 1
                }
            };
        }

        // Enviar mensaje
        await sock.sendMessage(remoteJid, audioMessage, { quoted: m });

        // Log exitoso
        logger.command(remoteJid, 'ytaudio', args, true, { 
            type: 'audio',
            format: formatName,
            size: fileSizeMB,
            title: downloadResult.videoInfo.title
        });

        console.log(`✅ Audio YouTube enviado (${formatName}): ${fileSizeMB} MB`);

    } catch (error) {
        console.error('❌ Error en youtubeAudioCommand:', error);
        logger.command(remoteJid, 'ytaudio', args, false, error.message);

        await sock.sendMessage(remoteJid, { 
            text: `❌ *ERROR*\n\n${error.message}\n\nIntenta con un video más corto o verifica el enlace.` 
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

function getMimetype(extension) {
    const mimetypes = {
        'm4a': 'audio/mp4',
        'mp4': 'audio/mp4',
        'mp3': 'audio/mpeg',
        'webm': 'audio/webm',
        'ogg': 'audio/ogg',
        'aac': 'audio/aac'
    };
    return mimetypes[extension] || 'audio/mp4';
}

function getFormatName(extension) {
    const formats = {
        'm4a': 'M4A',
        'mp4': 'MP4',
        'mp3': 'MP3',
        'webm': 'WEBM',
        'ogg': 'OGG',
        'aac': 'AAC'
    };
    return formats[extension] || 'AUDIO';
}
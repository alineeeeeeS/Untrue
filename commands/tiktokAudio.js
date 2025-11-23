import { downloadTiktokAudio, cleanUpFile } from '../services/tiktokDownloader.js';

export async function tiktokAudioCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const url = args[0];

    if (!url || !url.includes('tiktok.com')) {
        await sock.sendMessage(remoteJid, { 
            text: `❌ *ENLACE INVÁLIDO*\n\nProporciona un enlace de TikTok válido.\n\nEjemplo: #ttaudio https://vm.tiktok.com/...` 
        }, { quoted: m });
        return;
    }

    let filePath = null;

    try {
        await sock.sendPresenceUpdate('composing', remoteJid);

        const downloadResult = await downloadTiktokAudio(url);

        // Manejar errores específicos
        if (downloadResult && downloadResult.error) {
            if (downloadResult.error === 'FFMPEG_NOT_AVAILABLE') {
                await sock.sendMessage(remoteJid, { 
                    text: `❌ *FUNCIONALIDAD NO DISPONIBLE*\n\nLa extracción de audio requiere FFmpeg, pero no está disponible en este momento.\n\nPuedes usar #tiktok para descargar el video completo con audio.` 
                }, { quoted: m });
                return;
            } else {
                await sock.sendMessage(remoteJid, { 
                    text: `❌ *ERROR EN EXTRACCIÓN*\n\nNo se pudo extraer el audio: ${downloadResult.message}` 
                }, { quoted: m });
                return;
            }
        }

        if (!downloadResult || !downloadResult.filePath) {
            await sock.sendMessage(remoteJid, { 
                text: `⚠️ *ERROR EN LA DESCARGA*\n\nNo se pudo procesar el audio. Intenta con otro video.` 
            }, { quoted: m });
            return;
        }

        filePath = downloadResult.filePath;
        const videoInfo = downloadResult.videoInfo || {};

        const caption = `🎵 *AUDIO EXTRAÍDO*\n\n👤 *Autor:* ${videoInfo.author || 'N/A'}\n📅 *Subido:* ${videoInfo.uploadDate || 'N/A'}\n\n✅ *Audio extraído del video*`;

        await sock.sendMessage(remoteJid, { 
            audio: { url: filePath }, 
            mimetype: 'audio/mpeg',
            caption: caption
        }, { quoted: m });

    } catch (error) {
        console.error("Error al enviar el audio:", error);
        await sock.sendMessage(remoteJid, { 
            text: `🔴 *ERROR INESPERADO*\n\nError: ${error.message}` 
        }, { quoted: m });
    } finally {
        cleanUpFile(filePath);
        await sock.sendPresenceUpdate('available', remoteJid);
    }
}
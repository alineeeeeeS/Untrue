import {
    downloadTiktokVideo,
    downloadTiktokImages,
    cleanUpFile,
    getTiktokVideoInfo
} from '../services/tiktokDownloader.js';
import { join } from 'path';
import { readdirSync, readFileSync } from 'fs';

function truncateWords(text, max = 15) {
    if (!text) return 'Sin descripción';
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= max) return text;
    return words.slice(0, max).join(' ') + '...';
}

function buildCaption(info) {
    const author = info?.author || 'N/A';
    const desc = info?.description || info?.title || '';
    return `*${author}*\n${truncateWords(desc)}`;
}

export async function tiktokCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    const url = args[0];
    let tempPath = null;

    if (!url || !url.includes('tiktok.com')) {
        await sock.sendMessage(jid, {
            text: 'Uso: #tt [link]'
        }, { quoted: m });
        return;
    }

    try {
        let info = await getTiktokVideoInfo(url);
        let isCarousel = info.isCarousel;
        let downloadResult = null;

        if (info.author === 'Autor desconocido' && !isCarousel) {
            downloadResult = await downloadTiktokImages(url);
            if (downloadResult?.filePaths) {
                isCarousel = true;
                info = downloadResult.videoInfo;
            }
        }

        if (isCarousel) {
            if (!downloadResult) {
                downloadResult = await downloadTiktokImages(url);
            }

            if (!downloadResult?.filePaths) {
                throw new Error('No se pudo descargar el carrusel');
            }

            tempPath = downloadResult.filePaths;
            info = downloadResult.videoInfo || info;

            const files = readdirSync(tempPath).filter(f => /\.(jpe?g|png)$/i.test(f));
            if (!files.length) throw new Error('No se encontraron imágenes');

            const caption = buildCaption(info);

            for (let i = 0; i < files.length; i++) {
                await sock.sendMessage(jid, {
                    image: readFileSync(join(tempPath, files[i])),
                    caption: i === 0 ? caption : undefined
                }, { quoted: m });
            }

        } else {
            downloadResult = await downloadTiktokVideo(url);

            if (!downloadResult?.filePath) {
                throw new Error('No se pudo descargar el video');
            }

            tempPath = downloadResult.filePath;
            const caption = buildCaption(downloadResult.videoInfo || info);

            await sock.sendMessage(jid, {
                video: { url: tempPath },
                caption,
                mimetype: 'video/mp4'
            }, { quoted: m });
        }

    } catch (error) {
        console.error('Error in tt:', error.message);
        await sock.sendMessage(jid, {
            text: `Error: ${error.message}`
        }, { quoted: m });
    } finally {
        cleanUpFile(tempPath);
    }
}

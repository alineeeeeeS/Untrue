import { downloadPinterestMedia, cleanUpPinterestFile } from '../services/pinterestDownloader.js';
import fs from 'fs';

export async function pinterestCommand(sock, m, args) {
    let downloadedFile = null;

    try {
        const jid = m.key.remoteJid;

        if (args.length === 0) {
            await sock.sendMessage(jid, { text: 'Uso correcto:\n#pin [link]' }, { quoted: m });
            return;
        }

        const url = args[0];

        if (!url.includes('pinterest.com') && !url.includes('pin.it')) {
            await sock.sendMessage(jid, { text: 'URL inválida. Solo soporta enlaces de Pinterest.' }, { quoted: m });
            return;
        }

        const result = await downloadPinterestMedia(url);
        downloadedFile = result;

        if (!result || !result.filePath) {
            throw new Error('No se pudo descargar el contenido');
        }

        if (result.isImage) {
            await sock.sendMessage(jid, {
                image: { url: result.filePath },
                caption: 'Pin descargado!'
            }, { quoted: m });
        } else if (result.isVideo) {
            await sock.sendMessage(jid, {
                video: { url: result.filePath },
                caption: 'Pin descargado!'
            }, { quoted: m });
        }

    } catch (error) {
        await sock.sendMessage(m.key.remoteJid, { text: `Error al descargar el pin: ${error.message}` }, { quoted: m });
    } finally {
        if (downloadedFile && downloadedFile.filePath) {
            cleanUpPinterestFile(downloadedFile.filePath);
        }
    }
}

import { downloadPinterestMedia, cleanUpPinterestFile } from '../services/pinterestDownloader.js';
import logger from '../services/logger.js';
import fs from 'fs';

export async function pinterestCommand(sock, m, args) {
    let downloadedFile = null;

    try {
        const jid = m.key.remoteJid;
        const user = m.pushName || 'Usuario';

        // Verificar si hay URL
        if (args.length === 0) {
            await sock.sendMessage(jid, {
                text: '📌 *Uso correcto:*\n`#pin [url_de_pinterest]`\n\n*Ejemplo:*\n`#pin https://pin.it/abc123`\n`#pin https://pinterest.com/pin/123456`'
            }, { quoted: m });
            return;
        }

        const url = args[0];

        // Validar que sea una URL de Pinterest
        if (!url.includes('pinterest.com') && !url.includes('pin.it')) {
            await sock.sendMessage(jid, {
                text: '❌ *URL inválida*\nSolo soporto enlaces de Pinterest (pinterest.com o pin.it)'
            }, { quoted: m });
            return;
        }

        logger.info('pinterest', `Iniciando descarga para ${user}`, { url, jid });

        // Descargar el contenido (SIN mensaje de procesamiento)
        const result = await downloadPinterestMedia(url);
        downloadedFile = result;

        if (!result || !result.filePath) {
            throw new Error('No se pudo descargar el contenido');
        }

        // Enviar el archivo SIN caption extenso, solo el mensaje simple
        if (result.isImage) {
            await sock.sendMessage(jid, {
                image: { url: result.filePath },
                caption: '✅ *Pin descargado!*'
            }, { quoted: m });
        } else if (result.isVideo) {
            await sock.sendMessage(jid, {
                video: { url: result.filePath },
                caption: '✅ *Pin descargado!*'
            }, { quoted: m });
        }

        logger.success('pinterest', `Descarga completada para ${user}`, {
            url,
            type: result.isImage ? 'image' : 'video',
            fileSize: result.filePath ? fs.statSync(result.filePath).size : 0,
            jid
        });

    } catch (error) {
        logger.error('pinterest', `Error en comando pin: ${error.message}`, {
            error: error.stack,
            user: m.pushName,
            jid: m.key.remoteJid
        });

        // Mensaje de error también simplificado
        await sock.sendMessage(m.key.remoteJid, {
            text: `❌ *Error al descargar el pin*\n\n${error.message}`
        }, { quoted: m });

    } finally {
        // Limpiar archivos temporales
        if (downloadedFile && downloadedFile.filePath) {
            cleanUpPinterestFile(downloadedFile.filePath);
        }
    }
}
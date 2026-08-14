import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, unlinkSync, existsSync } from 'fs';

const execPromise = promisify(exec);
const ytDlpCommand = '/usr/local/bin/yt-dlp';

function isValidFacebookUrl(url) {
    return /(https?:\/\/)?(www\.|web\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch|me)/i.test(url);
}

export async function facebookCommand(sock, m, args) {
    let tempFilePath = null;

    try {
        let fbUrl = args[0];

        if (!fbUrl && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedText = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation ||
                             m.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text;
            if (quotedText) {
                const urlMatch = quotedText.match(/https?:\/\/[^\s]+/g);
                if (urlMatch) {
                    for (const url of urlMatch) {
                        if (isValidFacebookUrl(url)) {
                            fbUrl = url;
                            break;
                        }
                    }
                }
            }
        }

        if (!fbUrl || !isValidFacebookUrl(fbUrl)) {
            await sock.sendMessage(m.key.remoteJid, {
                text: 'Uso correcto:\n#fb [link]'
            }, { quoted: m });
            return;
        }

        tempFilePath = join(tmpdir(), `facebook_video_${Date.now()}.mp4`);

        const downloadCommand = `"${ytDlpCommand}" -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best" --no-playlist --merge-output-format mp4 --max-filesize 100M --rm-cache-dir -o "${tempFilePath}" "${fbUrl}"`;

        await execPromise(downloadCommand, { timeout: 120000 });

        if (!existsSync(tempFilePath)) {
            throw new Error('yt-dlp no pudo generar el archivo de video.');
        }

        const videoBuffer = readFileSync(tempFilePath);

        await sock.sendMessage(m.key.remoteJid, {
            video: videoBuffer,
            caption: 'Video descargado!',
            fileName: 'facebook_video.mp4',
            mimetype: 'video/mp4'
        }, { quoted: m });

    } catch (error) {
        let msg = `Error al descargar el video.`;

        if (error.message.includes('Unsupported URL')) {
            msg = 'Enlace no soportado: El formato del enlace no es reconocido por el sistema.';
        } else if (error.message.includes('privado') || error.message.includes('login')) {
            msg = 'Video Privado: No se puede acceder al contenido.';
        }

        await sock.sendMessage(m.key.remoteJid, { text: msg }, { quoted: m });
    } finally {
        if (tempFilePath && existsSync(tempFilePath)) {
            try { unlinkSync(tempFilePath); } catch (e) {}
        }
    }
}

import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, unlinkSync, existsSync } from 'fs';

const execPromise = promisify(exec);
const ytDlpCommand = '/usr/local/bin/yt-dlp';
const cookiesPath = '/app/cookies.txt';

export async function igreelsCommand(sock, m, args) {
    let tempFilePath = null;

    try {
        let reelUrl = args[0];

        if (!reelUrl && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedText = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation ||
                             m.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text;
            if (quotedText) {
                const urlMatch = quotedText.match(/https?:\/\/[^\s]+/g);
                if (urlMatch) {
                    for (const url of urlMatch) {
                        if (isValidInstagramUrl(url)) {
                            reelUrl = url;
                            break;
                        }
                    }
                }
            }
        }

        if (!reelUrl || !isValidInstagramUrl(reelUrl)) {
            await sock.sendMessage(m.key.remoteJid, {
                text: 'Uso correcto:\n#reel [link]'
            }, { quoted: m });
            return;
        }

        tempFilePath = join(tmpdir(), `instagram_reel_${Date.now()}.mp4`);

        let cookiesArg = '';
        if (existsSync(cookiesPath)) {
            cookiesArg = `--cookies "${cookiesPath}"`;
        }

        const command = `"${ytDlpCommand}" ${cookiesArg} -f "best" --no-playlist --merge-output-format mp4 -o "${tempFilePath}" "${reelUrl}"`;

        await execPromise(command, { timeout: 60000 });

        if (!existsSync(tempFilePath)) {
            throw new Error('No se pudo generar el archivo de video');
        }

        const videoBuffer = readFileSync(tempFilePath);

        await sock.sendMessage(m.key.remoteJid, {
            video: videoBuffer,
            caption: 'Reel descargado!',
            fileName: 'instagram_reel.mp4'
        }, { quoted: m });

    } catch (error) {
        let errorMessage = 'Error al descargar el reel.\n\n';

        if (error.message.includes('login') || error.message.includes('rate-limit')) {
            errorMessage += 'Bloqueo de Instagram: El servidor requiere autenticación para descargar este contenido.';
        } else if (error.message.includes('Private') || error.message.includes('privado')) {
            errorMessage += 'Contenido privado: Solo funciona con contenido público.';
        } else {
            errorMessage += `Error: No se pudo procesar el enlace.`;
        }

        await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
    } finally {
        if (tempFilePath && existsSync(tempFilePath)) {
            try { unlinkSync(tempFilePath); } catch (e) {}
        }
    }
}

function isValidInstagramUrl(url) {
    const regex = /https?:\/\/(www\.)?instagram\.com\/(reel|p|stories)\/([A-Za-z0-9_-]+)/;
    return regex.test(url);
}

import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, unlinkSync, existsSync } from 'fs';

const execPromise = promisify(exec);
const ytDlpCommand = '/usr/local/bin/yt-dlp';

// Ruta absoluta a las cookies en el contenedor Docker (WORKDIR /app)
const cookiesPath = '/app/cookies.txt';

export async function igreelsCommand(sock, m, args) {
    let tempFilePath = null;
    
    try {
        let reelUrl = args[0];

        // Obtener URL de mensaje citado
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
                text: '❌ *Uso correcto:*\n▸ #reel _link_' 
            }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { react: { text: "⏳", key: m.key } });
        console.log(`📥 Descargando Instagram reel: ${reelUrl}`);

        tempFilePath = join(tmpdir(), `instagram_reel_${Date.now()}.mp4`);

        // CONSTRUCCIÓN DEL COMANDO CON COOKIES
        // Añadimos --cookies si el archivo existe
        let cookiesArg = '';
        if (existsSync(cookiesPath)) {
            console.log('🍪 Cookies detectadas, usándolas para autenticación...');
            cookiesArg = `--cookies "${cookiesPath}"`;
        } else {
            console.warn('⚠️ No se encontró cookies.txt en /app/cookies.txt');
        }

        // Comando base robusto
        const command = `"${ytDlpCommand}" ${cookiesArg} -f "best" --no-playlist --merge-output-format mp4 -o "${tempFilePath}" "${reelUrl}"`;

        try {
            await execPromise(command, { timeout: 60000 });
        } catch (downloadError) {
            console.error('Error descarga principal:', downloadError.message);
            throw downloadError;
        }

        if (!existsSync(tempFilePath)) {
            throw new Error('No se pudo generar el archivo de video');
        }

        console.log('✅ Descarga completada');

        const videoBuffer = readFileSync(tempFilePath);
        const fileSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);
        console.log(`📊 Tamaño del video: ${fileSizeMB} MB`);

        await sock.sendMessage(m.key.remoteJid, {
            video: videoBuffer,
            caption: 'Reel descargado!',
            fileName: 'instagram_reel.mp4'
        }, { quoted: m });

        await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('Error general Instagram:', error);

        let errorMessage = '❌ *Error al descargar el reel*\n\n';

        if (error.message.includes('login') || error.message.includes('rate-limit')) {
            errorMessage += '🔒 *Bloqueo de Instagram*\n';
            errorMessage += 'El servidor requiere autenticación (cookies) para descargar este contenido.';
        } else if (error.message.includes('Private') || error.message.includes('privado')) {
            errorMessage += '🔒 *Contenido privado*\nSolo funciona con contenido público.';
        } else {
            errorMessage += `⚠️ *Error:* No se pudo procesar el enlace.`;
        }

        await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
        await sock.sendMessage(m.key.remoteJid, { react: { text: "❌", key: m.key } });
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
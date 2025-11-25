import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, unlinkSync, existsSync } from 'fs';

const execPromise = promisify(exec);
const ytDlpCommand = '/usr/local/bin/yt-dlp';

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

        if (!reelUrl) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: '❌ *Uso:* #reel <url_instagram>\n*Ejemplo:* #reel https://instagram.com/reel/ABC123...' 
            }, { quoted: m });
            return;
        }

        if (!isValidInstagramUrl(reelUrl)) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: '❌ URL de Instagram no válida. Debe ser un Reel, Post o Story pública.' 
            }, { quoted: m });
            return;
        }

        // Enviar mensaje de procesamiento
        const processingMsg = await sock.sendMessage(m.key.remoteJid, { 
            text: '🔄 *Descargando contenido de Instagram...*\n⏳ Esto puede tomar unos segundos.' 
        }, { quoted: m });

        // Crear archivo temporal
        tempFilePath = join(tmpdir(), `instagram_${Date.now()}.mp4`);

        console.log(`📥 Descargando Instagram: ${reelUrl}`);

        // COMANDO YT-DLP OPTIMIZADO PARA INSTAGRAM
        const command = `"${ytDlpCommand}" -f "best[height<=720]" --no-playlist --merge-output-format mp4 -o "${tempFilePath}" "${reelUrl}"`;

        try {
            await execPromise(command, { timeout: 60000 });
            console.log('✅ Descarga completada con yt-dlp');

            if (!existsSync(tempFilePath)) {
                throw new Error('No se pudo generar el archivo de video');
            }

            // Leer el archivo descargado
            const videoBuffer = readFileSync(tempFilePath);
            const fileSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);

            console.log(`📊 Tamaño del video: ${fileSizeMB} MB`);

            // Eliminar mensaje de procesamiento
            try {
                await sock.sendMessage(m.key.remoteJid, { delete: processingMsg.key });
            } catch (e) {}

            // Enviar video
            await sock.sendMessage(m.key.remoteJid, {
                video: videoBuffer,
                caption: '✅ *Instagram Reel descargado!*',
                fileName: 'instagram_reel.mp4'
            }, { quoted: m });

            console.log('✅ Reel enviado correctamente');

        } catch (downloadError) {
            console.error('Error en yt-dlp:', downloadError);
            
            // INTENTO CON FALLBACK - Formato alternativo
            console.log('🔄 Intentando con formato alternativo...');
            
            const fallbackCommand = `"${ytDlpCommand}" -f "best" --no-playlist -o "${tempFilePath}" "${reelUrl}"`;
            
            try {
                await execPromise(fallbackCommand, { timeout: 60000 });
                
                if (existsSync(tempFilePath)) {
                    const videoBuffer = readFileSync(tempFilePath);
                    
                    // Eliminar mensaje de procesamiento
                    try {
                        await sock.sendMessage(m.key.remoteJid, { delete: processingMsg.key });
                    } catch (e) {}

                    await sock.sendMessage(m.key.remoteJid, {
                        video: videoBuffer,
                        caption: '✅ *Instagram Reel descargado!*',
                        fileName: 'instagram_reel.mp4'
                    }, { quoted: m });
                    
                    console.log('✅ Reel enviado con fallback');
                    return;
                }
            } catch (fallbackError) {
                console.error('Fallback también falló:', fallbackError);
                throw new Error('No se pudo descargar el contenido de Instagram');
            }

            throw downloadError;
        }

    } catch (error) {
        console.error('Error general:', error);

        let errorMessage = '❌ *Error al descargar el reel*\n\n';

        if (error.message.includes('Private') || error.message.includes('privado')) {
            errorMessage += '🔒 *Contenido privado*\n';
            errorMessage += 'Solo funciona con contenido público de Instagram.';
        } else if (error.message.includes('Unsupported') || error.message.includes('No se pudo')) {
            errorMessage += '📱 *URL no soportada o inválida*\n';
            errorMessage += 'Asegúrate de que sea un Reel, Post o Story pública.';
        } else if (error.message.includes('Sign in')) {
            errorMessage += '🔐 *Instagram requiere verificación*\n';
            errorMessage += 'Intenta con otro contenido.';
        } else {
            errorMessage += `⚠️ *Error:* ${error.message}\n`;
            errorMessage += '🔄 Intenta con otro enlace.';
        }

        await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
    } finally {
        // Limpieza
        if (tempFilePath && existsSync(tempFilePath)) {
            try {
                unlinkSync(tempFilePath);
                console.log('🧹 Archivo temporal eliminado');
            } catch (cleanError) {
                console.warn('No se pudo eliminar temporal:', cleanError.message);
            }
        }
    }
}

function isValidInstagramUrl(url) {
    const regex = /https?:\/\/(www\.)?instagram\.com\/(reel|p|stories)\/([A-Za-z0-9_-]+)/;
    return regex.test(url);
}

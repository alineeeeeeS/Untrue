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

        console.log(`📥 Descargando Instagram reel: ${reelUrl}`);

        // Crear archivo temporal
        tempFilePath = join(tmpdir(), `instagram_reel_${Date.now()}.mp4`);

        // ESTRATEGIA DE DESCARGA
        try {
            // PRIMER INTENTO: Calidad 1080p
            console.log('🎯 Intentando descarga en calidad 1080p...');
            const command = `"${ytDlpCommand}" -f "best[height<=1080]" --no-playlist --merge-output-format mp4 -o "${tempFilePath}" "${reelUrl}"`;
            await execPromise(command, { timeout: 60000 });

            if (!existsSync(tempFilePath)) {
                throw new Error('No se pudo generar el archivo de video');
            }

            console.log('✅ Descarga completada con calidad 1080p');

        } catch (firstError) {
            console.log('🔄 Calidad 1080p no disponible, intentando cualquier calidad...');
            
            // SEGUNDO INTENTO: Cualquier calidad disponible
            const fallbackCommand = `"${ytDlpCommand}" -f "best" --no-playlist --merge-output-format mp4 -o "${tempFilePath}" "${reelUrl}"`;
            await execPromise(fallbackCommand, { timeout: 60000 });
            
            if (!existsSync(tempFilePath)) {
                throw new Error('No se pudo descargar el reel en ninguna calidad');
            }
            
            console.log('✅ Descarga completada con calidad disponible');
        }

        // Leer el archivo descargado
        const videoBuffer = readFileSync(tempFilePath);
        const fileSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);

        console.log(`📊 Tamaño del video: ${fileSizeMB} MB`);

        // Enviar video directamente con caption simple
        await sock.sendMessage(m.key.remoteJid, {
            video: videoBuffer,
            caption: 'Reel descargado!',
            fileName: 'instagram_reel.mp4'
        }, { quoted: m });

        console.log('✅ Reel enviado correctamente');

    } catch (error) {
        console.error('Error general:', error);

        let errorMessage = '❌ *Error al descargar el reel*\n\n';

        if (error.message.includes('Private') || error.message.includes('privado')) {
            errorMessage += '🔒 *Contenido privado*\n';
            errorMessage += 'Solo funciona con contenido público de Instagram.';
        } else if (error.message.includes('Unsupported') || error.message.includes('No se pudo')) {
            errorMessage += '📱 *URL no soportada o inválida*\n';
            errorMessage += 'Asegúrate de que sea un Reel público.';
        } else if (error.message.includes('Sign in')) {
            errorMessage += '🔐 *Instagram requiere verificación*\n';
            errorMessage += 'Intenta con otro contenido.';
        } else if (error.message.includes('format is not available')) {
            errorMessage += '🎬 *Formato no disponible*\n';
            errorMessage += 'El reel no está disponible en las calidades soportadas.';
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

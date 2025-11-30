import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, unlinkSync, existsSync } from 'fs';

const execPromise = promisify(exec);

// IMPORTANTE: Se mantiene el path del binario
const ytDlpCommand = '/usr/local/bin/yt-dlp';

// Función utilitaria para validar URLs de Facebook
function isValidFacebookUrl(url) {
    return /(https?:\/\/)?(www\.|web\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch|me)/i.test(url);
}

// **Se eliminaron las funciones 'shortenDescription' y 'getVideoMetadata'.**

export async function facebookCommand(sock, m, args) {
    let tempFilePath = null;
    
    try {
        let fbUrl = args[0];

        // Lógica de URL citada (quoted)
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
                text: '❌ *Uso correcto:*\n#fb <enlace del video de Facebook>' 
            }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { react: { text: "⏳", key: m.key } });
        console.log(`📥 Procesando URL: ${fbUrl}`);
        
        // 1. CREAR ARCHIVO TEMPORAL Y DESCARGAR
        tempFilePath = join(tmpdir(), `facebook_video_${Date.now()}.mp4`);
        
        const downloadCommand = `"${ytDlpCommand}" ` +
                        `-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best" ` +
                        `--no-playlist ` +
                        `--merge-output-format mp4 ` +
                        `--max-filesize 100M ` + 
                        `-o "${tempFilePath}" ` +
                        `"${fbUrl}"`;

        console.log('🎯 Ejecutando descarga de video...');
        
        const { stdout, stderr } = await execPromise(downloadCommand, { timeout: 120000 });
        
        if (stderr) console.warn('yt-dlp warnings:', stderr);
        if (!existsSync(tempFilePath)) {
            throw new Error('yt-dlp no pudo generar el archivo de video. Podría ser privado o no encontrado.');
        }

        console.log('✅ Descarga con yt-dlp completada');

        // 2. LEER Y ENVIAR
        const videoBuffer = readFileSync(tempFilePath);
        const fileSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);
        console.log(`📊 Tamaño del video: ${fileSizeMB} MB`);
        
        // **CAPTION SIMPLIFICADO**
        const caption = `Video descargado!`;
        
        await sock.sendMessage(m.key.remoteJid, {
            video: videoBuffer,
            caption: caption,
            fileName: 'facebook_video.mp4',
            mimetype: 'video/mp4'
        }, { quoted: m });

        await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });
        console.log('✅ Video enviado correctamente');

    } catch (error) {
        console.error('❌ Error FB Command (yt-dlp):', error);
        
        let msg = `❌ *Error al descargar el video*.`;
        if (error.message.includes('pesado')) msg = '⚠️ El video es demasiado pesado (>100MB) para WhatsApp.';
        if (error.message.includes('privado') || error.message.includes('login')) msg = '🔒 *Error*: El video es privado o requiere inicio de sesión.';
        
        // Mensaje específico para el error recurrente de yt-dlp
        if (error.message.includes('Cannot parse data')) {
            msg = '❌ *Error de compatibilidad*: Facebook ha cambiado su formato. Por favor, ejecuta `yt-dlp -U` en tu servidor para actualizar la herramienta.';
        } else if (error.message.includes('yt-dlp no pudo generar')) {
            msg = '❌ El contenido no pudo ser extraído por yt-dlp (enlace inválido o contenido restringido).';
        }
        
        await sock.sendMessage(m.key.remoteJid, { text: msg }, { quoted: m });
        await sock.sendMessage(m.key.remoteJid, { react: { text: "❌", key: m.key } });
        
    } finally {
        // Limpieza de archivo temporal
        if (tempFilePath && existsSync(tempFilePath)) {
            try {
                unlinkSync(tempFilePath);
                console.log('🧹 Archivo temporal de Facebook eliminado');
            } catch (cleanError) {
                console.warn('No se pudo eliminar el archivo temporal:', cleanError.message);
            }
        }
    }
}
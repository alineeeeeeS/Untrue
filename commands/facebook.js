import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, unlinkSync, existsSync } from 'fs';

const execPromise = promisify(exec);

// IMPORTANTE: Usamos el mismo path de yt-dlp que utilizas en igreels.js
const ytDlpCommand = '/usr/local/bin/yt-dlp';

// Función utilitaria (copia de igreels.js)
function isValidFacebookUrl(url) {
    return /(https?:\/\/)?(www\.|web\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch|me)/i.test(url);
}

export async function facebookCommand(sock, m, args) {
    let tempFilePath = null;
    
    try {
        let fbUrl = args[0];

        // Lógica de URL citada (copiada de tu código anterior y igreels.js)
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

        if (!fbUrl) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: '❌ *Uso correcto:*\n#fb <enlace del video>' 
            }, { quoted: m });
            return;
        }

        if (!isValidFacebookUrl(fbUrl)) {
             await sock.sendMessage(m.key.remoteJid, { 
                text: '❌ URL de Facebook no válida.' 
            }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { react: { text: "⏳", key: m.key } });
        console.log(`📥 Descargando Facebook video: ${fbUrl}`);

        // Crear archivo temporal
        tempFilePath = join(tmpdir(), `facebook_video_${Date.now()}.mp4`);
        
        // ESTRATEGIA DE DESCARGA ROBUSTA con yt-dlp:
        // -f "bestvideo+bestaudio" asegura que se descarguen y unan los streams.
        // --max-filesize 100M evita enviar archivos muy grandes a WhatsApp.
        // --no-check-certificate es una práctica segura, pero se puede omitir si no hay problemas TLS.
        // --downloader-args "ffmpeg_i: -ss 00:00:00" es un truco para evitar un error específico con FB.
        
        const command = `"${ytDlpCommand}" ` +
                        `-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best" ` +
                        `--no-playlist ` +
                        `--merge-output-format mp4 ` +
                        `--max-filesize 100M ` + 
                        `-o "${tempFilePath}" ` +
                        `"${fbUrl}"`;

        try {
            console.log('🎯 Ejecutando yt-dlp para descarga y unión de streams...');
            const { stdout, stderr } = await execPromise(command, { timeout: 120000 }); // 2 minutos para videos largos
            
            if (stderr) console.warn('yt-dlp warnings:', stderr);

            if (!existsSync(tempFilePath)) {
                // A veces yt-dlp falla pero no lanza error de exec, solo no genera el archivo
                throw new Error('yt-dlp no pudo generar el archivo de video. Podría ser privado.');
            }

            console.log('✅ Descarga con yt-dlp completada');

        } catch (downloadError) {
             let errorMsg = downloadError.message || downloadError;

             if (errorMsg.includes('max-filesize')) {
                 throw new Error('El video es demasiado pesado (>100MB) para WhatsApp.');
             }
             if (errorMsg.includes('Private') || errorMsg.includes('login')) {
                 throw new Error('El video es privado. Solo se pueden descargar videos públicos.');
             }
             if (errorMsg.includes('No video formats found')) {
                 throw new Error('El formato del video no es compatible o el enlace es inválido.');
             }
             throw new Error(`Error en yt-dlp: ${errorMsg.split('\n')[0]}`);
        }

        // Leer el archivo descargado
        const videoBuffer = readFileSync(tempFilePath);
        const fileSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);

        console.log(`📊 Tamaño del video: ${fileSizeMB} MB`);

        // Enviar video
        await sock.sendMessage(m.key.remoteJid, {
            video: videoBuffer,
            caption: `✅ *Video de Facebook descargado* (Tamaño: ${fileSizeMB} MB)`,
            fileName: 'facebook_video.mp4'
        }, { quoted: m });

        await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });
        console.log('✅ Video enviado correctamente');

    } catch (error) {
        console.error('❌ Error FB Command (yt-dlp):', error);
        
        // Mensajes de error amigables para el usuario
        let msg = `❌ *Error al descargar el video*: ${error.message}`;
        
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
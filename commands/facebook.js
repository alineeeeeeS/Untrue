import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, unlinkSync, existsSync } from 'fs';

const execPromise = promisify(exec);

const ytDlpCommand = '/usr/local/bin/yt-dlp';

// Función utilitaria para validar URLs de Facebook
function isValidFacebookUrl(url) {
    return /(https?:\/\/)?(www\.|web\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch|me)/i.test(url);
}

// Función para acortar texto (15 palabras)
function shortenDescription(text) {
    if (!text) return "Sin descripción";
    
    // Eliminar saltos de línea y limpiar espacios excesivos
    const cleanedText = text.replace(/(\r\n|\n|\r)/gm, ' ').replace(/\s+/g, ' ').trim();
    
    const words = cleanedText.split(' ');
    
    if (words.length <= 15) {
        return cleanedText;
    }

    return words.slice(0, 15).join(' ') + '...';
}

/**
 * 1. Ejecuta yt-dlp para obtener metadatos (uploader, descripción)
 * 2. Devuelve un objeto con la info limpia
 */
async function getVideoMetadata(url) {
    console.log('?? Extrayendo metadatos...');
    
    const command = `"${ytDlpCommand}" --dump-json --skip-download --no-warnings "${url}"`;
    
    try {
        const { stdout } = await execPromise(command, { timeout: 30000 });
        const data = JSON.parse(stdout);

        const targetData = Array.isArray(data) ? data[0] : data;
        
        const uploader = targetData.uploader || 'Usuario Desconocido';
        const description = shortenDescription(targetData.description);
        
        return { uploader, description };
    } catch (error) {
        console.warn(`⚠️ No se pudo extraer la metadata. Error: ${error.message.split('\n')[0]}. Usando valores predeterminados.`);
        return { uploader: 'Usuario Desconocido', description: 'Sin descripción' };
    }
}

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
        
        // 1. EXTRAER METADATA
        const metadata = await getVideoMetadata(fbUrl);

        // 2. CREAR ARCHIVO TEMPORAL Y DESCARGAR
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

        // 3. LEER Y ENVIAR
        const videoBuffer = readFileSync(tempFilePath);
        const fileSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);
        console.log(`📊 Tamaño del video: ${fileSizeMB} MB`);
        
        const caption = `
👤 *Usuario:* ${metadata.uploader}
📝 *Descripción:* ${metadata.description}
`.trim();
        
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
        if (error.message.includes('privado')) msg = '🔒 *Error*: El video es privado o no existe.';
        if (error.message.includes('yt-dlp no pudo generar')) msg = '❌ El contenido no pudo ser extraído por yt-dlp.';
        
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
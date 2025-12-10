import fetch from 'node-fetch'; 
import { createWriteStream, existsSync } from 'fs'; 
import { unlink, stat } from 'fs/promises'; 
import * as path from 'path';

// Límites de WhatsApp y de seguridad para el bot
const MAX_FILE_SIZE_MB = 100; 
const DOWNLOAD_TIMEOUT_MS = 120000; // 2 minutos para archivos grandes

export async function dlCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    let fileUrl = args.join(' ').trim();
    
    // Si el usuario no pega un link, asumimos que está respondiendo a un mensaje
    if (!fileUrl && m.quoted) {
        fileUrl = m.quoted.text || m.quoted.caption || '';
    }

    const urlMatch = fileUrl.match(/(https?:\/\/[^\s]+)/i);
    if (urlMatch) {
        fileUrl = urlMatch[0];
    } else {
        await sock.sendMessage(remoteJid, { 
            text: '❌ *Uso correcto:*\n▸ #dl _URL_ del archivo o responde a un mensaje con el link.'
        }, { quoted: m });
        return;
    }

    let filePath = '';
    
    try {
        await sock.sendPresenceUpdate('composing', remoteJid);
        
        // 1. HEAD REQUEST (Validación previa)
        const headResponse = await fetch(fileUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });

        // Nota: Algunos servidores no soportan HEAD, si falla, intentamos GET directo abajo
        let fileSizeMB = null;
        let fileMime = 'application/octet-stream';

        if (headResponse.ok) {
            const contentLength = headResponse.headers.get('content-length');
            fileMime = headResponse.headers.get('content-type') || fileMime;
            fileSizeMB = contentLength ? (parseInt(contentLength, 10) / (1024 * 1024)) : null;

            if (fileSizeMB && fileSizeMB > MAX_FILE_SIZE_MB) {
                throw new Error(`El archivo excede el límite de ${MAX_FILE_SIZE_MB} MB (${fileSizeMB.toFixed(2)} MB).`);
            }
        }
        
        // Determinar extensión y nombre
        const urlPath = new URL(fileUrl).pathname;
        let fileExt = path.extname(urlPath) || '';
        
        if (!fileExt || fileExt === '.') {
             if (fileMime.includes('pdf')) fileExt = '.pdf';
             else if (fileMime.includes('zip')) fileExt = '.zip';
             else if (fileMime.includes('image')) fileExt = '.jpg';
             else if (fileMime.includes('audio')) fileExt = '.mp3';
             else if (fileMime.includes('video')) fileExt = '.mp4';
             else fileExt = '.dat'; 
        }

        const fileName = `dl-${Date.now()}${fileExt}`;
        filePath = path.join(process.cwd(), fileName); // Guardar en raíz temporalmente
        
        await sock.sendMessage(remoteJid, { 
            text: `⏳ *Descargando archivo...*\n\n📄 Tipo: ${fileExt}\n📊 Peso aprox: ${fileSizeMB ? fileSizeMB.toFixed(2) + ' MB' : 'Desconocido'}`
        }, { quoted: m });

        // 2. DESCARGAR EL ARCHIVO (GET)
        const downloadResponse = await fetch(fileUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });

        if (!downloadResponse.ok) {
            throw new Error(`Error HTTP: ${downloadResponse.status} - ${downloadResponse.statusText}`);
        }

        // Crear el stream de escritura (AQUÍ ESTABA EL ERROR ANTERIOR)
        const fileWriteStream = createWriteStream(filePath);

        // Pipear la descarga al archivo
        await new Promise((resolve, reject) => {
            downloadResponse.body.pipe(fileWriteStream);
            downloadResponse.body.on('error', (err) => {
                fileWriteStream.close();
                reject(err);
            });
            fileWriteStream.on('finish', () => {
                fileWriteStream.close(); // Asegurar cierre del archivo
                resolve();
            });
            fileWriteStream.on('error', (err) => {
                fileWriteStream.close();
                reject(err);
            });
        });

        // Verificar tamaño final real
        const finalStats = await stat(filePath);
        const finalSizeMB = finalStats.size / (1024 * 1024);

        if (finalSizeMB > MAX_FILE_SIZE_MB) {
            throw new Error(`Archivo final demasiado grande (${finalSizeMB.toFixed(2)} MB).`);
        }

        // 3. ENVIAR EL ARCHIVO
        await sock.sendMessage(remoteJid, {
            document: { url: filePath },
            mimetype: fileMime,
            fileName: path.basename(urlPath) || fileName, // Intenta usar el nombre original del link
            caption: `✅ *Descarga Completa*\n📦 Peso: ${finalSizeMB.toFixed(2)} MB`
        }, { quoted: m });
        
        console.log(`✅ Archivo enviado: ${fileName}`);

    } catch (error) {
        console.error('Error en comando #dl:', error);
        
        let msg = `❌ *Error en la descarga*\n\n${error.message}`;
        if (error.name === 'AbortError') {
            msg = '❌ *Tiempo de espera agotado*. El archivo tarda mucho en descargar.';
        }
        
        await sock.sendMessage(remoteJid, { text: msg }, { quoted: m });

    } finally {
        // 4. LIMPIEZA SEGURA
        if (filePath && existsSync(filePath)) {
            try {
                await unlink(filePath);
                console.log(`🗑️ Temporal eliminado: ${filePath}`);
            } catch (cleanupError) {
                console.error(`Error eliminando temporal:`, cleanupError);
            }
        }
    }
}
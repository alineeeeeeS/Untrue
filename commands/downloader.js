import fetch from 'node-fetch'; 
import { createWriteStream, existsSync } from 'fs'; 
import { unlink, stat } from 'fs/promises'; 
import * as path from 'path';
import { URL } from 'url'; // Necesario para manejar la URL en Node.js

// Límites de WhatsApp y de seguridad para el bot
const MAX_FILE_SIZE_MB = 100; 
const DOWNLOAD_TIMEOUT_MS = 120000; // 2 minutos de timeout para descargas

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
    let finalFileName = `dl-${Date.now()}.dat`; // Nombre por defecto inicial (se sobrescribirá)
    
    try {
        await sock.sendPresenceUpdate('composing', remoteJid);
        
        // 1. DESCARGAR EL ARCHIVO (GET) - fetch sigue las redirecciones automáticamente.
        const downloadResponse = await fetch(fileUrl, { 
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
            redirect: 'follow' 
        });

        if (!downloadResponse.ok) {
            throw new Error(`Error HTTP: ${downloadResponse.status} - ${downloadResponse.statusText}`);
        }
        
        // --- LÓGICA CLAVE: EXTRAER EL NOMBRE DEL ARCHIVO REAL ---
        
        // A. Intentar obtener el nombre del Content-Disposition (Header más fiable)
        const contentDisposition = downloadResponse.headers.get('content-disposition');
        if (contentDisposition) {
            // Expresión regular robusta para encontrar filename o filename*
            const fileNameMatch = contentDisposition.match(/filename\*?=['"]?(?:utf-8''|)([^;"]+)/i);
            if (fileNameMatch && fileNameMatch[1]) {
                finalFileName = decodeURIComponent(fileNameMatch[1]); 
            }
        }
        
        // B. Fallback: Intentar usar el nombre de la URL después de las redirecciones
        if (finalFileName.includes('.dat')) {
            const finalUrl = downloadResponse.url; 
            const urlPath = new URL(finalUrl).pathname;
            const basename = path.basename(urlPath);
            
            // Si el nombre no es una URL genérica de redirección (como AutoDL)
            if (basename && basename.length > 5 && !basename.includes('AutoDL')) {
                finalFileName = basename;
            }
        }

        // C. Parche específico para Oracle/Java si la extensión es genérica
        // Esto cubre el caso en que Content-Disposition no fue claro y la URL final tampoco.
        if (fileUrl.includes('oracle.com') && !finalFileName.includes('.')) {
             finalFileName += '.exe';
        }
        
        // -----------------------------------------------------------

        const contentLength = downloadResponse.headers.get('content-length');
        const fileMime = downloadResponse.headers.get('content-type') || 'application/octet-stream';
        const fileSizeMB = contentLength ? (parseInt(contentLength, 10) / (1024 * 1024)) : null;

        if (fileSizeMB && fileSizeMB > MAX_FILE_SIZE_MB) {
            throw new Error(`El archivo excede el límite de ${MAX_FILE_SIZE_MB} MB (${fileSizeMB.toFixed(2)} MB).`);
        }
        
        filePath = path.join(process.cwd(), finalFileName); 

        await sock.sendMessage(remoteJid, { 
            text: `⏳ *Descargando archivo...*\n\n📄 Nombre: ${finalFileName}\n📊 Peso aprox: ${fileSizeMB ? fileSizeMB.toFixed(2) + ' MB' : 'Desconocido'}`
        }, { quoted: m });

        // 2. CREAR STREAM Y PIPE (Descarga)
        const fileWriteStream = createWriteStream(filePath);

        await new Promise((resolve, reject) => {
            downloadResponse.body.pipe(fileWriteStream);
            
            // Manejo de errores en la descarga y escritura
            const errorHandler = (err) => {
                fileWriteStream.close();
                reject(err);
            };

            downloadResponse.body.on('error', errorHandler);
            fileWriteStream.on('error', errorHandler);
            fileWriteStream.on('finish', () => {
                fileWriteStream.close(); 
                resolve();
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
            fileName: finalFileName,
            caption: `✅ *Descarga Completa*\n📦 Peso: ${finalSizeMB.toFixed(2)} MB`
        }, { quoted: m });
        
        console.log(`✅ Archivo enviado: ${finalFileName}`);

    } catch (error) {
        console.error('Error en comando #dl:', error);
        
        let msg = `❌ *Error en la descarga*\n\n${error.message}`;
        if (error.name === 'AbortError') {
            msg = '❌ *Tiempo de espera agotado*. El archivo tarda mucho en descargar.';
        }
        
        await sock.sendMessage(remoteJid, { text: msg }, { quoted: m });

    } finally {
        // 4. LIMPIEZA SEGURA
        // Solo intenta borrar si el archivo existe
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
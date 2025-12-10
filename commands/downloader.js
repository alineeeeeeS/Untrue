import fetch from 'node-fetch'; 
import * as fs from 'fs/promises';
import * as path from 'path';

// Límites de WhatsApp y de seguridad para el bot
const MAX_FILE_SIZE_MB = 100; // El límite de WhatsApp para documentos es alto, pero uso un límite seguro
const DOWNLOAD_TIMEOUT_MS = 60000; // 60 segundos de timeout

export async function dlCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    let fileUrl = args.join(' ').trim();
    
    // Si el usuario no pega un link, asumimos que está respondiendo a un mensaje que contiene el link
    if (!fileUrl && m.quoted) {
        // Intentar obtener el texto del mensaje al que se responde
        fileUrl = m.quoted.text || m.quoted.caption || '';
    }

    // Usar una expresión simple para encontrar la primera URL
    const urlMatch = fileUrl.match(/(https?:\/\/[^\s]+)/i);
    if (urlMatch) {
        fileUrl = urlMatch[0];
    } else {
        await sock.sendMessage(remoteJid, { 
            text: '❌ *Uso correcto:*\n▸ #dl _link_\n▸ #dl respondiendo a un _link_'
        }, { quoted: m });
        return;
    }

    let filePath = '';
    
    try {
        await sock.sendPresenceUpdate('composing', remoteJid);
        
        // 1. OBTENER INFORMACIÓN DEL ENLACE (HEAD request)
        // Esto verifica el Content-Length y Content-Type sin descargar el archivo completo.
        const headResponse = await fetch(fileUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });

        if (!headResponse.ok) {
            throw new Error(`Error al acceder al link: ${headResponse.status} - ${headResponse.statusText}`);
        }

        const contentLength = headResponse.headers.get('content-length');
        const fileMime = headResponse.headers.get('content-type');
        const fileSizeMB = contentLength ? (parseInt(contentLength, 10) / (1024 * 1024)) : null;

        if (fileSizeMB && fileSizeMB > MAX_FILE_SIZE_MB) {
            throw new Error(`El archivo excede el límite de ${MAX_FILE_SIZE_MB} MB (${fileSizeMB.toFixed(2)} MB).`);
        }
        
        // Determinar la extensión del archivo
        const urlPath = new URL(fileUrl).pathname;
        let fileExt = path.extname(urlPath) || '.dat';
        
        // Si no hay extensión, intentar determinarla por MIME Type
        if (fileExt === '.dat' || fileExt === '') {
             // (Aquí podrías agregar un mapa MIME-a-Extensión si lo necesitas, ej: 'application/pdf' -> '.pdf')
             fileExt = fileMime.includes('pdf') ? '.pdf' : fileExt;
             fileExt = fileMime.includes('zip') ? '.zip' : fileExt;
        }

        const fileName = `download-${Date.now()}${fileExt}`;
        filePath = path.join(process.cwd(), fileName);
        
        await sock.sendMessage(remoteJid, { 
            text: `⏳ *Iniciando Descarga...*\n\nArchivo: ${fileName}\nTamaño estimado: ${fileSizeMB ? fileSizeMB.toFixed(2) + ' MB' : 'Desconocido'}`
        }, { quoted: m });

        // 2. DESCARGAR EL ARCHIVO COMPLETO
        const downloadResponse = await fetch(fileUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });

        if (!downloadResponse.ok) {
            throw new Error(`Error de descarga: ${downloadResponse.status} - ${downloadResponse.statusText}`);
        }

        // Crear un stream de escritura y guardar el archivo temporalmente
        const fileWriteStream = fs.createWriteStream(filePath);
        await new Promise((resolve, reject) => {
            downloadResponse.body.pipe(fileWriteStream);
            downloadResponse.body.on('error', reject);
            fileWriteStream.on('finish', resolve);
            fileWriteStream.on('error', reject);
        });

        // 3. ENVIAR EL ARCHIVO POR WHATSAPP
        const finalStats = await fs.stat(filePath);

        await sock.sendMessage(remoteJid, {
            document: { url: filePath },
            mimetype: fileMime || 'application/octet-stream',
            fileName: fileName,
            caption: `✅ *Descarga Completa (${(finalStats.size / (1024 * 1024)).toFixed(2)} MB)*\n\nArchivo descargado por el bot (Proxy Geográfico).`
        }, { quoted: m });
        
        console.log(`✅ Archivo descargado y enviado: ${fileName}`);

    } catch (error) {
        console.error('Error en comando #dl:', error);
        
        await sock.sendMessage(remoteJid, { 
            text: `❌ *Error en la descarga*\n\nNo se pudo descargar o enviar el archivo.\n\nDetalles: ${error.message}`
        }, { quoted: m });

    } finally {
        // 4. LIMPIEZA
        if (filePath) {
            try {
                await fs.unlink(filePath);
                console.log(`🗑️ Archivo temporal eliminado: ${filePath}`);
            } catch (cleanupError) {
                console.error(`Error al eliminar archivo temporal ${filePath}:`, cleanupError);
            }
        }
    }
}
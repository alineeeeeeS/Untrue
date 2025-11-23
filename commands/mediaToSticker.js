import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { promisify } from 'util';
import { exec } from 'child_process';

// CORRECCIÓN DE IMPORTACIÓN
import WebP from 'node-webpmux';
const { Image: WebpMuxImage } = WebP; // Importación compatible con CommonJS

const execPromise = promisify(exec);
const ffmpegCommand = '/home/runner/workspace/node_modules/ffmpeg-static/ffmpeg';

// ----------------------------------------------------------------------
// --- FUNCIONES AUXILIARES ---
// ----------------------------------------------------------------------

/**
 * Genera el buffer EXIF válido para WhatsApp/node-webpmux.
 */
function generateExifBuffer(exifData) {
    const jsonString = JSON.stringify(exifData);
    const jsonBuffer = Buffer.from(jsonString, 'utf-8');

    // Estructura de cabecera TIFF para WhatsApp (22 bytes)
    const exifTemp = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 
        0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 
        0x00, 0x00
    ]);

    // Escribir la longitud (JSON.length + 1 null byte) en el offset 14 (Little Endian)
    exifTemp.writeUInt32LE(jsonBuffer.length + 1, 14);

    // Concatenar Cabecera, JSON y Null Byte
    return Buffer.concat([
        exifTemp,
        jsonBuffer,
        Buffer.from([0x00]) // Null byte de terminación
    ]);
}


function cleanUpFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log(`🧹 Archivo temporal eliminado: ${filePath}`);
        } catch (e) {
            console.warn(`⚠️ Error limpiando archivo ${filePath}: ${e.message}`);
        }
    }
}

async function checkIfWebPIsAnimated(filePath) {
    try {
        const buffer = fs.readFileSync(filePath);
        const data = buffer.toString('hex');
        const hasANIM = data.includes('414e494d'); // ANIM
        const hasANMF = data.includes('414e4d46'); // ANMF
        return hasANIM && hasANMF;
    } catch (error) {
        return false;
    }
}

async function optimizeAnimatedWebP(inputPath, outputPath, duration) {
    console.warn('⚠️ Optimización no implementada en el snippet, saltando.');
    return true; 
}

/**
 * CONVERSIÓN DE VIDEO A WEBP - MÉTODO 1 (CORREGIDO)
 * Usa scale/crop para asegurar que el video rellena todo el 512x512.
 */
async function convertToAnimatedWebPMethod1(inputPath, outputPath, duration) {
    try {
        const timeLimit = Math.min(duration, 8); 
        // Filtro CORREGIDO: scale=512:512:force_original_aspect_ratio=increase luego crop=512:512
        const command = `${ffmpegCommand} -y -i ${inputPath} -t ${timeLimit} -vcodec libwebp -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,fps=15,setsar=1" -loop 0 -crf 25 -preset default ${outputPath}`;
        await execPromise(command, { maxBuffer: 1024 * 1024 * 50 });
        return fs.existsSync(outputPath);
    } catch (error) {
        console.error('❌ Error en Method 1 (proporciones):', error.message);
        return false;
    }
}

/**
 * CONVERSIÓN DE VIDEO A WEBP - MÉTODO 2 (CORREGIDO)
 * También usa scale/crop para consistencia y mejor resultado.
 */
async function convertToAnimatedWebPMethod2(inputPath, outputPath, duration) {
    try {
        const timeLimit = Math.min(duration, 8); 
        // Filtro CORREGIDO: Usando el mismo filtro gráfico robusto
        const command = `${ffmpegCommand} -y -i ${inputPath} -t ${timeLimit} -vcodec libwebp -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,fps=15,setsar=1" -loop 0 -preset default -an -vsync 0 -crf 25 ${outputPath}`;
        await execPromise(command, { maxBuffer: 1024 * 1024 * 50 });
        return fs.existsSync(outputPath);
    } catch (error) {
        console.error('❌ Error en Method 2 (proporciones):', error.message);
        return false;
    }
}

// ----------------------------------------------------------------------
// --- FUNCIÓN PRINCIPAL DE INYECCIÓN ---
// ----------------------------------------------------------------------

/**
 * Función que encapsula la lógica de inyección para ser más limpia.
 */
async function injectStickerMetadata(inputPath, outputPath, m) {
    const userName = m.pushName || "Usuario Anónimo";
    const creationDate = new Date().toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/\//g, '/');

    const finalFooterText = `@${userName} | ${creationDate}`;

    const exifData = {
        'sticker-pack-id': 'untrue-bot-sticker-id',
        'sticker-pack-name': 'UntrueBot - @josentss\n',
        'sticker-pack-publisher': finalFooterText, 
        'author': finalFooterText,
        'emojis': '✨' 
    };

    // Generar el buffer EXIF con la longitud correcta
    const exifBuffer = generateExifBuffer(exifData);

    const img = new WebpMuxImage();
    await img.load(inputPath); 

    // Asignar el buffer dinámico
    img.exif = exifBuffer;

    await img.save(outputPath);
    console.log(`✅ Metadatos EXIF inyectados con: ${finalFooterText}`);
}


// ----------------------------------------------------------------------
// --- COMANDOS DE PROCESAMIENTO ---
// ----------------------------------------------------------------------

export async function mediaToStickerCommand(sock, m) {
    const remoteJid = m.key.remoteJid;
    const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quotedMessage) {
        await sock.sendMessage(remoteJid, { 
            text: `❌ *DEBES RESPONDER A UNA IMAGEN O VIDEO*\n\nUsa #s o #sticker respondiendo a:\n• Imagen → Sticker estático\n• Video → Sticker animado (max 10 segundos)` 
        }, { quoted: m });
        return;
    }

    try {
        await sock.sendPresenceUpdate('composing', remoteJid);

        if (quotedMessage.imageMessage) {
            await processImageSticker(sock, m, quotedMessage.imageMessage);
        } else if (quotedMessage.videoMessage) {
            await processVideoSticker(sock, m, quotedMessage.videoMessage);
        } else {
            await sock.sendMessage(remoteJid, { 
                text: '❌ *DEBES RESPONDER A UNA IMAGEN O VIDEO* para crear un sticker.' 
            }, { quoted: m });
        }

    } catch (error) {
        console.error('❌ Error general en mediaToStickerCommand:', error);
        await sock.sendMessage(remoteJid, { 
            text: '❌ Error inesperado durante el procesamiento del sticker.' 
        }, { quoted: m });
    }
}

/**
 * Procesar imagen para sticker estático
 */
async function processImageSticker(sock, m, imageMessage) {
    const remoteJid = m.key.remoteJid;
    let tempInputPath = null;
    let tempWebpNoMeta = null; 
    let tempOutputPath = null; 

    try {
        // 1. Descargar y guardar imagen
        const stream = await downloadContentFromMessage(imageMessage, 'image');
        tempInputPath = join(tmpdir(), `image-input-${Date.now()}.jpeg`);
        const buffer = [];
        for await (const chunk of stream) { buffer.push(chunk); }
        fs.writeFileSync(tempInputPath, Buffer.concat(buffer));

        // 2. Convertir a WebP *sin* metadatos (temporal)
        tempWebpNoMeta = join(tmpdir(), `sticker-nometa-${Date.now()}.webp`);
        await sharp(tempInputPath)
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp()
            .toFile(tempWebpNoMeta);

        // 3. INYECTAR METADATOS EXIF (USANDO LA FUNCIÓN CORREGIDA)
        tempOutputPath = join(tmpdir(), `sticker-final-${Date.now()}.webp`);
        await injectStickerMetadata(tempWebpNoMeta, tempOutputPath, m); 

        if (!fs.existsSync(tempOutputPath)) {
            throw new Error('No se pudo crear el archivo WebP final');
        }

        const fileStats = fs.statSync(tempOutputPath);
        console.log(`📊 Tamaño del sticker: ${(fileStats.size / 1024).toFixed(2)} KB`);

        // 4. Enviar el Sticker FINAL
        await sock.sendMessage(remoteJid, { 
            sticker: fs.readFileSync(tempOutputPath),
        }, { quoted: m });

        console.log('✅ Sticker de imagen enviado exitosamente');

    } catch (error) {
        console.error('❌ Error en procesamiento de imagen:', error);
        throw error;
    } finally {
        cleanUpFile(tempInputPath);
        cleanUpFile(tempWebpNoMeta);
        cleanUpFile(tempOutputPath);
    }
}

/**
 * Procesar video para sticker animado
 */
async function processVideoSticker(sock, m, videoMessage) {
    const remoteJid = m.key.remoteJid;
    let tempInputPath = null;
    let tempWebpNoMeta = null; 
    let tempOutputPath = null; 

    try {
        const videoDuration = videoMessage.seconds || 0;
        const MAX_DURATION = 10;

        if (videoDuration > MAX_DURATION) {
            await sock.sendMessage(remoteJid, { 
                text: `❌ *VIDEO DEMASIADO LARGO*\n\nLos videos para stickers deben ser máximo *${MAX_DURATION} segundos*.\n\nTu video: ${videoDuration} segundos\n\nRecorta el video y vuelve a intentarlo.` 
            }, { quoted: m });
            return;
        }

        // 1. Descargar y guardar video
        const stream = await downloadContentFromMessage(videoMessage, 'video');
        tempInputPath = join(tmpdir(), `video-input-${Date.now()}.mp4`);
        const buffer = [];
        for await (const chunk of stream) { buffer.push(chunk); }
        fs.writeFileSync(tempInputPath, Buffer.concat(buffer));

        // 2. CONVERSIÓN a WebP base
        tempWebpNoMeta = join(tmpdir(), `sticker-nometa-${Date.now()}.webp`);

        let success = await convertToAnimatedWebPMethod1(tempInputPath, tempWebpNoMeta, videoDuration);

        if (!success) {
            success = await convertToAnimatedWebPMethod2(tempInputPath, tempWebpNoMeta, videoDuration);
        }

        if (!success || !fs.existsSync(tempWebpNoMeta)) {
            throw new Error('No se pudo crear el sticker animado después de múltiples intentos');
        }

        // 3. INYECTAR METADATOS EXIF (USANDO LA FUNCIÓN CORREGIDA)
        tempOutputPath = join(tmpdir(), `sticker-final-${Date.now()}.webp`);
        await injectStickerMetadata(tempWebpNoMeta, tempOutputPath, m);

        if (!fs.existsSync(tempOutputPath)) {
            throw new Error('No se pudo crear el archivo WebP animado final');
        }

        // 4. Verificación y optimización
        if (!(await checkIfWebPIsAnimated(tempOutputPath))) {
            throw new Error('El archivo WebP generado no es animado');
        }

        const outputStats = fs.statSync(tempOutputPath);
        if (outputStats.size > 500 * 1024) {
            await optimizeAnimatedWebP(tempInputPath, tempOutputPath, videoDuration);
        }

        // 5. Enviar el Sticker FINAL
        const stickerBuffer = fs.readFileSync(tempOutputPath);
        await sock.sendMessage(remoteJid, { 
            sticker: stickerBuffer,
        }, { quoted: m });

        console.log(`✅ Sticker animado de ${videoDuration}s enviado exitosamente`);

    } catch (error) {
        console.error('❌ Error en procesamiento de video:', error);

        await sock.sendMessage(remoteJid, { 
            text: `❌ *ERROR DE CONVERSIÓN*\n\nNo se pudo crear el sticker animado.\n\nPosibles causas:\n• El video es muy largo\n• Formato no compatible\n• Intenta con un video más corto (3-7 segundos)` 
        }, { quoted: m });
    } finally {
        cleanUpFile(tempInputPath);
        cleanUpFile(tempWebpNoMeta);
        cleanUpFile(tempOutputPath);
    }
}
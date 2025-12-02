import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { promisify } from 'util';
import { exec } from 'child_process';

import WebP from 'node-webpmux';
const { Image: WebpMuxImage } = WebP;

const execPromise = promisify(exec);
// Asegúrate que esta ruta sea correcta en Railway. Usualmente 'ffmpeg' basta si está en el PATH,
// pero mantenemos tu ruta absoluta por seguridad.
const ffmpegCommand = '/home/runner/workspace/node_modules/ffmpeg-static/ffmpeg';

// ----------------------------------------------------------------------
// --- FUNCIONES AUXILIARES ---
// ----------------------------------------------------------------------

function generateExifBuffer(exifData) {
    const jsonString = JSON.stringify(exifData);
    const jsonBuffer = Buffer.from(jsonString, 'utf-8');
    const exifTemp = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 
        0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 
        0x00, 0x00
    ]);
    exifTemp.writeUInt32LE(jsonBuffer.length + 1, 14);
    return Buffer.concat([exifTemp, jsonBuffer, Buffer.from([0x00])]);
}

function cleanUpFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (e) {
            console.warn(`⚠️ Error limpiando archivo ${filePath}: ${e.message}`);
        }
    }
}

/**
 * Función maestra de conversión con control de calidad.
 * Intenta convertir. Si el archivo > 950KB, retorna false para que se intente con menor calidad.
 */
async function ffmpegConvertToWebP(input, output, options) {
    const { fps, duration, quality, resolution } = options;
    
    // Filtros: Escalar, Cortar al centro, FPS, Loop infinito
    // -lossless 0: Compresión con pérdida (vital para bajar peso)
    // -compression_level 4: Balance entre velocidad de CPU y tamaño
    // -q:v [quality]: Calidad de 0 a 100
    // -an: Eliminar audio
    
    const scaleFilter = `scale=${resolution}:${resolution}:force_original_aspect_ratio=increase,crop=${resolution}:${resolution},fps=${fps}`;
    
    const command = `${ffmpegCommand} -y -i "${input}" -t ${duration} -vcodec libwebp -vf "${scaleFilter}" -loop 0 -lossless 0 -compression_level 4 -q:v ${quality} -preset default -an -vsync 0 "${output}"`;

    try {
        await execPromise(command, { maxBuffer: 1024 * 1024 * 50 });
        
        if (!fs.existsSync(output)) return { success: false, size: 0 };
        
        const stats = fs.statSync(output);
        const sizeKB = stats.size / 1024;

        return { success: true, size: sizeKB };
    } catch (error) {
        console.error('❌ Error FFmpeg:', error.message);
        return { success: false, size: 0 };
    }
}

// ----------------------------------------------------------------------
// --- INYECCIÓN DE METADATOS ---
// ----------------------------------------------------------------------

async function injectStickerMetadata(inputPath, outputPath, m) {
    const userName = m.pushName || "Usuario";
    const creationDate = new Date().toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });

    const finalFooterText = `@${userName} | ${creationDate}`;

    const exifData = {
        'sticker-pack-id': 'untrue-bot-id',
        'sticker-pack-name': 'UntrueBot Sticker\n',
        'sticker-pack-publisher': finalFooterText, 
        'author': finalFooterText,
        'emojis': ['✨', '😜']
    };

    const exifBuffer = generateExifBuffer(exifData);
    const img = new WebpMuxImage();
    
    await img.load(inputPath); 
    img.exif = exifBuffer;
    await img.save(outputPath);
}

// ----------------------------------------------------------------------
// --- COMANDO PRINCIPAL ---
// ----------------------------------------------------------------------

export async function mediaToStickerCommand(sock, m) {
    const remoteJid = m.key.remoteJid;
    const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quotedMessage) {
        await sock.sendMessage(remoteJid, { text: `❌ Responde a una imagen o video.` }, { quoted: m });
        return;
    }

    try {
        await sock.sendPresenceUpdate('composing', remoteJid);

        if (quotedMessage.imageMessage) {
            await processImageSticker(sock, m, quotedMessage.imageMessage);
        } else if (quotedMessage.videoMessage) {
            await processVideoSticker(sock, m, quotedMessage.videoMessage);
        } else {
            await sock.sendMessage(remoteJid, { text: '❌ Solo imágenes o videos.' }, { quoted: m });
        }

    } catch (error) {
        console.error('❌ Error Fatal:', error);
        await sock.sendMessage(remoteJid, { text: '❌ Error interno procesando el sticker.' }, { quoted: m });
    }
}

async function processImageSticker(sock, m, imageMessage) {
    const remoteJid = m.key.remoteJid;
    let tempInput = join(tmpdir(), `img-${Date.now()}.jpg`);
    let tempWebp = join(tmpdir(), `img-${Date.now()}.webp`);
    let finalWebp = join(tmpdir(), `sticker-${Date.now()}.webp`);

    try {
        const stream = await downloadContentFromMessage(imageMessage, 'image');
        const buffer = [];
        for await (const chunk of stream) buffer.push(chunk);
        fs.writeFileSync(tempInput, Buffer.concat(buffer));

        await sharp(tempInput)
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ quality: 75 }) // Calidad estandar para imagenes
            .toFile(tempWebp);

        await injectStickerMetadata(tempWebp, finalWebp, m); 

        await sock.sendMessage(remoteJid, { sticker: fs.readFileSync(finalWebp) }, { quoted: m });

    } catch (error) {
        throw error;
    } finally {
        cleanUpFile(tempInput);
        cleanUpFile(tempWebp);
        cleanUpFile(finalWebp);
    }
}

async function processVideoSticker(sock, m, videoMessage) {
    const remoteJid = m.key.remoteJid;
    let tempInput = join(tmpdir(), `vid-${Date.now()}.mp4`);
    let tempWebp = join(tmpdir(), `vid-${Date.now()}.webp`);
    let finalWebp = join(tmpdir(), `sticker-${Date.now()}.webp`);

    try {
        // 1. Validar duración (Permitimos hasta 15s)
        const videoDuration = videoMessage.seconds || 0;
        const MAX_DURATION = 15;

        if (videoDuration > MAX_DURATION) {
            await sock.sendMessage(remoteJid, { text: `❌ Máximo ${MAX_DURATION} segundos.` }, { quoted: m });
            return;
        }

        // 2. Descargar
        const stream = await downloadContentFromMessage(videoMessage, 'video');
        const buffer = [];
        for await (const chunk of stream) buffer.push(chunk);
        fs.writeFileSync(tempInput, Buffer.concat(buffer));

        // 3. ESTRATEGIA DE COMPRESIÓN ADAPTATIVA
        // WhatsApp requiere < 1MB (1000KB). Apuntamos a < 900KB para dejar espacio a metadata.
        
        // Configuración inicial basada en duración
        let fps = 15; 
        if (videoDuration < 5) fps = 20; // Video corto = Más fluidez
        if (videoDuration > 10) fps = 12; // Video largo = Menos FPS para ahorrar espacio

        let resolution = 512;
        let quality = 50;
        let attempt = 1;
        let conversionResult = { success: false, size: 0 };

        // --- INTENTO 1: Calidad Estándar ---
        console.log(`🎬 Intento 1: ${fps}fps, Q${quality}, Res${resolution}`);
        conversionResult = await ffmpegConvertToWebP(tempInput, tempWebp, { fps, duration: videoDuration, quality, resolution });

        // --- INTENTO 2: Si pesa más de 900KB, bajar calidad ---
        if (conversionResult.success && conversionResult.size > 900) {
            console.log(`⚠️ Sticker pesado (${conversionResult.size.toFixed(0)}KB). Reintentando bajando calidad...`);
            quality = 30; // Bajamos calidad agresivamente
            fps = Math.max(10, fps - 5); // Bajamos FPS pero no menos de 10
            attempt = 2;
            conversionResult = await ffmpegConvertToWebP(tempInput, tempWebp, { fps, duration: videoDuration, quality, resolution });
        }

        // --- INTENTO 3 (PÁNICO): Si sigue pesando mucho, bajar resolución ---
        if (conversionResult.success && conversionResult.size > 900) {
            console.log(`⚠️ Aún pesado (${conversionResult.size.toFixed(0)}KB). Modo Pánico (Reduciendo resolución)...`);
            resolution = 384; // Se ve decente en celular aun
            quality = 20;
            fps = 10;
            attempt = 3;
            conversionResult = await ffmpegConvertToWebP(tempInput, tempWebp, { fps, duration: videoDuration, quality, resolution });
        }

        if (!conversionResult.success || conversionResult.size > 1050) { // Margen de error 1.05MB max
             throw new Error('No se pudo comprimir el video por debajo de 1MB.');
        }

        // 4. Inyectar Metadatos
        await injectStickerMetadata(tempWebp, finalWebp, m);

        // 5. Verificar tamaño final con metadata
        const finalStats = fs.statSync(finalWebp);
        console.log(`✅ Sticker final enviado: ${(finalStats.size / 1024).toFixed(2)} KB (Intento ${attempt})`);

        if (finalStats.size > 1024 * 1024) {
             await sock.sendMessage(remoteJid, { text: '❌ El sticker es demasiado complejo para WhatsApp (Peso > 1MB).' }, { quoted: m });
             return;
        }

        // 6. Enviar
        await sock.sendMessage(remoteJid, { sticker: fs.readFileSync(finalWebp) }, { quoted: m });

    } catch (error) {
        console.error('❌ Error VideoSticker:', error);
        await sock.sendMessage(remoteJid, { text: '❌ Error creando el sticker animado.' }, { quoted: m });
    } finally {
        cleanUpFile(tempInput);
        cleanUpFile(tempWebp);
        cleanUpFile(finalWebp);
    }
}
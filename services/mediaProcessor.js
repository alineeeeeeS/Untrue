import { exec } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import fs from 'fs';
import { promisify } from 'util';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const execPromise = promisify(exec);

/**
 * Convierte un sticker a imagen (JPEG) o a video (MP4).
 * Implementa una lógica de conversión ULTRA-AGRESIVA con triple capa de fallback.
 */
export async function convertSticker(sock, quotedMsg, targetFormat) {
    let mediaData = null;
    let extension = '';
    let finalExtension = '';

    if (!quotedMsg || !quotedMsg.message || !quotedMsg.message.stickerMessage) {
        throw new Error("El mensaje citado no contiene un sticker.");
    }

    let mimeType = quotedMsg.message.stickerMessage.mimetype;
    let isVideoSticker = mimeType.includes('video');

    // 1. Determinar tipo de salida y descargar
    if (targetFormat === 'image') {
        finalExtension = 'jpeg';
        mediaData = await downloadMediaMessage(quotedMsg, 'buffer');
        extension = isVideoSticker ? 'mp4' : 'webp';
    } else if (targetFormat === 'video') {
        finalExtension = 'mp4';
        if (!isVideoSticker && mimeType !== 'image/webp') {
            await sock.sendMessage(quotedMsg.key.remoteJid, { text: "⚠️ Este sticker no es animado o no puede convertirse a video." }, { quoted: quotedMsg });
            return null;
        }
        mediaData = await downloadMediaMessage(quotedMsg, 'buffer');
        extension = isVideoSticker ? 'mp4' : 'webp';
    } else return null;

    if (!mediaData) return null;

    const fileBase = Date.now();
    const inputFilePath = join(tmpdir(), `input-${fileBase}.${extension}`);
    const outputFilePath = join(tmpdir(), `output-${fileBase}.${finalExtension}`);

    try {
        fs.writeFileSync(inputFilePath, mediaData);

        // 🔹 CASO #simg → IMAGEN
        if (targetFormat === 'image') {
            console.log("Convirtiendo a Imagen fija (FFmpeg)...");
            const cmd = `ffmpeg -y -i "${inputFilePath}" -vframes 1 -vf scale=512:-1 -q:v 2 "${outputFilePath}"`;
            await execPromise(cmd, { maxBuffer: 1024 * 1024 * 50 });
        }

        // 🔹 CASO #svid → VIDEO con FALLBACK DE TRIPLE CAPA
        else if (targetFormat === 'video') {
            if (extension === 'webp') {
                const tempFrameWebpPath = join(tmpdir(), `temp-frame-${fileBase}.webp`); 
                const tempPngPath = join(tmpdir(), `temp-${fileBase}.png`); 
                let successfullyExtractedFrame = false;

                try {
                    console.log("Convirtiendo WebP: ¡FUERZA BRUTA FINAL! Forzando formato de entrada a 'image2'...");
                    // RUTA A: CONVERSIÓN DIRECTA (FORZANDO FORMATO DE ENTRADA A 'image2')
                    const cmd_animated = `ffmpeg -y -f image2 -i "${inputFilePath}" -fflags +genpts -ignore_editlist -c:v libx264 -pix_fmt yuv420p -movflags +faststart -crf 25 -vf scale=512:-1 -r 25 "${outputFilePath}"`;
                    await execPromise(cmd_animated, { maxBuffer: 1024 * 1024 * 100 });
                    console.log("   -> ✅ Ruta A (Animación completa) completada.");

                } catch (errorA) {
                    console.log(`   -> ⚠️ Ruta A Fallida. Iniciando Ruta B (Extracción de frame forzada con triple capa)...`);

                    // --- FALLBACK ROBUSTO (Ruta B: Frame estático a Video de 2s) ---

                    // 1. Extracción de Frame (webpmux + dwebp)
                    try {
                        console.log("      -> Intentando extracción con webpmux/dwebp (Herramientas Nativas)...");

                        // 1a. Usar webpmux para obtener el primer frame
                        const cmd_webpmux = `webpmux -get frame 1 "${inputFilePath}" -o "${tempFrameWebpPath}"`;
                        await execPromise(cmd_webpmux, { maxBuffer: 1024 * 1024 * 50 });

                        // 1b. Usar dwebp para convertir el frame a PNG
                        const cmd_dwebp = `dwebp "${tempFrameWebpPath}" -o "${tempPngPath}"`;
                        await execPromise(cmd_dwebp, { maxBuffer: 1024 * 1024 * 50 });

                        successfullyExtractedFrame = true;
                        cleanUpFile(tempFrameWebpPath);
                        console.log("      -> ✅ Extracción Nativa (webpmux/dwebp) completada.");

                    } catch (errorNative) {
                        cleanUpFile(tempFrameWebpPath);
                        console.log(`      -> Falló la extracción nativa. Intentando FFmpeg (último recurso)...`);

                        // 2. Extracción de Frame (FFmpeg - Último Recurso)
                        try {
                            const cmd_frame_ffmpeg = `ffmpeg -y -i "${inputFilePath}" -vframes 1 -vcodec png "${tempPngPath}"`;
                            await execPromise(cmd_frame_ffmpeg, { maxBuffer: 1024 * 1024 * 50 });
                            successfullyExtractedFrame = true;
                            console.log("      -> ✅ Extracción con FFmpeg completada.");

                        } catch (errorFinal) {
                            throw new Error("Fallo crítico: No se pudo extraer el primer frame para el fallback de video.");
                        }
                    }

                    // 3. Crear video de 2 segundos a partir del frame extraído (PNG)
                    if (!successfullyExtractedFrame) {
                         throw new Error("Fallo interno en la lógica de extracción de frames.");
                    }

                    const cmd_video = `ffmpeg -y -loop 1 -i "${tempPngPath}" -t 2 -c:v libx264 -tune stillimage -pix_fmt yuv420p -movflags +faststart -crf 25 "${outputFilePath}"`;
                    await execPromise(cmd_video, { maxBuffer: 1024 * 1024 * 100 });

                    cleanUpFile(tempPngPath);
                    console.log("   -> ✅ Ruta B (Video de Frame Forzado) completada. Se generó un video estático de 2s.");
                } // <-- Esta llave corrige el error SyntaxError
            } else if (extension === 'mp4') {
                // MP4 a MP4 (copia directa)
                fs.copyFileSync(inputFilePath, outputFilePath);
            } else {
                throw new Error("Formato no compatible para conversión a video.");
            }
        }

        if (!fs.existsSync(outputFilePath)) {
            throw new Error("No se generó el archivo de salida.");
        }

        cleanUpFile(inputFilePath);

        return { filePath: outputFilePath, type: targetFormat };

    } catch (error) {
        console.error("Error en conversión:", error.message);
        cleanUpFile(inputFilePath);
        cleanUpFile(outputFilePath);
        throw error;
    }
}

/**
 * Elimina un archivo temporal.
 */
export function cleanUpFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Archivo temporal eliminado: ${filePath}`);
        } catch {}
    }
}
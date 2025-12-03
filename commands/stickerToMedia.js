import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { writeFile, unlink, existsSync, mkdirSync } from 'fs';
import { promisify } from 'util';
import ffmpeg from 'fluent-ffmpeg';
import WebP from 'node-webpmux';
import sharp from 'sharp';
const { Image } = WebP;

const writeFileAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);

// Tu ruta específica de ffmpeg
const ffmpegCommand = '/home/runner/workspace/node_modules/ffmpeg-static/ffmpeg';

class StickerToMediaService {
    constructor() {
        this.tempDir = './temp';
        ffmpeg.setFfmpegPath(ffmpegCommand);
        console.log(`🔧 FFmpeg configurado en: ${ffmpegCommand}`);
        this.ensureTempDir();
    }

    ensureTempDir() {
        try {
            if (!existsSync(this.tempDir)) {
                mkdirSync(this.tempDir, { recursive: true });
                console.log('📁 Carpeta temp creada');
            }
        } catch (error) {
            console.error('❌ Error creando carpeta temp:', error);
        }
    }

    async convertStickerToMedia(m, sock) {
        try {
            console.log('🔄 Convirtiendo sticker a media...');
            if (!m.message?.stickerMessage) {
                throw new Error('El mensaje no contiene un sticker');
            }

            const stickerMessage = m.message.stickerMessage;
            const isAnimated = stickerMessage.isAnimated || false;
            console.log(`📦 Tipo de sticker: ${isAnimated ? 'Animado' : 'Estático'}`);

            const mediaBuffer = await downloadMediaMessage(m, 'buffer', {}, {
                logger: console,
                reuploadRequest: sock.updateMediaMessage
            });

            if (!mediaBuffer) {
                throw new Error('No se pudo descargar el sticker');
            }

            console.log(`✅ Sticker descargado - Tamaño: ${(mediaBuffer.length / 1024).toFixed(2)} KB`);

            if (isAnimated) {
                // ESTRATEGIA MINIMALISTA: WebP -> GIF (Sharp + Resize) -> MP4 (FFmpeg solo codifica)
                return await this.convertAnimatedSticker(mediaBuffer);
            } else {
                return await this.convertStaticSticker(mediaBuffer);
            }

        } catch (error) {
            console.error('❌ Error convirtiendo sticker:', error);
            throw new Error(`Error al convertir sticker: ${error.message}`);
        }
    }

    // Método Estático (Sin cambios)
    async convertStaticSticker(stickerBuffer) {
        try {
            console.log('🖼️ Convirtiendo sticker estático a imagen con ffmpeg...');
            const tempInput = `${this.tempDir}/sticker_${Date.now()}.webp`;
            const tempOutput = `${this.tempDir}/image_${Date.now()}.jpg`;
            await writeFileAsync(tempInput, stickerBuffer);

            await new Promise((resolve, reject) => {
                ffmpeg(tempInput)
                    .output(tempOutput)
                    .on('end', () => resolve())
                    .on('error', (error) => reject(error))
                    .run();
            });

            if (!existsSync(tempOutput)) throw new Error('No se generó el archivo de salida');

            const fs = await import('fs');
            const imageBuffer = await fs.promises.readFile(tempOutput);
            await this.cleanupFiles([tempInput, tempOutput]);

            console.log('✅ Sticker estático convertido a imagen');
            return { buffer: imageBuffer, type: 'image', mimetype: 'image/jpeg' };
        } catch (error) {
            console.error('❌ Error convirtiendo sticker estático:', error);
            return await this.convertStaticSimple(stickerBuffer);
        }
    }

    /**
     * @description ESTRATEGIA MINIMALISTA: Convierte WebP a GIF con sharp y lo redimensiona. FFmpeg solo codifica a MP4.
     */
    async convertAnimatedSticker(stickerBuffer) {
        let tempInputGif, tempOutputMp4;
        try {
            console.log('🎬 ESTRATEGIA MINIMALISTA: WebP -> GIF (Sharp + Resize) -> MP4 (FFmpeg)');

            // 1. Usar SHARP para decodificar WebP, redimensionar a 512x512 y convertirlo a GIF
            // CLAVE: Esto elimina la necesidad de usar el filtro -vf de FFmpeg, que es el que falla.
            console.log('1. Decodificando WebP a GIF con Sharp (incluye redimensionado)...');
            const gifBuffer = await sharp(stickerBuffer, { animated: true })
                .resize(512, 512, {
                    fit: 'contain', // Asegura que el GIF quepa en 512x512
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toFormat('gif')
                .toBuffer();

            // 2. Guardar GIF temporalmente
            tempInputGif = `${this.tempDir}/animated_${Date.now()}.gif`;
            tempOutputMp4 = `${this.tempDir}/video_${Date.now()}.mp4`;
            await writeFileAsync(tempInputGif, gifBuffer);
            console.log('✅ GIF temporal redimensionado creado.');

            // 3. Compilar GIF a MP4 usando FFmpeg (Solo codificación)
            console.log('2. Compilando GIF a MP4 con FFmpeg (Solo codificación)...');
            await new Promise((resolve, reject) => {
                ffmpeg(tempInputGif)
                    .inputOptions([
                        '-ignore_loop 0', 
                    ])
                    .outputOptions([
                        // Opciones de salida mínimas, sin filtros
                        '-c:v libx264',
                        '-pix_fmt yuv420p',
                        '-movflags +faststart',
                        '-r 15', 
                        '-crf 28', 
                        '-preset ultrafast', // Máxima velocidad para evitar timeouts
                        '-t 8',
                    ])
                    .output(tempOutputMp4)
                    .on('start', (commandLine) => {
                        console.log('🚀 Comando ffmpeg (GIF a MP4, sin filtros):', commandLine);
                    })
                    .on('end', () => {
                        console.log('✅ Conversión GIF a MP4 completada');
                        resolve();
                    })
                    .on('error', (error) => {
                        console.error('❌ Error en FFmpeg (GIF a MP4):', error);
                        reject(error);
                    })
                    .run();
            });

            if (!existsSync(tempOutputMp4)) throw new Error('No se generó el archivo de video');

            const fs = await import('fs');
            const videoBuffer = await fs.promises.readFile(tempOutputMp4);

            // 4. Limpiar archivos temporales
            await this.cleanupFiles([tempInputGif, tempOutputMp4]);

            console.log('✅ Sticker animado convertido a video MP4');
            return { buffer: videoBuffer, type: 'video', mimetype: 'video/mp4' };

        } catch (error) {
            console.error('❌ ESTRATEGIA MINIMALISTA falló:', error);
            await this.cleanupFiles([tempInputGif, tempOutputMp4].filter(f => f));

            // Fallback (último recurso): Intentar devolver el GIF de sharp, si la conversión falla.
            try {
                // Generar el GIF de nuevo (o usar el buffer si se pudiera pasar, pero por seguridad lo regeneramos).
                const finalGifBuffer = await sharp(stickerBuffer, { animated: true })
                    .toFormat('gif')
                    .toBuffer();

                console.log('⚠️ Falló la conversión a video, devolviendo el GIF redimensionado como imagen...');
                return { buffer: finalGifBuffer, type: 'image', mimetype: 'image/gif' }; 
            } catch (gifError) {
                 console.error('❌ Fallo devolver el GIF:', gifError);
                 throw new Error(`No se pudo convertir el sticker animado a video. Error: ${error.message}`);
            }
        }
    }

    // Método alternativo para stickers estáticos (sin ffmpeg) - Sin cambios
    async convertStaticSimple(stickerBuffer) {
        try {
            console.log('🖼️ Usando método simple para sticker estático...');
            const tempFile = `${this.tempDir}/sticker_simple_${Date.now()}.webp`;
            await writeFileAsync(tempFile, stickerBuffer);

            const img = new Image();
            await img.load(tempFile);

            const frameBuffer = await img.frames[0].toBuffer('image/png'); 
            await this.cleanupFiles([tempFile]);

            return { buffer: frameBuffer, type: 'image', mimetype: 'image/png' };
        } catch (error) {
            console.error('❌ Error en método simple:', error);
            throw new Error('No se pudo convertir el sticker estático');
        }
    }

    async cleanupFiles(files) {
        try {
            for (const file of files) {
                if (existsSync(file)) {
                    await unlinkAsync(file);
                    console.log(`🧹 Archivo temporal eliminado: ${file}`);
                }
            }
        } catch (error) {
            console.log('⚠️ Error limpiando archivos temporales:', error.message);
        }
    }
}

const stickerToMediaService = new StickerToMediaService();

export async function stickerToMediaCommand(sock, m, args) {
    try {
        let targetMessage = m;

        if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            targetMessage = {
                ...m,
                message: m.message.extendedTextMessage.contextInfo.quotedMessage
            };
            console.log('🔍 Usando sticker citado...');
        }

        if (!targetMessage.message?.stickerMessage) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: `❌ *Uso correcto:*\n\n` +
                      `▸ Debes responder a un sticker con *#smedia* para convertirlo.`
            }, { quoted: m });
            return;
        }

        try {
            const mediaResult = await stickerToMediaService.convertStickerToMedia(targetMessage, sock);

            console.log(`✅ Conversión exitosa - Tipo: ${mediaResult.type}`);

            const messageOptions = {
                caption: mediaResult.type === 'image' 
                    ? '*✅ Sticker convertido a imagen*' 
                    : '*✅ Sticker animado convertido a video*'
            };

            if (mediaResult.type === 'image') {
                messageOptions.image = mediaResult.buffer;
                messageOptions.mimetype = mediaResult.mimetype;
            } else if (mediaResult.type === 'video') {
                messageOptions.video = mediaResult.buffer;
                messageOptions.mimetype = mediaResult.mimetype;
            }

            await sock.sendMessage(m.key.remoteJid, messageOptions, { quoted: m });
            console.log(`✅ ${mediaResult.type.toUpperCase()} enviado correctamente`);

        } catch (conversionError) {
            console.error('❌ Error en conversión:', conversionError);

            let errorMessage = '❌ *Error al convertir el sticker*\n\n';

            if (conversionError.message.includes('No se pudo convertir')) {
                errorMessage += '🔧 *Error de conversión*\n\n';
                errorMessage += '💡 *Posibles causas:*\n';
                errorMessage += '• El sticker usa un formato muy específico\n';
                errorMessage += '• Puede ser un sticker muy complejo\n';
                errorMessage += '• Problemas temporales de procesamiento (Timeout en Replit)\n\n';
                errorMessage += '🔄 Intenta con otro sticker.';
            } else {
                errorMessage += `⚠️ *Error:* ${conversionError.message}\n`;
                errorMessage += '🔄 Intenta con otro sticker.';
            }

            await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
        }

    } catch (error) {
        console.error('💥 Error general:', error);
        await sock.sendMessage(m.key.remoteJid, { 
            text: '❌ Error inesperado. Por favor intenta nuevamente.' 
        }, { quoted: m });
    }
}
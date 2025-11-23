import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';
import axios from 'axios';
import Tesseract from 'tesseract.js';

/**
 * Función unificada para extraer texto de imágenes Y transcribir audio
 */
export async function totextCommand(sock, m, args) {
    let tempFilePath;

    try {
        // Verificar si hay un mensaje respondido
        const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMessage) {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *USO INCORRECTO*\n\nResponde a una *imagen* o *audio* con:\n*#totext*\n\n📷 Imagen → Extrae texto (OCR)\n🎵 Audio → Transcribe a texto` 
                },
                { quoted: m }
            );
            return;
        }

        // Determinar el tipo de medio
        let mediaType = '';
        let mediaBuffer = null;

        if (quotedMessage.imageMessage) {
            mediaType = 'image';
            mediaBuffer = await downloadImage(quotedMessage.imageMessage);
        } else if (quotedMessage.audioMessage) {
            mediaType = 'audio';
            mediaBuffer = await downloadAudio(quotedMessage.audioMessage);
        } else if (quotedMessage.videoMessage) {
            mediaType = 'audio';
            // Extraer audio del video
            mediaBuffer = await extractAudioFromVideo(quotedMessage.videoMessage);
        } else {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *MEDIO NO SOPORTADO*\n\nResponde a una *imagen* o *audio* válido.` 
                },
                { quoted: m }
            );
            return;
        }

        if (!mediaBuffer || mediaBuffer.length === 0) {
            throw new Error('No se pudo descargar el medio');
        }

        console.log(`📥 ${mediaType === 'image' ? 'Imagen' : 'Audio'} descargado: ${(mediaBuffer.length / 1024).toFixed(2)} KB`);

        // Enviar mensaje de procesamiento
        const processingMsg = await sock.sendMessage(
            m.key.remoteJid,
            { 
                text: mediaType === 'image' 
                    ? `🔍 *Analizando imagen...*\n⏳ Extrayendo texto...`
                    : `🎵 *Transcribiendo audio...*\n⏳ Convirtiendo a texto...`
            },
            { quoted: m }
        );

        // Guardar archivo temporalmente
        const extension = mediaType === 'image' ? 'jpg' : 'mp3';
        tempFilePath = join(tmpdir(), `totext-${mediaType}-${Date.now()}.${extension}`);
        const fs = await import('fs');
        await fs.promises.writeFile(tempFilePath, mediaBuffer);

        let textoExtraido = '';

        if (mediaType === 'image') {
            console.log('🔍 Procesando imagen con OCR...');
            textoExtraido = await procesarImagen(tempFilePath);
        } else {
            console.log('🎵 Procesando audio con Speech-to-Text...');

            // Optimizar audio antes de transcribir
            const audioOptimizadoPath = await optimizarAudio(tempFilePath);
            textoExtraido = await transcribirConAssemblyAI(audioOptimizadoPath);

            // Limpiar archivo optimizado
            if (audioOptimizadoPath !== tempFilePath) {
                unlinkSync(audioOptimizadoPath);
            }
        }

        // Procesar el texto extraído
        const textoLimpio = limpiarTexto(textoExtraido);

        if (!textoLimpio || textoLimpio.trim().length === 0) {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *NO SE DETECTÓ TEXTO*\n\nNo se pudo ${
                        mediaType === 'image' 
                        ? 'reconocer texto en la imagen' 
                        : 'transcribir el audio'
                    }.\n\n💡 Intenta con ${
                        mediaType === 'image' 
                        ? 'una imagen más clara y nítida' 
                        : 'un audio más claro y sin ruido'
                    }.` 
                },
                { quoted: m }
            );
            return;
        }

        // Enviar el resultado
        await sock.sendMessage(
            m.key.remoteJid,
            { 
                text: `✅ *TEXTO EXTRAÍDO* | ${mediaType === 'image' ? '📷 IMAGEN' : '🎵 AUDIO'}\n\n${textoLimpio}` 
            },
            { quoted: m }
        );

        console.log(`✅ ${mediaType === 'image' ? 'OCR' : 'Transcripción'} completado: ${textoLimpio.length} caracteres`);

        // Eliminar mensaje de procesamiento
        if (processingMsg) {
            try {
                await sock.sendMessage(m.key.remoteJid, { delete: processingMsg.key });
            } catch (deleteError) {
                console.warn('⚠️ No se pudo eliminar mensaje de procesamiento:', deleteError.message);
            }
        }

    } catch (error) {
        console.error('❌ Error en totextCommand:', error);
        await sock.sendMessage(
            m.key.remoteJid,
            { 
                text: `❌ *ERROR AL PROCESAR*\n\n${error.message}` 
            },
            { quoted: m }
        );
    } finally {
        // Limpieza de archivos temporales
        try {
            if (tempFilePath) unlinkSync(tempFilePath);
            console.log('🧹 Archivo temporal eliminado');
        } catch (cleanError) {
            console.warn('⚠️ Error limpiando archivo temporal:', cleanError.message);
        }
    }
}

/**
 * Optimizar audio para mejor transcripción
 */
async function optimizarAudio(audioPath) {
    try {
        const fs = await import('fs');
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execPromise = promisify(exec);
        const ffmpegCommand = '/home/runner/workspace/node_modules/ffmpeg-static/ffmpeg';

        const audioOptimizadoPath = join(tmpdir(), `audio-optimizado-${Date.now()}.mp3`);

        // Optimizar audio para Speech-to-Text:
        // - 16kHz sample rate (estándar para STT)
        // - Mono channel
        // - Bitrate constante
        // - Normalizar volumen
        const optimizeCommand = `"${ffmpegCommand}" -i "${audioPath}" -ac 1 -ar 16000 -b:a 64k -af "volume=1.5" -y "${audioOptimizadoPath}"`;

        await execPromise(optimizeCommand);
        console.log('✅ Audio optimizado para transcripción');

        return audioOptimizadoPath;

    } catch (error) {
        console.log('❌ Optimización de audio falló, usando original:', error.message);
        return audioPath; // Devolver original si falla
    }
}

/**
 * Procesar imagen con OCR de alta calidad
 */
async function procesarImagen(imagePath) {
    try {
        console.log('🔄 Usando OCR.space para imagen...');

        // Primero intentar con OCR.space (mejor calidad)
        const textoOCRspace = await procesarConOCRspace(imagePath);
        if (textoOCRspace && textoOCRspace.trim().length > 10) {
            console.log('✅ OCR.space exitoso');
            return textoOCRspace;
        }

        // Si falla OCR.space, usar Tesseract como respaldo
        console.log('🔄 OCR.space falló, usando Tesseract...');
        const textoTesseract = await procesarConTesseract(imagePath);
        return textoTesseract;

    } catch (error) {
        console.error('Error en procesamiento de imagen:', error);
        throw new Error('Error al procesar la imagen con OCR');
    }
}

/**
 * OCR.space API (Alta precisión)
 */
async function procesarConOCRspace(imagePath) {
    try {
        const fs = await import('fs');
        const imageBuffer = await fs.promises.readFile(imagePath);

        const API_KEY = 'K87430069588957'; // Tu API key de OCR.space

        const response = await axios.post(
            'https://api.ocr.space/parse/image',
            {
                base64Image: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
                apikey: API_KEY,
                language: 'spa',
                isOverlayRequired: false,
                OCREngine: 2,
                scale: true,
                isTable: true,
                detectOrientation: true
            },
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 30000
            }
        );

        if (response.data && 
            response.data.ParsedResults && 
            response.data.ParsedResults[0] &&
            response.data.ParsedResults[0].ParsedText) {

            return response.data.ParsedResults[0].ParsedText;
        }

        return null;

    } catch (error) {
        console.log('❌ OCR.space falló:', error.message);
        return null;
    }
}

/**
 * Tesseract.js (Respaldo local)
 */
async function procesarConTesseract(imagePath) {
    try {
        const { data: { text } } = await Tesseract.recognize(
            imagePath,
            'spa+eng',
            { logger: m => console.log('Tesseract:', m.status) }
        );
        return text;
    } catch (error) {
        console.log('❌ Tesseract falló:', error.message);
        return null;
    }
}

/**
 * AssemblyAI (Funciona perfectamente - Único método para audio)
 */
async function transcribirConAssemblyAI(audioPath) {
    try {
        const fs = await import('fs');
        const audioBuffer = await fs.promises.readFile(audioPath);

        // Tu API key de AssemblyAI
        const ASSEMBLYAI_API_KEY = 'f5f81f9039c64126aae7e3d117a49650';

        console.log('🎵 Subiendo audio a AssemblyAI...');

        // Subir audio a AssemblyAI
        const uploadResponse = await axios.post(
            'https://api.assemblyai.com/v2/upload',
            audioBuffer,
            {
                headers: {
                    'Authorization': ASSEMBLYAI_API_KEY,
                    'Content-Type': 'application/octet-stream'
                },
                timeout: 30000
            }
        );

        const uploadUrl = uploadResponse.data.upload_url;
        console.log('✅ Audio subido, solicitando transcripción...');

        // Solicitar transcripción con parámetros optimizados
        const transcribeResponse = await axios.post(
            'https://api.assemblyai.com/v2/transcript',
            {
                audio_url: uploadUrl,
                language_code: 'es',
                punctuate: true,
                format_text: true,
                disfluencies: false
            },
            {
                headers: {
                    'Authorization': ASSEMBLYAI_API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const transcriptId = transcribeResponse.data.id;
        console.log(`🔄 ID de transcripción: ${transcriptId}`);

        // Esperar y obtener resultado (máximo 45 segundos)
        let transcriptResult = null;
        for (let i = 0; i < 45; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const statusResponse = await axios.get(
                `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
                {
                    headers: {
                        'Authorization': ASSEMBLYAI_API_KEY
                    },
                    timeout: 10000
                }
            );

            const status = statusResponse.data.status;
            console.log(`⏳ Estado transcripción [${i + 1}/45]: ${status}`);

            if (status === 'completed') {
                transcriptResult = statusResponse.data.text;
                console.log('✅ Transcripción completada por AssemblyAI');
                break;
            } else if (status === 'error') {
                console.log('❌ AssemblyAI error:', statusResponse.data.error);
                break;
            }
        }

        if (!transcriptResult) {
            throw new Error('Tiempo de espera agotado para la transcripción');
        }

        return transcriptResult;

    } catch (error) {
        console.log('❌ AssemblyAI falló:', error.message);
        throw new Error('Error al transcribir el audio con AssemblyAI');
    }
}

/**
 * Descargar imagen del mensaje
 */
async function downloadImage(imageMessage) {
    try {
        const stream = await downloadContentFromMessage(imageMessage, 'image');
        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        return Buffer.concat(chunks);
    } catch (error) {
        console.error('Error descargando imagen:', error);
        return null;
    }
}

/**
 * Descargar audio del mensaje
 */
async function downloadAudio(audioMessage) {
    try {
        const stream = await downloadContentFromMessage(audioMessage, 'audio');
        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        return Buffer.concat(chunks);
    } catch (error) {
        console.error('Error descargando audio:', error);
        return null;
    }
}

/**
 * Extraer audio de video
 */
async function extractAudioFromVideo(videoMessage) {
    try {
        // Primero descargar el video
        const videoBuffer = await downloadContentFromMessage(videoMessage, 'video');
        const tempVideoPath = join(tmpdir(), `video-${Date.now()}.mp4`);
        const tempAudioPath = join(tmpdir(), `audio-${Date.now()}.mp3`);

        const fs = await import('fs');
        await fs.promises.writeFile(tempVideoPath, videoBuffer);

        // Extraer audio con FFmpeg
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execPromise = promisify(exec);
        const ffmpegCommand = '/home/runner/workspace/node_modules/ffmpeg-static/ffmpeg';

        await execPromise(`"${ffmpegCommand}" -i "${tempVideoPath}" -vn -acodec libmp3lame -ab 128k -ar 44100 -y "${tempAudioPath}"`);

        const audioBuffer = await fs.promises.readFile(tempAudioPath);

        // Limpiar temporales
        unlinkSync(tempVideoPath);
        unlinkSync(tempAudioPath);

        return audioBuffer;

    } catch (error) {
        console.error('Error extrayendo audio de video:', error);
        return null;
    }
}

/**
 * Función auxiliar para descargar contenido
 */
async function downloadContentFromMessage(message, type) {
    const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
    return downloadContentFromMessage(message, type);
}

/**
 * Limpiar y formatear el texto extraído
 */
function limpiarTexto(texto) {
    if (!texto) return '';

    return texto
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[^\S\n]+/g, ' ')
        .trim();
}
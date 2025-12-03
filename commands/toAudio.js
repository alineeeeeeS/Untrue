import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'util';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

const execPromise = promisify(exec);
const ffmpegCommand = '/home/runner/workspace/node_modules/ffmpeg-static/ffmpeg';

/**
 * Extrae audio de un video (cualquier formato)
 */
export async function toAudioCommand(sock, m, args) {
    let tempVideoPath, tempAudioPath;

    try {
        // Verificar si hay un mensaje respondido de forma más segura
        const contextInfo = m.message?.extendedTextMessage?.contextInfo;
        const quotedMessage = contextInfo?.quotedMessage;

        if (!quotedMessage) {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *Uso incorrecto*\n\n▸ Debes responder a un video con *#toaud* para extraer el audio correctamente.` 
                },
                { quoted: m }
            );
            return;
        }

        // Verificar si el mensaje respondido contiene un video
        if (!quotedMessage.videoMessage && !quotedMessage.documentMessage) {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *Formato inválido*\n\n▸ El mensaje al que respondiste no contiene un video válido.` 
                },
                { quoted: m }
            );
            return;
        }

        // Enviar mensaje de procesamiento
        const processingMsg = await sock.sendMessage(
            m.key.remoteJid,
            { text: `🎧 *Extrayendo audio...*` },
            { quoted: m }
        );

        let videoBuffer;
        let mimetype = 'video/mp4';
        let filename = 'video';

        // Descargar el contenido del mensaje usando la función correcta de Baileys
        let downloadType;
        let messageContent;

        if (quotedMessage.videoMessage) {
            downloadType = 'video';
            messageContent = quotedMessage.videoMessage;
            mimetype = quotedMessage.videoMessage.mimetype || 'video/mp4';
            filename = quotedMessage.videoMessage.fileName || 'video.mp4';
        } else if (quotedMessage.documentMessage) {
            downloadType = 'document';
            messageContent = quotedMessage.documentMessage;
            mimetype = quotedMessage.documentMessage.mimetype || 'video/mp4';
            filename = quotedMessage.documentMessage.fileName || 'video';
        }

        console.log(`📥 Descargando ${downloadType}: ${filename}`);

        // Crear stream de descarga
        const stream = await downloadContentFromMessage(messageContent, downloadType);
        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        videoBuffer = Buffer.concat(chunks);

        if (!videoBuffer || videoBuffer.length === 0) {
            throw new Error('No se pudo descargar el video o el archivo está vacío');
        }

        console.log(`🎧 Procesando audio de video: ${filename}, tipo: ${mimetype}`);
        console.log(`📊 Tamaño del buffer: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

        // Crear archivos temporales
        tempVideoPath = join(tmpdir(), `input-video-${Date.now()}.mp4`);
        tempAudioPath = join(tmpdir(), `extracted-audio-${Date.now()}.mp3`);

        // Guardar buffer temporalmente
        const fs = await import('fs');
        const { writeFile } = await import('fs/promises');
        await writeFile(tempVideoPath, videoBuffer);

        console.log('🔧 Ejecutando FFmpeg para extraer audio...');

        // Extraer audio usando FFmpeg con el comando directo
        const ffmpegCommandLine = `"${ffmpegCommand}" -i "${tempVideoPath}" -vn -acodec libmp3lame -ab 128k -ar 44100 -y "${tempAudioPath}"`;

        try {
            const { stdout, stderr } = await execPromise(ffmpegCommandLine);
            console.log('✅ Audio extraído exitosamente con FFmpeg');
        } catch (ffmpegError) {
            console.error('❌ Error en FFmpeg:', ffmpegError.message);

            // Intentar método alternativo si falla
            console.log('🔄 Intentando método alternativo...');
            const altCommand = `"${ffmpegCommand}" -i "${tempVideoPath}" -q:a 0 -map a "${tempAudioPath}"`;
            await execPromise(altCommand);
        }

        // Leer el archivo de audio resultante
        const audioBuffer = await fs.promises.readFile(tempAudioPath);
        const fileSize = audioBuffer.length;

        if (fileSize === 0) {
            throw new Error('El archivo de audio está vacío');
        }

        console.log(`✅ Audio extraído: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

        // Enviar el audio
        await sock.sendMessage(
            m.key.remoteJid,
            {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                ptt: false,
                fileName: `audio_extraido_${Date.now()}.mp3`
            },
            { quoted: m }
        );

        console.log('✅ Audio enviado exitosamente');

        // Eliminar mensaje de procesamiento
        if (processingMsg) {
            try {
                await sock.sendMessage(m.key.remoteJid, { delete: processingMsg.key });
            } catch (deleteError) {
                console.warn('⚠️ No se pudo eliminar mensaje de procesamiento:', deleteError.message);
            }
        }

    } catch (error) {
        console.error('❌ Error procesando audio:', error);
        await sock.sendMessage(
            m.key.remoteJid,
            { 
                text: `❌ *Error de procesos*\n\n▸ No se pudo extraer correctamente el audio del video.\n▸ Error: ${error.message}` 
            },
            { quoted: m }
        );
    } finally {
        // Limpieza de archivos temporales
        try {
            if (tempVideoPath) unlinkSync(tempVideoPath);
            if (tempAudioPath) unlinkSync(tempAudioPath);
            console.log('🧹 Archivos temporales eliminados');
        } catch (cleanError) {
            console.warn('⚠️ Error limpiando archivos temporales:', cleanError.message);
        }
    }
}
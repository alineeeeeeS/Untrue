import { exec } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import fs from 'fs';
import { promisify } from 'util';

const execPromise = promisify(exec);

const ytDlpCommand = '/home/runner/workspace/.pythonlibs/bin/yt-dlp';
const ffmpegCommand = '/home/runner/workspace/node_modules/ffmpeg-static/ffmpeg';

/**
 * Obtiene información del video - CÓDIGO SIMPLE
 */
export async function getYouTubeVideoInfo(queryOrUrl) {
    const command = `"${ytDlpCommand}" --dump-json --no-playlist "${queryOrUrl}"`;

    try {
        const { stdout } = await execPromise(command);
        const info = JSON.parse(stdout);

        const uploadDate = info.upload_date ? 
            `${info.upload_date.substring(6, 8)}/${info.upload_date.substring(4, 6)}/${info.upload_date.substring(0, 4)}` : 
            'N/A';

        return {
            title: info.title || 'Título Desconocido',
            author: info.channel || info.uploader || 'Autor Desconocido',
            duration: info.duration || 0,
            uploadDate: uploadDate,
            thumbnail: info.thumbnail || null,
            url: info.webpage_url || queryOrUrl
        };
    } catch (error) {
        console.error("Error al obtener info del video:", error);
        return getDefaultVideoInfo();
    }
}

function getDefaultVideoInfo() {
    return {
        title: 'YouTube Video',
        author: 'Desconocido',
        duration: 0,
        uploadDate: 'N/A',
        thumbnail: null,
        url: null
    };
}

/**
 * Descarga video de YouTube - CÓDIGO SIMPLE
 */
export async function downloadYoutubeVideo(args) {
    const isSearch = !args[0].startsWith('http');
    const queryOrUrl = isSearch ? `ytsearch1:${args.join(' ')}` : args[0];

    const tempFileName = `youtube-video-${Date.now()}.mp4`;
    const tempFilePath = join(tmpdir(), tempFileName);

    let videoInfo = getDefaultVideoInfo();

    console.log(`📥 Descargando Video: ${isSearch ? 'Búsqueda' : 'URL'}`);

    try {
        videoInfo = await getYouTubeVideoInfo(queryOrUrl);
        console.log(`🔍 Info: ${videoInfo.title}`);
    } catch (error) {
        console.error("Error obteniendo información:", error);
    }

    // COMANDO SIMPLE - igual que en Replit
    const command = `"${ytDlpCommand}" -f "best[height<=480]" --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`;

    try {
        await execPromise(command);

        if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
            const stats = fs.statSync(tempFilePath);
            console.log(`✅ Video descargado: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

            return {
                filePath: tempFilePath,
                videoInfo: videoInfo
            };
        }
    } catch (error) {
        console.error("❌ Error al descargar video:", error.message);
    }

    cleanUpFile(tempFilePath);
    return null;
}

/**
 * Descarga audio de YouTube - CÓDIGO SIMPLE
 */
export async function downloadYoutubeAudio(args) {
    const isSearch = !args[0].startsWith('http');
    const queryOrUrl = isSearch ? `ytsearch1:${args.join(' ')}` : args[0];

    let videoInfo = getDefaultVideoInfo();

    console.log(`🎵 Descargando Audio: ${isSearch ? 'Búsqueda' : 'URL'}`);

    try {
        videoInfo = await getYouTubeVideoInfo(queryOrUrl);
        console.log(`🔍 Info: ${videoInfo.title}`);
    } catch (error) {
        console.error("Error obteniendo información:", error);
    }

    const tempFileName = `youtube-audio-${Date.now()}`;
    const tempFilePath = join(tmpdir(), tempFileName);

    // COMANDO SIMPLE - igual que en Replit
    const command = `"${ytDlpCommand}" -f "bestaudio" --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`;

    try {
        await execPromise(command);

        // Verificar archivos posibles
        const possibleFiles = [tempFilePath, tempFilePath + '.m4a', tempFilePath + '.mp3'];
        
        for (const file of possibleFiles) {
            if (fs.existsSync(file) && fs.statSync(file).size > 1024) {
                const stats = fs.statSync(file);
                console.log(`✅ Audio descargado: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                
                return {
                    filePath: file,
                    videoInfo: videoInfo
                };
            }
        }
    } catch (error) {
        console.error("❌ Error al descargar audio:", error.message);
    }

    cleanUpFile(tempFilePath);
    return null;
}

/**
 * Limpieza de archivos temporales
 */
export function cleanUpFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (error) {
            // Ignorar errores de limpieza
        }
    }
}

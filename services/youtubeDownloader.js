import { exec } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import fs from 'fs';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Usar el mismo yt-dlp que sabemos que funciona con TikTok
const ytDlpCommand = '/home/runner/workspace/.pythonlibs/bin/yt-dlp';
const ffmpegCommand = '/home/runner/workspace/node_modules/ffmpeg-static/ffmpeg';

// Opciones anti-bloqueo para YouTube
const YT_DLP_OPTIONS = [
    '--no-playlist',
    '--no-warnings',
    '--force-ipv4',
    '--throttled-rate 100K',
    '--extractor-args youtube:player-client=android,web'
].join(' ');

/**
 * Obtiene la información del video de YouTube
 */
export async function getYouTubeVideoInfo(queryOrUrl) {
    const infoCommand = `"${ytDlpCommand}" --dump-json ${YT_DLP_OPTIONS} "${queryOrUrl}"`;

    try {
        const { stdout } = await execPromise(infoCommand);
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

/**
 * Información por defecto
 */
function getDefaultVideoInfo() {
    return {
        title: 'Contenido de YouTube',
        author: 'Desconocido',
        duration: 0,
        uploadDate: 'N/A',
        thumbnail: null,
        url: null
    };
}

/**
 * Descarga video de YouTube
 */
export async function downloadYoutubeVideo(args) {
    const isSearch = !args[0].startsWith('http');
    const queryOrUrl = isSearch ? `ytsearch1:${args.join(' ')}` : args[0];

    const tempFileName = `youtube-video-${Date.now()}.mp4`; 
    const tempFilePath = join(tmpdir(), tempFileName);

    let videoInfo = getDefaultVideoInfo();

    console.log(`📥 Descargando Video de YouTube: ${isSearch ? 'Búsqueda' : 'URL'}`);

    try {
        videoInfo = await getYouTubeVideoInfo(queryOrUrl);
        console.log(`🔍 Info: ${videoInfo.title}`);
    } catch (error) {
        console.error("Error obteniendo información:", error);
    }

    // Formato optimizado para WhatsApp con opciones anti-bloqueo
    const command = `"${ytDlpCommand}" -f "best[height<=720]" ${YT_DLP_OPTIONS} --output "${tempFilePath}" "${queryOrUrl}"`;

    try {
        await execPromise(command);

        // Verificar que el archivo se creó
        if (!fs.existsSync(tempFilePath)) {
            throw new Error("Archivo no fue creado");
        }

        const stats = fs.statSync(tempFilePath);
        if (stats.size === 0) {
            throw new Error("Archivo está vacío");
        }

        console.log(`✅ Video descargado: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        return {
            filePath: tempFilePath,
            videoInfo: videoInfo
        };
    } catch (error) {
        console.error("❌ Error al descargar:", error.message);
        cleanUpFile(tempFilePath);
        return null;
    }
}

/**
 * Descarga audio de YouTube
 */
export async function downloadYoutubeAudio(args) {
    const isSearch = !args[0].startsWith('http');
    const queryOrUrl = isSearch ? `ytsearch1:${args.join(' ')}` : args[0];

    let videoInfo = getDefaultVideoInfo();

    console.log(`🎵 Descargando Audio de YouTube: ${isSearch ? 'Búsqueda' : 'URL'}`);

    try {
        videoInfo = await getYouTubeVideoInfo(queryOrUrl);
        console.log(`🔍 Info: ${videoInfo.title}`);
    } catch (error) {
        console.error("Error obteniendo información:", error);
    }

    const tempFileName = `youtube-audio-${Date.now()}.m4a`;
    const tempFilePath = join(tmpdir(), tempFileName);

    // COMANDO CORREGIDO - Con opciones anti-bloqueo
    const command = `"${ytDlpCommand}" -f "bestaudio[ext=m4a]" ${YT_DLP_OPTIONS} --ffmpeg-location "${ffmpegCommand}" --output "${tempFilePath}" "${queryOrUrl}"`;

    try {
        await execPromise(command);

        if (!fs.existsSync(tempFilePath)) {
            throw new Error("Archivo de audio no fue creado");
        }

        const stats = fs.statSync(tempFilePath);
        if (stats.size === 0) {
            throw new Error("Archivo de audio está vacío");
        }

        console.log(`✅ Audio descargado: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        return {
            filePath: tempFilePath,
            videoInfo: videoInfo
        };
    } catch (error) {
        console.error("❌ Error al descargar audio:", error.message);

        // Intentar método alternativo sin FFmpeg
        console.log("🔄 Intentando método alternativo sin FFmpeg...");
        return await downloadYoutubeAudioAlternative(args, tempFilePath, videoInfo);
    }
}

/**
 * Método alternativo para descargar audio sin FFmpeg
 */
async function downloadYoutubeAudioAlternative(args, tempFilePath, videoInfo) {
    const isSearch = !args[0].startsWith('http');
    const queryOrUrl = isSearch ? `ytsearch1:${args.join(' ')}` : args[0];

    // Intentar descargar formato de audio nativo sin conversión
    const command = `"${ytDlpCommand}" -f "bestaudio" ${YT_DLP_OPTIONS} --output "${tempFilePath}" "${queryOrUrl}"`;

    try {
        await execPromise(command);

        if (!fs.existsSync(tempFilePath)) {
            throw new Error("Archivo de audio no fue creado");
        }

        const stats = fs.statSync(tempFilePath);
        if (stats.size === 0) {
            throw new Error("Archivo de audio está vacío");
        }

        console.log(`✅ Audio descargado (método alternativo): ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        return {
            filePath: tempFilePath,
            videoInfo: videoInfo
        };
    } catch (error) {
        console.error("❌ Error en método alternativo:", error.message);
        cleanUpFile(tempFilePath);
        return null;
    }
}

/**
 * Limpieza de archivos temporales
 */
export function cleanUpFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Archivo temporal eliminado: ${filePath}`);
        } catch (error) {
            console.error(`❌ Error eliminando archivo: ${error.message}`);
        }
    }
}

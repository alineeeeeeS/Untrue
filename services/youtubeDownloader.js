import { default as play } from 'play-dl';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);

/**
 * Obtiene información del video de YouTube
 * @param {string} query - URL o búsqueda
 * @returns {Promise<object>} Información del video
 */
async function getVideoInfo(query) {
    try {
        let videoInfo = null;

        if (query.includes('youtube.com') || query.includes('youtu.be')) {
            if (!play.is_yt_valid(query)) {
                throw new Error('URL de YouTube inválida');
            }
            videoInfo = await play.getInfo(query);
        } else {
            const results = await play.search(query, { limit: 1 });
            if (!results.length) {
                throw new Error('No se encontraron resultados en YouTube');
            }
            videoInfo = await play.getInfo(results[0].url);
        }

        return {
            url: videoInfo.video_url || videoInfo.url,
            title: videoInfo.title || videoInfo.video_details?.title || 'Video',
            author: videoInfo.author?.name || videoInfo.video_details?.author || 'Desconocido',
            duration: videoInfo.video_details?.duration || videoInfo.length || 0,
            durationFormatted: formatDuration(videoInfo.video_details?.duration || videoInfo.length || 0),
            description: videoInfo.description || '',
            thumbnail: videoInfo.thumbnails?.[0]?.url || ''
        };
    } catch (error) {
        throw new Error(`Error obteniendo información: ${error.message}`);
    }
}

/**
 * Descarga un video de YouTube
 * @param {string|array} query - URL o búsqueda (puede ser array)
 * @returns {Promise<object>} Ruta del archivo descargado
 */
export async function downloadYoutubeVideo(query) {
    let filePath = null;

    try {
        const searchQuery = Array.isArray(query) ? query.join(' ') : query;
        console.log(`📥 Iniciando descarga de video: ${searchQuery}`);

        const videoInfo = await getVideoInfo(searchQuery);
        console.log(`✅ Video encontrado: ${videoInfo.title}`);

        const tmpDir = '/tmp';
        const fileName = `yt-video-${Date.now()}.mp4`;
        filePath = path.join(tmpDir, fileName);

        const stream = await play.stream(videoInfo.url);

        await new Promise((resolve, reject) => {
            const ffmpegCmd = `ffmpeg -i pipe:0 -c:v libx264 -preset veryfast -c:a aac -b:a 128k -y "${filePath}"`;
            const ffmpeg = exec(ffmpegCmd);

            let errorOutput = '';
            ffmpeg.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            stream.stream.pipe(ffmpeg.stdin);

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    console.log(`✅ Video descargado: ${filePath}`);
                    resolve();
                } else {
                    reject(new Error(`ffmpeg error code ${code}: ${errorOutput}`));
                }
            });

            ffmpeg.on('error', reject);
        });

        return {
            filePath,
            fileName,
            videoInfo: {
                title: videoInfo.title,
                author: videoInfo.author,
                duration: videoInfo.duration,
                durationFormatted: videoInfo.durationFormatted
            }
        };

    } catch (error) {
        if (filePath) {
            await cleanUpFile(filePath);
        }
        throw new Error(`No se pudo descargar el video: ${error.message}`);
    }
}

/**
 * Descarga solo el audio de un video de YouTube
 * @param {string|array} query - URL o búsqueda
 * @param {string} format - Formato de audio (mp3, m4a, opus, vorbis)
 * @returns {Promise<object>} Ruta del archivo descargado
 */
export async function downloadYoutubeAudio(query, format = 'mp3') {
    let filePath = null;

    try {
        const searchQuery = Array.isArray(query) ? query.join(' ') : query;
        console.log(`🎵 Iniciando descarga de audio: ${searchQuery}`);

        const videoInfo = await getVideoInfo(searchQuery);
        console.log(`✅ Video encontrado: ${videoInfo.title}`);

        const tmpDir = '/tmp';
        const fileName = `yt-audio-${Date.now()}.${format}`;
        filePath = path.join(tmpDir, fileName);

        const stream = await play.stream(videoInfo.url, {
            quality: 1,
            discardWebm: false
        });

        await new Promise((resolve, reject) => {
            let ffmpegCmd = '';

            if (format === 'mp3') {
                ffmpegCmd = `ffmpeg -i pipe:0 -q:a 0 -map a -y "${filePath}"`;
            } else if (format === 'm4a') {
                ffmpegCmd = `ffmpeg -i pipe:0 -acodec aac -b:a 128k -y "${filePath}"`;
            } else if (format === 'opus') {
                ffmpegCmd = `ffmpeg -i pipe:0 -acodec libopus -b:a 128k -y "${filePath}"`;
            } else {
                ffmpegCmd = `ffmpeg -i pipe:0 -acodec libvorbis -b:a 128k -y "${filePath}"`;
            }

            const ffmpeg = exec(ffmpegCmd);
            let errorOutput = '';

            ffmpeg.stderr.on('data', (data) => {
                errorOutput += data.toString();
                // Log solo errores reales
                if (data.toString().includes('error') || data.toString().includes('Error')) {
                    console.log('FFmpeg:', data.toString());
                }
            });

            stream.stream.pipe(ffmpeg.stdin);

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    console.log(`✅ Audio descargado: ${filePath}`);
                    resolve();
                } else {
                    reject(new Error(`ffmpeg error code ${code}`));
                }
            });

            ffmpeg.on('error', reject);
        });

        return {
            filePath,
            fileName,
            videoInfo: {
                title: videoInfo.title,
                author: videoInfo.author,
                duration: videoInfo.duration,
                durationFormatted: videoInfo.durationFormatted
            }
        };

    } catch (error) {
        if (filePath) {
            await cleanUpFile(filePath);
        }
        throw new Error(`No se pudo descargar el audio: ${error.message}`);
    }
}

/**
 * Limpia archivo temporal
 * @param {string} filePath - Ruta del archivo
 */
export async function cleanUpFile(filePath) {
    if (!filePath) return;

    try {
        await fs.unlink(filePath);
        console.log(`🗑️ Archivo eliminado: ${filePath}`);
    } catch (error) {
        console.warn(`⚠️ No se pudo eliminar ${filePath}: ${error.message}`);
    }
}

/**
 * Formatea duración en segundos a formato legible
 * @param {number} seconds - Segundos
 * @returns {string} Duración formateada
 */
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return 'N/A';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Obtiene información de un video sin descargar
 * @param {string} query - URL o búsqueda
 * @returns {Promise<object>} Información del video
 */
export async function getYoutubeInfo(query) {
    try {
        return await getVideoInfo(query);
    } catch (error) {
        throw new Error(`Error obteniendo información: ${error.message}`);
    }
}

export default {
    downloadYoutubeVideo,
    downloadYoutubeAudio,
    cleanUpFile,
    getYoutubeInfo
};

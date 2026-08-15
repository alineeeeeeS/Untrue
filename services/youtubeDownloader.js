import { default as play } from 'play-dl';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);

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

async function getVideoInfo(query) {
    try {
        let videoInfo = null;

        if (query.includes('youtube.com') || query.includes('youtu.be')) {
            if (!play.is_yt_valid(query)) {
                throw new Error('URL de YouTube inválida');
            }
            videoInfo = await play.video_info(query);
        } else {
            const results = await play.search(query, { limit: 1 });
            if (!results.length) {
                throw new Error('No se encontraron resultados en YouTube');
            }
            videoInfo = await play.video_info(results[0].url);
        }

        const details = videoInfo.video_details || videoInfo;

        return {
            url: details.url || query,
            title: details.title || 'Video',
            author: details.channel?.name || details.author || 'Desconocido',
            duration: details.durationInSec || 0,
            durationFormatted: formatDuration(details.durationInSec || 0),
            description: details.description || '',
            thumbnail: details.thumbnails?.[0]?.url || ''
        };
    } catch (error) {
        throw new Error(`Error obteniendo información: ${error.message}`);
    }
}

export async function getYouTubeVideoInfo(queryOrUrl) {
    const query = Array.isArray(queryOrUrl) ? queryOrUrl.join(' ') : queryOrUrl;
    return getVideoInfo(query);
}

export async function downloadYoutubeVideo(query) {
    let filePath = null;

    try {
        const searchQuery = Array.isArray(query) ? query.join(' ') : query;
        console.log(`Descargando video: ${searchQuery}`);

        const videoInfo = await getVideoInfo(searchQuery);
        console.log(`Video: ${videoInfo.title}`);

        if (videoInfo.duration > 480) {
            throw new Error('El video es demasiado largo (máximo 8 minutos)');
        }

        const fileName = `yt-video-${Date.now()}.mp4`;
        filePath = path.join('/tmp', fileName);

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
                if (code === 0) resolve();
                else reject(new Error(`ffmpeg error code ${code}: ${errorOutput.slice(-300)}`));
            });

            ffmpeg.on('error', reject);
        });

        return {
            filePath,
            fileName,
            videoInfo
        };
    } catch (error) {
        if (filePath) await cleanUpFile(filePath);
        throw new Error(`No se pudo descargar el video: ${error.message}`);
    }
}

export async function downloadYoutubeAudio(query, format = 'mp3') {
    let filePath = null;

    try {
        const searchQuery = Array.isArray(query) ? query.join(' ') : query;
        console.log(`Descargando audio: ${searchQuery}`);

        const videoInfo = await getVideoInfo(searchQuery);
        console.log(`Audio: ${videoInfo.title}`);

        if (videoInfo.duration > 900) {
            throw new Error('El audio es demasiado largo (máximo 15 minutos)');
        }

        const fileName = `yt-audio-${Date.now()}.${format}`;
        filePath = path.join('/tmp', fileName);

        const stream = await play.stream(videoInfo.url, {
            quality: 1,
            discardWebm: false
        });

        await new Promise((resolve, reject) => {
            let ffmpegCmd;

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
            });

            stream.stream.pipe(ffmpeg.stdin);

            ffmpeg.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`ffmpeg error code ${code}: ${errorOutput.slice(-300)}`));
            });

            ffmpeg.on('error', reject);
        });

        return {
            filePath,
            fileName,
            videoInfo
        };
    } catch (error) {
        if (filePath) await cleanUpFile(filePath);
        throw new Error(`No se pudo descargar el audio: ${error.message}`);
    }
}

export async function cleanUpFile(filePath) {
    if (!filePath) return;
    try {
        await fs.unlink(filePath);
    } catch {}
}

export async function getYoutubeInfo(query) {
    return getVideoInfo(query);
}

export default {
    downloadYoutubeVideo,
    downloadYoutubeAudio,
    cleanUpFile,
    getYoutubeInfo,
    getYouTubeVideoInfo
};

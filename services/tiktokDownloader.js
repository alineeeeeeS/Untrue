import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs, { unlinkSync, rmSync, createWriteStream, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'util';
import axios from 'axios';
import Tiktok from '@tobyg74/tiktok-api-dl';

const execPromise = promisify(exec);
const ffmpegCommand = process.env.FFMPEG_PATH || 'ffmpeg';

function getDefaultVideoInfo() {
    return {
        title: 'Sin título',
        author: 'Autor desconocido',
        uploadDate: 'Desconocida',
        description: 'Sin descripción',
        isCarousel: false
    };
}

export function cleanUpFile(filePath) {
    try {
        if (!filePath) return;
        if (filePath.includes('tiktok-carousel')) {
            rmSync(filePath, { recursive: true, force: true });
        } else if (existsSync(filePath)) {
            unlinkSync(filePath);
        }
    } catch (e) {
        console.warn(`Error limpiando ${filePath}: ${e.message}`);
    }
}

async function fetchTiktok(url) {
    const versions = ['v3', 'v2', 'v1'];
    let lastError;

    for (const version of versions) {
        try {
            const result = await Tiktok.Downloader(url, { version });
            if (result?.status && result?.result) {
                return result;
            }
            lastError = new Error(result?.message || `Sin resultados (${version})`);
        } catch (e) {
            lastError = e;
        }
    }

    throw lastError || new Error('No se pudo obtener el contenido de TikTok');
}

function buildInfo(result) {
    const r = result.result || {};
    const images = r.images || r.image || [];
    const hasImages = Array.isArray(images) && images.length > 0;

    return {
        title: r.title || r.desc || 'TikTok',
        author: r.author?.nickname || r.author?.unique_id || r.author || 'Desconocido',
        uploadDate: 'Desconocida',
        description: r.title || r.desc || '',
        isCarousel: hasImages && !r.video && !r.play
    };
}

async function downloadUrlToFile(fileUrl, destPath) {
    const res = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: 'https://www.tiktok.com/'
        }
    });
    writeFileSync(destPath, Buffer.from(res.data));
    return destPath;
}

function pickVideoUrl(result) {
    const r = result.result || {};
    return (
        r.video?.downloadAddr ||
        r.video?.playAddr ||
        r.play ||
        r.video ||
        r.download?.url ||
        (Array.isArray(r.video) ? r.video[0] : null)
    );
}

export async function getTiktokVideoInfo(url) {
    try {
        const result = await fetchTiktok(url);
        return buildInfo(result);
    } catch (error) {
        console.error('Error info TikTok:', error.message);
        return getDefaultVideoInfo();
    }
}

export async function downloadTiktokVideo(url) {
    const tempFilePath = join(tmpdir(), `tiktok-video-${Date.now()}.mp4`);

    try {
        const result = await fetchTiktok(url);
        const videoInfo = buildInfo(result);
        const videoUrl = pickVideoUrl(result);

        if (!videoUrl || typeof videoUrl !== 'string') {
            throw new Error('No se encontró URL de video');
        }

        await downloadUrlToFile(videoUrl, tempFilePath);

        if (!existsSync(tempFilePath) || fs.statSync(tempFilePath).size < 1000) {
            throw new Error('Video descargado inválido o vacío');
        }

        return { filePath: tempFilePath, videoInfo };
    } catch (error) {
        console.error('Error video TikTok:', error.message);
        cleanUpFile(tempFilePath);
        return null;
    }
}

export async function downloadTiktokAudio(url) {
    const tempVideoPath = join(tmpdir(), `tiktok-va-${Date.now()}.mp4`);
    const tempAudioPath = join(tmpdir(), `tiktok-audio-${Date.now()}.mp3`);

    try {
        const result = await fetchTiktok(url);
        const videoInfo = buildInfo(result);
        const r = result.result || {};

        const musicUrl = r.music?.playUrl || r.music || r.music_url || r.sound;
        if (musicUrl && typeof musicUrl === 'string') {
            const audioPath = join(tmpdir(), `tiktok-audio-${Date.now()}.mp3`);
            await downloadUrlToFile(musicUrl, audioPath);
            return {
                filePath: audioPath,
                videoInfo,
                mimetype: 'audio/mpeg'
            };
        }

        const videoUrl = pickVideoUrl(result);
        if (!videoUrl) throw new Error('No hay audio ni video para extraer');

        await downloadUrlToFile(videoUrl, tempVideoPath);
        await execPromise(
            `"${ffmpegCommand}" -i "${tempVideoPath}" -vn -acodec libmp3lame -ab 128k -ar 44100 -y "${tempAudioPath}"`
        );
        cleanUpFile(tempVideoPath);

        return {
            filePath: tempAudioPath,
            videoInfo,
            mimetype: 'audio/mpeg'
        };
    } catch (error) {
        console.error('Error audio TikTok:', error.message);
        cleanUpFile(tempVideoPath);
        cleanUpFile(tempAudioPath);
        return null;
    }
}

export async function downloadTiktokImages(url) {
    const tempDir = join(tmpdir(), `tiktok-carousel-${Date.now()}`);

    try {
        mkdirSync(tempDir, { recursive: true });

        const result = await fetchTiktok(url);
        const videoInfo = buildInfo(result);
        const r = result.result || {};
        const imageUrls = r.images || r.image || [];

        if (!Array.isArray(imageUrls) || !imageUrls.length) {
            throw new Error('No hay imágenes en este post');
        }

        videoInfo.isCarousel = true;

        for (let i = 0; i < imageUrls.length; i++) {
            const imageUrl = typeof imageUrls[i] === 'string' ? imageUrls[i] : imageUrls[i]?.url;
            if (!imageUrl) continue;

            const filePath = join(tempDir, `${i + 1}.jpeg`);
            const res = await axios.get(imageUrl, {
                responseType: 'stream',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    Referer: 'https://www.tiktok.com/'
                }
            });

            await new Promise((resolve, reject) => {
                const writer = createWriteStream(filePath);
                res.data.pipe(writer);
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
        }

        return { filePaths: tempDir, videoInfo };
    } catch (error) {
        console.error('Error carrusel TikTok:', error.message);
        cleanUpFile(tempDir);
        return null;
    }
}

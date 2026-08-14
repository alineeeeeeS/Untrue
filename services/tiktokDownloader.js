import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs, { unlinkSync, rmSync, createWriteStream } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'util';
import axios from 'axios';
import Tiktok from '@tobyg74/tiktok-api-dl';

const execPromise = promisify(exec);

const ytDlpCommand = '/home/runner/workspace/.pythonlibs/bin/yt-dlp';
const ffmpegCommand = '/home/runner/workspace/node_modules/ffmpeg-static/ffmpeg';

console.log('Servicios configurados correctamente');

function getDefaultVideoInfo() {
    return {
        title: 'Sin título',
        author: 'Autor desconocido',
        uploadDate: 'Desconocida',
        description: 'Sin descripción',
        isCarousel: false
    };
}

function formatDate(dateStr) {
    if (!dateStr) return 'Desconocida';
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${day}/${month}/${year}`;
}

export function cleanUpFile(filePath) {
    try {
        if (!filePath) return;

        if (filePath.includes('tiktok-carousel')) {
            rmSync(filePath, { recursive: true, force: true });
            console.log(`Directorio temporal eliminado: ${filePath}`);
        } else {
            unlinkSync(filePath);
            console.log(`Archivo temporal eliminado: ${filePath}`);
        }
    } catch (e) {
        console.warn(`Error limpiando ${filePath}: ${e.message}`);
    }
}

export async function getTiktokVideoInfo(url) {
    let info = getDefaultVideoInfo();

    try {
        const command = `"${ytDlpCommand}" --dump-json --skip-download --no-check-certificates "${url}"`;
        const { stdout } = await execPromise(command);

        const jsonOutput = JSON.parse(stdout);

        info = {
            title: jsonOutput.title || 'Sin título',
            author: jsonOutput.uploader || jsonOutput.creator || 'Autor desconocido',
            uploadDate: jsonOutput.upload_date ? formatDate(jsonOutput.upload_date) : 'Desconocida',
            description: jsonOutput.description || 'Sin descripción',
            isCarousel: false
        };

        if (jsonOutput.formats?.some(f => f.ext === 'jpg' || f.ext === 'jpeg') ||
            (Array.isArray(jsonOutput.entries) && jsonOutput.entries.length > 0)) {
            info.isCarousel = true;
        }
    } catch (error) {
        console.error("Error al obtener información:", error.message.split('\n')[0]);
    }
    return info;
}

export async function downloadTiktokVideo(url) {
    let videoInfo = getDefaultVideoInfo();

    try {
        videoInfo = await getTiktokVideoInfo(url);
    } catch (error) {}

    const tempFilePath = join(tmpdir(), `tiktok-video-${Date.now()}.mp4`);

    console.log(`Descargando VIDEO: ${url}`);

    try {
        const command = `"${ytDlpCommand}" --no-warnings --no-simulate --no-check-certificates -f "best[ext=mp4]" --output "${tempFilePath}" "${url}"`;
        await execPromise(command);

        console.log(`Video descargado: ${tempFilePath}`);
        return {
            filePath: tempFilePath,
            videoInfo: videoInfo
        };
    } catch (error) {
        console.error("Error al descargar el video:", error.message);
        return null;
    }
}

export async function downloadTiktokAudio(url) {
    let videoInfo = getDefaultVideoInfo();

    try {
        videoInfo = await getTiktokVideoInfo(url);
    } catch (error) {}

    console.log(`Extrayendo AUDIO de: ${url}`);

    const tempVideoPath = join(tmpdir(), `tiktok-video-audio-${Date.now()}.mp4`);
    const tempAudioPath = join(tmpdir(), `tiktok-audio-${Date.now()}.mp3`);

    try {
        console.log('Descargando video para audio...');
        const downloadCommand = `"${ytDlpCommand}" --no-warnings --no-simulate --no-check-certificates -f "best[ext=mp4]" --output "${tempVideoPath}" "${url}"`;
        await execPromise(downloadCommand);
        console.log(`Video descargado para extracción: ${tempVideoPath}`);

        console.log('Procesando extracción de audio...');
        const extractCommand = `"${ffmpegCommand}" -i "${tempVideoPath}" -vn -acodec libmp3lame -ab 128k -ar 44100 -y "${tempAudioPath}"`;
        await execPromise(extractCommand);
        console.log(`Audio extraído con éxito: ${tempAudioPath}`);

        cleanUpFile(tempVideoPath);

        return {
            filePath: tempAudioPath,
            videoInfo: videoInfo,
            mimetype: 'audio/mpeg'
        };
    } catch (error) {
        console.error("Error al extraer audio:", error.message);
        cleanUpFile(tempVideoPath);
        cleanUpFile(tempAudioPath);
        return null;
    }
}

export async function downloadTiktokImages(url) {
    const tempDir = join(tmpdir(), `tiktok-carousel-${Date.now()}`);
    let videoInfo = getDefaultVideoInfo();

    try {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }
    } catch (e) {
        console.error("Error creando directorio temporal:", e);
        return null;
    }

    console.log(`Iniciando descarga de carrusel: ${url}`);

    let result;
    try {
        result = await Tiktok.Downloader(url, { version: "v3" });

        if (!result.status || result.result.length === 0) {
            throw new Error(`Error en la librería: ${result.message || 'Sin resultados.'}`);
        }

        const imageUrls = result.result.images;

        if (!imageUrls || imageUrls.length === 0) {
             throw new Error('La respuesta no contiene enlaces de imágenes.');
        }

        videoInfo.title = result.result.title || 'Carrusel de TikTok';
        videoInfo.author = result.result.author?.nickname || 'Desconocido';
        videoInfo.isCarousel = true;

        console.log(`Descargando ${imageUrls.length} imágenes...`);

        for (let i = 0; i < imageUrls.length; i++) {
            const imageUrl = imageUrls[i];
            const ext = imageUrl.split('.').pop().split('?')[0].toLowerCase() === 'jpeg' ? 'jpeg' : 'jpeg';
            const filePath = join(tempDir, `${i + 1}.${ext}`);

            const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });

            await new Promise((resolve, reject) => {
                const writer = createWriteStream(filePath);
                imageResponse.data.pipe(writer);
                writer.on('finish', resolve);
                writer.on('error', (err) => {
                    console.error(`Error escribiendo imagen ${i+1}:`, err);
                    reject(err);
                });
            });
        }

        console.log(`Imágenes descargadas en: ${tempDir}`);

        return {
            filePaths: tempDir,
            videoInfo: videoInfo
        };
    } catch (error) {
        console.error("Error al descargar carrusel:", error.message);
        cleanUpFile(tempDir);
        return null;
    }
}

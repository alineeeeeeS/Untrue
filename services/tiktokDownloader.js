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

console.log('✅ Servicios configurados correctamente');

// ----------------------------------------------------------------------
// --- FUNCIONES AUXILIARES ---
// ----------------------------------------------------------------------

function getDefaultVideoInfo() {
    return {
        title: 'Sin título',
        author: 'Autor desconocido', 
        uploadDate: 'Desconocida',
        description: 'Sin descripción',
        isCarousel: false // Bandera crucial
    };
}

function formatDate(dateStr) {
    if (!dateStr) return 'Desconocida';
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${day}/${month}/${year}`;
}

/**
 * Limpieza de archivos o directorios temporales
 */
export function cleanUpFile(filePath) {
    try {
        if (!filePath) return;

        // Si es un directorio (como los carruseles), usar rmSync recursivo
        if (filePath.includes('tiktok-carousel')) { 
            rmSync(filePath, { recursive: true, force: true });
            console.log(`🗑️ Directorio temporal eliminado: ${filePath}`);
        } else {
            // Es un archivo, usar unlinkSync
            unlinkSync(filePath);
            console.log(`🧹 Archivo temporal eliminado: ${filePath}`);
        }
    } catch (e) {
        console.warn(`⚠️ Error limpiando ${filePath}: ${e.message}`);
    }
}

// ----------------------------------------------------------------------
// --- FUNCIONES DE INFORMACIÓN Y DESCARGA (yt-dlp para info y videos) ---
// ----------------------------------------------------------------------

/**
 * Función para obtener información del video (detecta carrusel)
 */
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

        // Comprobación de carrusel: Si tiene formatos de imagen o entradas (entries).
        // Simplificamos la detección solo a lo que yt-dlp puede inferir.
        if (jsonOutput.formats?.some(f => f.ext === 'jpg' || f.ext === 'jpeg') || 
            (Array.isArray(jsonOutput.entries) && jsonOutput.entries.length > 0)) 
        {
            info.isCarousel = true;
        }

    } catch (error) {
        console.error("Error al obtener información (tolerado):", error.message.split('\n')[0]);
        // No marcamos isCarousel=true aquí, dejamos que el fallback en tiktok.js decida
    }
    return info;
}


/**
 * Descarga un video de TikTok
 */
export async function downloadTiktokVideo(url) {
    let videoInfo = getDefaultVideoInfo();
    // ... (Tu lógica existente para descargar videos con yt-dlp) ...
    try {
        videoInfo = await getTiktokVideoInfo(url);
    } catch (error) {
        // Ignoramos el error, se usa info por defecto
    }

    const tempFilePath = join(tmpdir(), `tiktok-video-${Date.now()}.mp4`);

    console.log(`📥 Descargando VIDEO: ${url}`);

    try {
        const command = `"${ytDlpCommand}" --no-warnings --no-simulate --no-check-certificates -f "best[ext=mp4]" --output "${tempFilePath}" "${url}"`;
        await execPromise(command);

        console.log(`✅ Video descargado: ${tempFilePath}`);
        return {
            filePath: tempFilePath,
            videoInfo: videoInfo
        };

    } catch (error) {
        console.error("❌ Error al descargar el video:", error.message);
        return null;
    }
}

/**
 * Descarga y extrae solo el audio de TikTok
 */
export async function downloadTiktokAudio(url) {
    let videoInfo = getDefaultVideoInfo();
    // ... (Tu lógica existente para descargar audio con yt-dlp/ffmpeg) ...
    try {
        videoInfo = await getTiktokVideoInfo(url);
    } catch (error) {
        // Ignoramos el error, se usa info por defecto
    }

    console.log(`🎵 EXTRAYENDO AUDIO de: ${url}`);

    const tempVideoPath = join(tmpdir(), `tiktok-video-audio-${Date.now()}.mp4`);
    const tempAudioPath = join(tmpdir(), `tiktok-audio-${Date.now()}.mp3`);

    try {
        // 1. Descargar el video
        console.log('📥 Descargando video...');
        const downloadCommand = `"${ytDlpCommand}" --no-warnings --no-simulate --no-check-certificates -f "best[ext=mp4]" --output "${tempVideoPath}" "${url}"`;
        await execPromise(downloadCommand);
        console.log(`✅ Video descargado: ${tempVideoPath}`);

        // 2. Extraer solo el audio con FFmpeg
        console.log('🎧 Extrayendo audio...');
        const extractCommand = `"${ffmpegCommand}" -i "${tempVideoPath}" -vn -acodec libmp3lame -ab 128k -ar 44100 -y "${tempAudioPath}"`;
        await execPromise(extractCommand);
        console.log(`✅ Audio extraído: ${tempAudioPath}`);

        // 3. Limpiar archivo de video temporal
        cleanUpFile(tempVideoPath);

        return {
            filePath: tempAudioPath,
            videoInfo: videoInfo,
            mimetype: 'audio/mpeg'
        };

    } catch (error) {
        console.error("❌ Error al extraer audio:", error.message);

        cleanUpFile(tempVideoPath);
        cleanUpFile(tempAudioPath);

        return null;
    }
}


/**
 * Descarga imágenes de un carrusel de TikTok (Photo Post) usando la librería @tobyg74/tiktok-api-dl.
 * Esta es la solución robusta que reemplaza a yt-dlp para carruseles.
 */
export async function downloadTiktokImages(url) {
    const tempDir = join(tmpdir(), `tiktok-carousel-${Date.now()}`);
    let videoInfo = getDefaultVideoInfo();

    try {
        // 1. Crear directorio temporal
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }
    } catch (e) {
        console.error("Error creando directorio temporal:", e);
        return null;
    }

    // 2. Llamar a la librería para obtener las URLs
    console.log(`📡 Llamando a la librería @tobyg74/tiktok-api-dl para carrusel: ${url}`);
    let result;
    try {
        // Usamos la versión 3 si es posible para tener mejor soporte a carrusel/slides
        result = await Tiktok.Downloader(url, { version: "v3" });

        if (!result.status || result.result.length === 0) {
            throw new Error(`Librería falló: ${result.message || 'No se encontraron resultados.'}`);
        }

        // La librería retorna un array de imágenes en result.result.images
        const imageUrls = result.result.images;

        if (!imageUrls || imageUrls.length === 0) {
             throw new Error('Librería falló: La respuesta no contiene enlaces de imágenes (images array).');
        }

        // Actualizamos la info
        videoInfo.title = result.result.title || 'Carrusel de TikTok';
        videoInfo.author = result.result.author?.nickname || 'Desconocido';
        videoInfo.isCarousel = true;

        // 3. Descargar cada imagen
        console.log(`📥 Descargando ${imageUrls.length} imágenes del carrusel...`);

        for (let i = 0; i < imageUrls.length; i++) {
            const imageUrl = imageUrls[i];
            // Intentamos extraer la extensión, si no, usamos .jpeg
            const ext = imageUrl.split('.').pop().split('?')[0].toLowerCase() === 'jpeg' ? 'jpeg' : 'jpeg'; 
            const filePath = join(tempDir, `${i + 1}.${ext}`);

            const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });

            // Usamos una promesa para esperar a que el stream termine de escribir
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

        console.log(`✅ Imágenes descargadas en: ${tempDir}`);

        return {
            filePaths: tempDir, // Devuelve la ruta del directorio
            videoInfo: videoInfo
        };

    } catch (error) {
        console.error("❌ Error al descargar las imágenes (final):", error.message);
        cleanUpFile(tempDir);
        return null;
    }
}
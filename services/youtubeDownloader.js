import { exec } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import fs from 'fs';
import { promisify } from 'util';

const execPromise = promisify(exec);

const ytDlpCommand = '/home/runner/workspace/.pythonlibs/bin/yt-dlp';

/**
 * Obtiene información del video - VERSIÓN SIMPLE
 */
export async function getYouTubeVideoInfo(queryOrUrl) {
    try {
        const command = `"${ytDlpCommand}" --dump-json --no-playlist "${queryOrUrl}"`;
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
        console.error("Error al obtener info del video:", error.message);
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
 * Descarga audio de YouTube - ESTRATEGIA COMPROBADA
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

    // ESTRATEGIA COMPROBADA (Número 4)
    const primaryCommand = `"${ytDlpCommand}" -f "bestaudio" --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`;

    try {
        console.log(`🎵 Usando estrategia comprobada...`);
        await execPromise(primaryCommand);

        // Verificar archivos posibles
        const possibleFiles = [
            tempFilePath,
            tempFilePath + '.m4a', 
            tempFilePath + '.mp3',
            tempFilePath + '.webm',
            tempFilePath + '.opus'
        ];
        
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
        
        throw new Error('No se generó archivo de audio válido');
        
    } catch (error) {
        console.error(`❌ Error al descargar audio:`, error.message);
        throw new Error(`No se pudo descargar el audio: ${error.message}`);
    }
}

/**
 * Descarga video de YouTube - MANTENER ESTRATEGIAS POR SI ACASO
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

    // Para video, mantener múltiples estrategias por si acaso
    const videoStrategies = [
        `"${ytDlpCommand}" -f "best[height<=480]" --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`,
        `"${ytDlpCommand}" -f "best[height<=720]" --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`,
        `"${ytDlpCommand}" -f "best" --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`
    ];

    for (let i = 0; i < videoStrategies.length; i++) {
        try {
            console.log(`📥 Intentando estrategia de video ${i + 1}...`);
            await execPromise(videoStrategies[i]);

            if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
                const stats = fs.statSync(tempFilePath);
                console.log(`✅ Video descargado: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                return {
                    filePath: tempFilePath,
                    videoInfo: videoInfo
                };
            }
        } catch (error) {
            console.error(`❌ Estrategia de video ${i + 1} falló:`, error.message);
            if (i === videoStrategies.length - 1) {
                throw new Error(`No se pudo descargar el video: ${error.message}`);
            }
        }
    }

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

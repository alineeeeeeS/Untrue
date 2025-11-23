import { exec } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import fs from 'fs';
import { promisify } from 'util';

const execPromise = promisify(exec);

const ytDlpCommand = '/home/runner/workspace/.pythonlibs/bin/yt-dlp';

/**
 * Obtiene información del video - ESTRATEGIA OPTIMIZADA
 */
export async function getYouTubeVideoInfo(queryOrUrl) {
    // Priorizar la estrategia que funciona para video
    const strategies = [
        `"${ytDlpCommand}" --dump-json --no-playlist --extractor-args "youtube:player_client=android" "${queryOrUrl}"`,
        `"${ytDlpCommand}" --dump-json --no-playlist "${queryOrUrl}"`
    ];

    for (let i = 0; i < strategies.length; i++) {
        try {
            console.log(`🔍 Obteniendo info (estrategia ${i + 1})...`);
            const { stdout } = await execPromise(strategies[i]);
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
            console.error(`❌ Estrategia ${i + 1} falló:`, error.message);
            if (i === strategies.length - 1) {
                return getDefaultVideoInfo();
            }
        }
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
 * Descarga audio de YouTube - OPTIMIZADO (Estrategia 4)
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

    // ESTRATEGIA OPTIMIZADA: Usar directamente la que funciona (Estrategia 4)
    const primaryCommand = `"${ytDlpCommand}" -f "bestaudio" --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`;
    
    // Backup por si falla
    const backupCommand = `"${ytDlpCommand}" -f "bestaudio[ext=m4a]" --no-playlist --extractor-args "youtube:player_client=android" --output "${tempFilePath}" "${queryOrUrl}"`;

    try {
        console.log(`🎵 Usando estrategia optimizada para audio...`);
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
        console.error(`❌ Estrategia principal de audio falló, intentando backup...:`, error.message);
        
        try {
            await execPromise(backupCommand);
            
            for (const file of possibleFiles) {
                if (fs.existsSync(file) && fs.statSync(file).size > 1024) {
                    const stats = fs.statSync(file);
                    console.log(`✅ Audio descargado (backup): ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                    
                    return {
                        filePath: file,
                        videoInfo: videoInfo
                    };
                }
            }
        } catch (backupError) {
            console.error(`❌ Todas las estrategias de audio fallaron:`, backupError.message);
            throw new Error(`No se pudo descargar el audio: ${backupError.message}`);
        }
    }

    cleanUpFile(tempFilePath);
    return null;
}

/**
 * Descarga video de YouTube - OPTIMIZADO (Estrategia 1)
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

    // ESTRATEGIA OPTIMIZADA: Usar directamente la que funciona (Estrategia 1)
    const primaryCommand = `"${ytDlpCommand}" -f "best[height<=480]" --no-playlist --extractor-args "youtube:player_client=android" --output "${tempFilePath}" "${queryOrUrl}"`;
    
    // Backup
    const backupCommand = `"${ytDlpCommand}" -f "best[height<=720]" --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`;

    try {
        console.log(`📥 Usando estrategia optimizada para video...`);
        await execPromise(primaryCommand);

        if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
            const stats = fs.statSync(tempFilePath);
            console.log(`✅ Video descargado: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

            return {
                filePath: tempFilePath,
                videoInfo: videoInfo
            };
        }
        
        throw new Error('No se generó archivo de video válido');
        
    } catch (error) {
        console.error(`❌ Estrategia principal de video falló, intentando backup...:`, error.message);
        
        try {
            await execPromise(backupCommand);

            if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
                const stats = fs.statSync(tempFilePath);
                console.log(`✅ Video descargado (backup): ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

                return {
                    filePath: tempFilePath,
                    videoInfo: videoInfo
                };
            }
        } catch (backupError) {
            console.error(`❌ Todas las estrategias de video fallaron:`, backupError.message);
            throw new Error(`No se pudo descargar el video: ${backupError.message}`);
        }
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
            console.log(`🧹 Archivo temporal eliminado: ${filePath}`);
        } catch (error) {
            console.error("Error eliminando archivo temporal:", error.message);
        }
    }
}

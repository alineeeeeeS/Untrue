import { exec } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import fs from 'fs';
import { promisify } from 'util';

const execPromise = promisify(exec);

const ytDlpCommand = '/home/runner/workspace/.pythonlibs/bin/yt-dlp';
const ffmpegCommand = '/home/runner/workspace/node_modules/ffmpeg-static/ffmpeg';

// ESTRATEGIA ANTI-BLOQUEO MEJORADA
const YT_DLP_OPTIONS = [
    '--no-playlist',
    '--no-warnings',
    '--force-ipv4',
    '--throttled-rate 100K',
    '--sleep-requests 1',
    '--sleep-interval 3',
    '--max-sleep-interval 10',
    '--extractor-args "youtube:player-client=android,web;player_skip=configs"',
    '--user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
    '--add-header "Accept:*/*"',
    '--add-header "Accept-Language:en-US,en;q=0.9"',
    '--add-header "Accept-Encoding:gzip, deflate, br"',
    '--add-header "DNT:1"',
    '--add-header "Connection:keep-alive"',
    '--add-header "Sec-Fetch-Dest:empty"',
    '--add-header "Sec-Fetch-Mode:cors"',
    '--add-header "Sec-Fetch-Site:same-origin"',
    '--add-header "Sec-GPC:1"',
    '--ignore-errors',
    '--no-check-certificates',
    '--prefer-insecure'
].join(' ');

// MAPA DE CALIDADES - ORDENADAS DE MEJOR A PEOR
const QUALITY_MAP = {
    // VIDEO
    'best': 'best[height<=1080]',        // Mejor calidad hasta 1080p
    '1080p': 'best[height<=1080]',       // 1080p
    '720p': 'best[height<=720]',         // 720p  
    '480p': 'best[height<=480]',         // 480p (CALIDAD MEDIA POR DEFECTO)
    '360p': 'best[height<=360]',         // 360p
    '240p': 'best[height<=240]',         // 240p
    'worst': 'worst',                    // Peor calidad
    
    // AUDIO - ORDENADAS DE MEJOR A PEOR CALIDAD
    'audio_best': 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio',
    'audio_high': 'bestaudio[ext=m4a]/bestaudio[ext=mp3]',
    'audio_medium': 'bestaudio[ext=mp3]/bestaudio[ext=m4a]',
    'audio_low': 'bestaudio'
};

/**
 * Obtiene información del video
 */
export async function getYouTubeVideoInfo(queryOrUrl) {
    const command = `"${ytDlpCommand}" --dump-json ${YT_DLP_OPTIONS} "${queryOrUrl}"`;

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
        title: 'Contenido de YouTube',
        author: 'Desconocido',
        duration: 0,
        uploadDate: 'N/A',
        thumbnail: null,
        url: null
    };
}

/**
 * Parsea los argumentos para extraer calidad y URL/búsqueda
 */
function parseVideoArgs(args) {
    const qualities = Object.keys(QUALITY_MAP);
    let quality = '480p'; // CALIDAD MEDIA POR DEFECTO
    let queryParts = [...args];
    let userSpecifiedQuality = false;

    // Buscar especificador de calidad en los argumentos
    for (let i = 0; i < queryParts.length; i++) {
        const part = queryParts[i].toLowerCase();
        if (qualities.includes(part) && part !== 'audio_best' && part !== 'audio_high' && part !== 'audio_medium' && part !== 'audio_low') {
            quality = part;
            userSpecifiedQuality = true;
            queryParts.splice(i, 1); // Remover la calidad de los argumentos
            break;
        }
    }

    const queryOrUrl = queryParts.join(' ');
    const isSearch = !queryParts[0]?.startsWith('http');

    return {
        quality,
        queryOrUrl: isSearch ? `ytsearch1:${queryOrUrl}` : queryOrUrl,
        isSearch,
        originalQuery: queryParts.join(' '),
        userSpecifiedQuality
    };
}

/**
 * Descarga video de YouTube - CALIDAD MEDIA POR DEFECTO
 */
export async function downloadYoutubeVideo(args) {
    const { quality, queryOrUrl, isSearch, originalQuery, userSpecifiedQuality } = parseVideoArgs(args);
    
    const tempFileName = `youtube-video-${Date.now()}.mp4`;
    const tempFilePath = join(tmpdir(), tempFileName);

    let videoInfo = getDefaultVideoInfo();

    console.log(`📥 Descargando Video de YouTube: ${isSearch ? 'Búsqueda' : 'URL'}`);
    console.log(`🎯 Calidad: ${quality} ${userSpecifiedQuality ? '(especificada por usuario)' : '(por defecto)'}`);

    try {
        videoInfo = await getYouTubeVideoInfo(queryOrUrl);
        console.log(`🔍 Info: ${videoInfo.title}`);
    } catch (error) {
        console.error("Error obteniendo información:", error);
    }

    const format = QUALITY_MAP[quality] || QUALITY_MAP['480p'];
    const command = `"${ytDlpCommand}" -f "${format}" ${YT_DLP_OPTIONS} --output "${tempFilePath}" "${queryOrUrl}"`;

    try {
        await execPromise(command);

        if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
            const stats = fs.statSync(tempFilePath);
            console.log(`✅ Video descargado (${quality}): ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

            return {
                filePath: tempFilePath,
                videoInfo: videoInfo,
                quality: quality,
                userSpecifiedQuality: userSpecifiedQuality
            };
        } else {
            throw new Error('Archivo vacío o no creado');
        }
    } catch (error) {
        console.error(`❌ Error al descargar video (${quality}):`, error.message);
        cleanUpFile(tempFilePath);
        return null;
    }
}

/**
 * Descarga audio de YouTube - MEJOR CALIDAD POSIBLE CON FALLBACKS INTELIGENTES
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

    const tempFileName = `youtube-audio-${Date.now()}`;
    const tempFilePath = join(tmpdir(), tempFileName);

    // ESTRATEGIAS DE AUDIO ORDENADAS DE MEJOR A BUENA CALIDAD
    const audioStrategies = [
        {
            name: 'Mejor calidad (m4a)',
            command: `"${ytDlpCommand}" -f "bestaudio[ext=m4a]" ${YT_DLP_OPTIONS} --output "${tempFilePath}.m4a" "${queryOrUrl}"`,
            fileExt: '.m4a'
        },
        {
            name: 'Alta calidad (mp3)',
            command: `"${ytDlpCommand}" -f "bestaudio[ext=mp3]" ${YT_DLP_OPTIONS} --ffmpeg-location "${ffmpegCommand}" --output "${tempFilePath}.mp3" "${queryOrUrl}"`,
            fileExt: '.mp3'
        },
        {
            name: 'Calidad media (cualquier formato)',
            command: `"${ytDlpCommand}" -f "bestaudio" ${YT_DLP_OPTIONS} --output "${tempFilePath}" "${queryOrUrl}"`,
            fileExt: ''
        }
    ];

    for (let i = 0; i < audioStrategies.length; i++) {
        const strategy = audioStrategies[i];
        const currentFilePath = tempFilePath + strategy.fileExt;

        try {
            console.log(`🔊 Intentando audio: ${strategy.name}...`);
            await execPromise(strategy.command);

            if (fs.existsSync(currentFilePath) && fs.statSync(currentFilePath).size > 1024) {
                const stats = fs.statSync(currentFilePath);
                console.log(`✅ Audio descargado (${strategy.name}): ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                
                return {
                    filePath: currentFilePath,
                    videoInfo: videoInfo,
                    quality: strategy.name
                };
            }

            cleanUpFile(currentFilePath);

        } catch (error) {
            console.log(`❌ Estrategia de audio "${strategy.name}" falló:`, error.message);
            cleanUpFile(currentFilePath);
        }
    }

    console.log("❌ Todas las estrategias de audio fallaron");
    return null;
}

/**
 * Obtiene lista de calidades disponibles para mostrar en ayuda
 */
export function getAvailableQualities() {
    return Object.keys(QUALITY_MAP).filter(q => !q.startsWith('audio_'));
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

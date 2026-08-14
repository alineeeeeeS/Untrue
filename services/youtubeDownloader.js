import { exec } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import fs from 'fs';
import { promisify } from 'util';

const execPromise = promisify(exec);

function getYtDlpPath() {
    const possiblePaths = [
        process.env.YTDLP_PATH,
        'yt-dlp',
        '/usr/local/bin/yt-dlp',
        '/usr/bin/yt-dlp'
    ].filter(Boolean);
    return possiblePaths[0];
}

const ytDlpCommand = getYtDlpPath();
const COOKIES_PATH = process.env.COOKIES_PATH || './youtube-cookies.txt';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// No fijar --extractor-args player_client: los clientes por defecto de yt-dlp
// (android_vr y compañía) son los únicos que devuelven formatos. Forzar "web",
// "tv" o "web_safari" hace que YouTube solo sirva storyboards y yt-dlp corte con
// "Requested format is not available".
function getBaseFlags(useCookies = false) {
    const flags = [
        '--no-playlist',
        '--no-warnings',
        '--no-check-certificates',
        '--geo-bypass',
        '--user-agent', `"${USER_AGENT}"`,
        '--socket-timeout', '25',
        '--retries', '3',
        '--fragment-retries', '3'
    ];

    if (useCookies && fs.existsSync(COOKIES_PATH)) {
        flags.push('--cookies', COOKIES_PATH);
        console.log('reintentando con youtube-cookies.txt');
    }

    return flags.join(' ');
}

// Sin cookies primero: con cookies de sesión YouTube deja de entregar formatos
// descargables (verificado: mismo comando pasa sin cookies y falla con ellas).
// Solo se reintenta con cookies si sin ellas salta el bot check.
function getCookieModes() {
    return fs.existsSync(COOKIES_PATH) ? [false, true] : [false];
}

export async function getYouTubeVideoInfo(queryOrUrl, useCookies = false) {
    try {
        const command = `"${ytDlpCommand}" ${getBaseFlags(useCookies)} --ignore-no-formats-error --dump-json "${queryOrUrl}"`;
        const { stdout } = await execPromise(command, { maxBuffer: 10 * 1024 * 1024 });
        const info = JSON.parse(stdout.trim().split('\n')[0]);

        const uploadDate = info.upload_date
            ? `${info.upload_date.substring(6, 8)}/${info.upload_date.substring(4, 6)}/${info.upload_date.substring(0, 4)}`
            : 'N/A';

        return {
            title: info.title || 'Título Desconocido',
            author: info.channel || info.uploader || 'Autor Desconocido',
            duration: info.duration || 0,
            uploadDate,
            thumbnail: info.thumbnail || null,
            url: info.webpage_url || queryOrUrl
        };
    } catch (error) {
        console.error('Error al obtener info del video:', error.message);
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

export async function downloadYoutubeAudio(args) {
    const isSearch = !args[0]?.startsWith('http');
    const queryOrUrl = isSearch ? `ytsearch1:${args.join(' ')}` : args[0];

    let videoInfo = getDefaultVideoInfo();

    console.log(`🎵 Descargando Audio: ${isSearch ? 'Búsqueda' : 'URL'}`);

    try {
        videoInfo = await getYouTubeVideoInfo(queryOrUrl);
        console.log(`🔍 Info: ${videoInfo.title}`);
    } catch (error) {
        console.error('Error obteniendo información:', error.message);
    }

    if (videoInfo.duration > 900) {
        throw new Error('El video es demasiado largo (máximo 15 minutos para audio)');
    }

    const tempFileName = `youtube-audio-${Date.now()}`;
    const tempFilePath = join(tmpdir(), tempFileName);

    const strategies = [
        `-f bestaudio/best --extract-audio --audio-format mp3 --audio-quality 5`,
        `-f bestaudio/best`
    ];

    let lastError = null;

    for (const useCookies of getCookieModes()) {
        for (let i = 0; i < strategies.length; i++) {
            try {
                const command = `"${ytDlpCommand}" ${getBaseFlags(useCookies)} ${strategies[i]} --output "${tempFilePath}.%(ext)s" "${queryOrUrl}"`;
                console.log(`intentando audio ${i + 1}${useCookies ? ' (cookies)' : ''}...`);

                await execPromise(command, { maxBuffer: 50 * 1024 * 1024, timeout: 180000 });

                const possibleFiles = [
                    `${tempFilePath}.mp3`,
                    `${tempFilePath}.m4a`,
                    `${tempFilePath}.webm`,
                    `${tempFilePath}.opus`,
                    `${tempFilePath}.ogg`,
                    tempFilePath
                ];

                for (const file of possibleFiles) {
                    if (fs.existsSync(file) && fs.statSync(file).size > 1024) {
                        const stats = fs.statSync(file);
                        console.log(`audio descargado: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                        return {
                            filePath: file,
                            videoInfo
                        };
                    }
                }
            } catch (error) {
                lastError = error;
                console.error(`estrategia de audio ${i + 1} falló:`, error.message);
            }
        }
    }

    throw new Error(`No se pudo descargar el audio: ${lastError?.message || 'Error desconocido'}`);
}

export async function downloadYoutubeVideo(args) {
    const isSearch = !args[0]?.startsWith('http');
    const queryOrUrl = isSearch ? `ytsearch1:${args.join(' ')}` : args[0];

    let videoInfo = getDefaultVideoInfo();

    console.log(`descargando Video: ${isSearch ? 'Búsqueda' : 'URL'}`);

    try {
        videoInfo = await getYouTubeVideoInfo(queryOrUrl);
        console.log(`🔍 Info: ${videoInfo.title}`);
    } catch (error) {
        console.error('Error obteniendo información:', error.message);
    }

    if (videoInfo.duration > 480) {
        throw new Error('El video es demasiado largo (máximo 8 minutos para video)');
    }

    const tempFileName = `youtube-video-${Date.now()}`;
    const tempFilePath = join(tmpdir(), tempFileName);

    const strategies = [
        `-f "bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480]/bv*+ba/b" --merge-output-format mp4`,
        `-f "b[ext=mp4]/b"`
    ];

    let lastError = null;

    for (const useCookies of getCookieModes()) {
        for (let i = 0; i < strategies.length; i++) {
            try {
                const command = `"${ytDlpCommand}" ${getBaseFlags(useCookies)} ${strategies[i]} --output "${tempFilePath}.%(ext)s" "${queryOrUrl}"`;
                console.log(`📥 Intentando estrategia de video ${i + 1}${useCookies ? ' (cookies)' : ''}...`);

                await execPromise(command, { maxBuffer: 100 * 1024 * 1024, timeout: 180000 });

                const possibleFiles = [
                    `${tempFilePath}.mp4`,
                    `${tempFilePath}.webm`,
                    `${tempFilePath}.mkv`,
                    tempFilePath
                ];

                for (const file of possibleFiles) {
                    if (fs.existsSync(file) && fs.statSync(file).size > 1024) {
                        const stats = fs.statSync(file);
                        console.log(`✅ Video descargado: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                        return {
                            filePath: file,
                            videoInfo
                        };
                    }
                }
            } catch (error) {
                lastError = error;
                console.error(`❌ Estrategia de video ${i + 1} falló:`, error.message);
            }
        }
    }

    throw new Error(`No se pudo descargar el video: ${lastError?.message || 'Error desconocido'}`);
}

export function cleanUpFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (error) {}
    }
}

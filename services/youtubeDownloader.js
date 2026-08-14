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
        '/usr/bin/yt-dlp',
        '/home/runner/workspace/.pythonlibs/bin/yt-dlp'
    ].filter(Boolean);

    return possiblePaths[0];
}

const ytDlpCommand = getYtDlpPath();

const COOKIES_PATH = process.env.COOKIES_PATH || '/app/youtube-cookies.txt';

function getBaseFlags() {
    const flags = [
        '--no-playlist',
        '--no-warnings',
        '--no-check-certificates',
        '--geo-bypass',
        '--sleep-interval', '1',
        '--max-sleep-interval', '3',
        '--extractor-args', 'youtube:player_client=android,web,mweb',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    if (fs.existsSync(COOKIES_PATH)) {
        flags.push('--cookies', COOKIES_PATH);
        console.log('🍪 Usando cookies.txt');
    } else {
        console.log('⚠️ No se encontró cookies.txt - puede fallar por detección de bot');
    }

    return flags.join(' ');
}

export async function getYouTubeVideoInfo(queryOrUrl) {
    try {
        const command = `"${ytDlpCommand}" ${getBaseFlags()} --dump-json "${queryOrUrl}"`;
        const { stdout } = await execPromise(command, { maxBuffer: 10 * 1024 * 1024 });
        const info = JSON.parse(stdout);

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
        `-f "bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio" --extract-audio --audio-format m4a --audio-quality 0`,
        `-f "bestaudio" --extract-audio --audio-format mp3 --audio-quality 5`,
        `-f "bestaudio/best"`
    ];

    let lastError = null;

    for (let i = 0; i < strategies.length; i++) {
        try {
            const command = `"${ytDlpCommand}" ${getBaseFlags()} ${strategies[i]} --output "${tempFilePath}.%(ext)s" "${queryOrUrl}"`;
            console.log(`🎵 Intentando estrategia de audio ${i + 1}...`);

            await execPromise(command, { maxBuffer: 50 * 1024 * 1024, timeout: 120000 });

            const possibleFiles = [
                `${tempFilePath}.m4a`,
                `${tempFilePath}.mp3`,
                `${tempFilePath}.webm`,
                `${tempFilePath}.opus`,
                `${tempFilePath}.ogg`,
                tempFilePath
            ];

            for (const file of possibleFiles) {
                if (fs.existsSync(file) && fs.statSync(file).size > 1024) {
                    const stats = fs.statSync(file);
                    console.log(`✅ Audio descargado: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

                    return {
                        filePath: file,
                        videoInfo
                    };
                }
            }
        } catch (error) {
            lastError = error;
            console.error(`❌ Estrategia de audio ${i + 1} falló:`, error.message);
        }
    }

    throw new Error(`No se pudo descargar el audio: ${lastError?.message || 'Error desconocido'}`);
}

export async function downloadYoutubeVideo(args) {
    const isSearch = !args[0]?.startsWith('http');
    const queryOrUrl = isSearch ? `ytsearch1:${args.join(' ')}` : args[0];

    let videoInfo = getDefaultVideoInfo();

    console.log(`📥 Descargando Video: ${isSearch ? 'Búsqueda' : 'URL'}`);

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
        `-f "best[height<=480][ext=mp4]/best[height<=480]"`,
        `-f "best[height<=720][ext=mp4]/best[height<=720]"`,
        `-f "best[ext=mp4]/best"`
    ];

    let lastError = null;

    for (let i = 0; i < strategies.length; i++) {
        try {
            const command = `"${ytDlpCommand}" ${getBaseFlags()} ${strategies[i]} --output "${tempFilePath}.%(ext)s" "${queryOrUrl}"`;
            console.log(`📥 Intentando estrategia de video ${i + 1}...`);

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

    throw new Error(`No se pudo descargar el video: ${lastError?.message || 'Error desconocido'}`);
}

export function cleanUpFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (error) {
        }
    }
}

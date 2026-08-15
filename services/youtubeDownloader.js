import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const COBALT_API = (process.env.COBALT_API_URL || '').replace(/\/$/, '');
const COBALT_KEY = process.env.COBALT_API_KEY || '';

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
}

function isYoutubeUrl(text) {
    return /youtube\.com|youtu\.be/i.test(text);
}

async function resolveYoutubeUrl(queryOrUrl) {
    const q = Array.isArray(queryOrUrl) ? queryOrUrl.join(' ') : String(queryOrUrl).trim();

    if (isYoutubeUrl(q)) {
        const match = q.match(/https?:\/\/[^\s]+/);
        return match ? match[0] : q;
    }

    try {
        const play = (await import('play-dl')).default;
        const results = await play.search(q, { limit: 1 });
        if (results?.length && results[0].url) {
            return results[0].url;
        }
    } catch (e) {
        console.error('Search failed:', e.message);
    }

    throw new Error('No se encontró el video. Usa un enlace de YouTube.');
}

async function cobaltRequest(body) {
    if (!COBALT_API) {
        throw new Error('COBALT_API_URL no está configurada');
    }

    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json'
    };

    if (COBALT_KEY) {
        headers.Authorization = `Api-Key ${COBALT_KEY}`;
    }

    const res = await fetch(`${COBALT_API}/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    let data;
    try {
        data = await res.json();
    } catch {
        throw new Error(`Cobalt no respondió JSON (${res.status})`);
    }

    if (data.status === 'error') {
        const code = data.error?.code || 'unknown';
        throw new Error(`Cobalt: ${code}`);
    }

    if (data.status === 'tunnel' || data.status === 'redirect') {
        return data;
    }

    if (data.status === 'picker' && Array.isArray(data.picker) && data.picker.length) {
        const item = data.picker.find(p => p.type === 'video') || data.picker[0];
        return {
            status: 'redirect',
            url: item.url,
            filename: data.filename || 'media'
        };
    }

    throw new Error(`Respuesta Cobalt no soportada: ${data.status || res.status}`);
}

async function downloadToFile(url, destPath) {
    const headers = {};
    if (COBALT_KEY) {
        headers.Authorization = `Api-Key ${COBALT_KEY}`;
    }

    const res = await fetch(url, { headers });

    if (!res.ok) {
        throw new Error(`Error descargando archivo (${res.status})`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) {
        throw new Error('Archivo vacío');
    }

    writeFileSync(destPath, buffer);
    return destPath;
}

function defaultInfo(url, filename) {
    return {
        title: filename ? filename.replace(/\.[^.]+$/, '') : 'YouTube',
        author: 'Desconocido',
        duration: 0,
        durationFormatted: 'N/A',
        url
    };
}

export async function getYouTubeVideoInfo(queryOrUrl) {
    const url = await resolveYoutubeUrl(queryOrUrl);
    return { ...defaultInfo(url), url };
}

export async function downloadYoutubeAudio(args, format = 'mp3') {
    const url = await resolveYoutubeUrl(args);
    console.log(`Cobalt audio: ${url}`);

    const data = await cobaltRequest({
        url,
        downloadMode: 'audio',
        audioFormat: format === 'm4a' ? 'best' : 'mp3',
        audioBitrate: '128',
        filenameStyle: 'basic'
    });

    if (!data.url) {
        throw new Error('Cobalt no devolvió URL de descarga');
    }

    const ext = format === 'm4a' ? 'm4a' : 'mp3';
    const filePath = join(tmpdir(), `yt-audio-${Date.now()}.${ext}`);
    await downloadToFile(data.url, filePath);

    if (!existsSync(filePath)) {
        throw new Error('No se guardó el archivo de audio');
    }

    return {
        filePath,
        videoInfo: defaultInfo(url, data.filename)
    };
}

export async function downloadYoutubeVideo(args) {
    const url = await resolveYoutubeUrl(args);
    console.log(`Cobalt video: ${url}`);

    const data = await cobaltRequest({
        url,
        downloadMode: 'auto',
        videoQuality: '480',
        youtubeVideoCodec: 'h264',
        youtubeVideoContainer: 'mp4',
        filenameStyle: 'basic'
    });

    if (!data.url) {
        throw new Error('Cobalt no devolvió URL de descarga');
    }

    const filePath = join(tmpdir(), `yt-video-${Date.now()}.mp4`);
    await downloadToFile(data.url, filePath);

    if (!existsSync(filePath)) {
        throw new Error('No se guardó el archivo de video');
    }

    return {
        filePath,
        videoInfo: defaultInfo(url, data.filename)
    };
}

export async function cleanUpFile(filePath) {
    if (!filePath || !existsSync(filePath)) return;
    try {
        unlinkSync(filePath);
    } catch {}
}

export async function getYoutubeInfo(query) {
    return getYouTubeVideoInfo(query);
}

export default {
    downloadYoutubeVideo,
    downloadYoutubeAudio,
    cleanUpFile,
    getYoutubeInfo,
    getYouTubeVideoInfo
};

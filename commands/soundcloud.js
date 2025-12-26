import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const execPromise = promisify(exec);

export async function scCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    if (args.length === 0) return sock.sendMessage(remoteJid, { text: "❌ *Uso correcto:*\n▸ #sc _artista_ *canción*\n▸ #sc _link_" }, { quoted: m });

    const query = args.join(' ');
    const isUrl = query.startsWith('http');
    const input = isUrl ? `"${query}"` : `"scsearch1:${query}"`;
    const tempId = Date.now();
    const tempFilePath = path.join('./temp', `sc_${tempId}.mp3`);

    try {
        // 1. Reacción Inicial
        await sock.sendMessage(remoteJid, { react: { text: "⌛", key: m.key } });

        // 2. Obtener Metadatos (Usando la lógica de tu youtubeDownloader)
        const metaCmd = `yt-dlp --dump-json --no-playlist --no-warnings ${input}`;
        const { stdout: metaStdout } = await execPromise(metaCmd);
        const data = isUrl ? JSON.parse(metaStdout) : JSON.parse(metaStdout).entries[0];

        if (!data) throw new Error("No se encontró la canción.");

        // 3. Descarga Directa
        const dlCmd = `yt-dlp -x --audio-format mp3 --audio-quality 128K --ffmpeg-location /usr/bin/ffmpeg -o "${tempFilePath}" "${data.webpage_url}"`;
        await execPromise(dlCmd);

        // 4. Procesar Miniatura (Copiado de tu lógica de youtubeAudio.js)
        let thumbnailBuffer = null;
        if (data.thumbnail) {
            try {
                const response = await fetch(data.thumbnail);
                thumbnailBuffer = Buffer.from(await response.arrayBuffer());
            } catch (thumbnailError) {
                console.warn("[SC] No se pudo obtener thumbnail:", thumbnailError.message);
            }
        }

        // 5. Construir el mensaje de Audio (Siguiendo tu estructura de YouTube)
        const audioBuffer = fs.readFileSync(tempFilePath);
        const audioMessage = { 
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: `${data.title.substring(0, 50)}.mp3`,
            contextInfo: {
                externalAdReply: {
                    title: data.title.substring(0, 60),
                    body: (data.uploader || 'SoundCloud').substring(0, 40),
                    thumbnail: thumbnailBuffer,
                    sourceUrl: data.webpage_url,
                    mediaType: 1,
                    showAdAttribution: true,
                    // Eliminamos renderLargerThumbnail porque a veces causa el error fantasma
                }
            }
        };

        // 6. ENVIAR Y REACCIONAR
        await sock.sendMessage(remoteJid, audioMessage, { quoted: m });
        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

        // Limpieza
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    } catch (error) {
        console.error('[SC] ERROR:', error);
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        
        // Mensaje de error para el usuario
        await sock.sendMessage(remoteJid, { 
            text: `❌ *ERROR EN SOUNDCLOUD*\n\n${error.message}` 
        }, { quoted: m });

        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
}
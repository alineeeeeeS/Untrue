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
    // Usamos scsearch1 para limitar a 1 solo resultado
    const input = isUrl ? `"${query}"` : `scsearch1:"${query}"`;
    const tempId = Date.now();
    const tempFilePath = path.join('./temp', `sc_${tempId}.mp3`);

    try {
        // 1. Reacción de espera
        await sock.sendMessage(remoteJid, { react: { text: "⌛", key: m.key } });

        // 2. Obtener Metadatos con manejo de errores robusto
        const metaCmd = `yt-dlp --dump-json --no-playlist --no-warnings --no-check-certificate ${input}`;
        const { stdout: metaStdout } = await execPromise(metaCmd);
        const jsonRes = JSON.parse(metaStdout);
        
        // Corrección del error 'undefined reading 0':
        // yt-dlp puede devolver un objeto directo o un objeto con una lista 'entries'
        const data = jsonRes.entries ? jsonRes.entries[0] : jsonRes;

        if (!data) throw new Error("No se encontraron resultados.");

        // 3. Descargar Audio
        const dlCmd = `yt-dlp -x --audio-format mp3 --audio-quality 128K --ffmpeg-location /usr/bin/ffmpeg -o "${tempFilePath}" "${data.webpage_url}"`;
        await execPromise(dlCmd);

        // 4. Obtener Miniatura (siguiendo tu lógica de youtubeAudio.js)
        let thumbnailBuffer = null;
        if (data.thumbnail) {
            try {
                const response = await fetch(data.thumbnail);
                if (response.ok) {
                    thumbnailBuffer = Buffer.from(await response.arrayBuffer());
                }
            } catch (thumbError) {
                console.warn("[SC] Error en thumbnail:", thumbError.message);
            }
        }

        // 5. Envío de Audio (Estructura idéntica a tu youtubeAudio.js)
        const audioBuffer = fs.readFileSync(tempFilePath);
        
        await sock.sendMessage(remoteJid, {
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
                    showAdAttribution: true
                    // Eliminamos renderLargerThumbnail por estabilidad
                }
            }
        }, { quoted: m });

        // 6. Reacción de éxito
        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

        // Limpieza
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    } catch (error) {
        console.error('[SC] ERROR:', error);
        
        // Reacción y mensaje de error
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(remoteJid, { 
            text: `❌ *Error:* ${error.message.includes('entries') ? 'No se encontró la canción' : error.message}` 
        }, { quoted: m });

        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
}
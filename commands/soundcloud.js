import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

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
        // 1. Reacción de "Procesando" ⌛
        await sock.sendMessage(remoteJid, { react: { text: "⌛", key: m.key } });

        // 2. Obtener Metadatos (Título, Autor, Miniatura, URL)
        // Usamos --dump-single-json para obtener la info sin descargar aún
        const metaCmd = `yt-dlp --dump-single-json --no-warnings --no-check-certificate ${input}`;
        const { stdout: metaStdout } = await execPromise(metaCmd);
        const data = isUrl ? JSON.parse(metaStdout) : JSON.parse(metaStdout).entries[0];

        if (!data) throw new Error("No se encontró la canción.");

        // 3. Descarga y Conversión a MP3
        const dlCmd = `yt-dlp -x --audio-format mp3 --audio-quality 128K --ffmpeg-location /usr/bin/ffmpeg -o "${tempFilePath}" "${data.webpage_url}"`;
        await execPromise(dlCmd);

        // 4. Obtener Miniatura (Thumbnail)
        let thumbnailBuffer = null;
        if (data.thumbnail) {
            try {
                const response = await fetch(data.thumbnail);
                if (response.ok) {
                    thumbnailBuffer = Buffer.from(await response.arrayBuffer());
                }
            } catch (thumbError) {
                console.warn("[SC] Error miniatura:", thumbError.message);
            }
        }

        // 5. Preparar mensaje de audio con "Embed"
        const audioMessage = {
            audio: fs.readFileSync(tempFilePath),
            mimetype: 'audio/mpeg',
            fileName: `${data.title}.mp3`,
            contextInfo: {
                externalAdReply: {
                    title: data.title.substring(0, 60),
                    body: (data.uploader || 'SoundCloud').substring(0, 40),
                    thumbnail: thumbnailBuffer,
                    sourceUrl: data.webpage_url,
                    mediaType: 1,
                    showAdAttribution: true,
                    renderLargerThumbnail: true
                }
            }
        };

        // 6. Enviar audio y cambiar reacción a ✅
        await sock.sendMessage(remoteJid, audioMessage, { quoted: m });
        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

        // Limpieza
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    } catch (error) {
        console.error('[SC] ERROR:', error);
        
        // 7. Reacción de Error ❌ y Mensaje
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        
        let errorMessage = "❌ *Error al descargar de SoundCloud*";
        if (error.message.includes("No se encontró")) {
            errorMessage = "❌ *No se encontró ningún resultado para tu búsqueda.*";
        } else if (error.message.includes("JSON")) {
            errorMessage = "❌ *Error al obtener información. Verifica el link.*";
        }

        await sock.sendMessage(remoteJid, { text: errorMessage }, { quoted: m });
        
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
}
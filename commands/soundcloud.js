import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp'; // Usaremos sharp para optimizar la imagen

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
        await sock.sendMessage(remoteJid, { react: { text: "⌛", key: m.key } });

        // 1. Obtener Metadatos
        const metaCmd = `yt-dlp --dump-single-json --no-warnings --no-check-certificate ${input}`;
        const { stdout: metaStdout } = await execPromise(metaCmd);
        const data = isUrl ? JSON.parse(metaStdout) : JSON.parse(metaStdout).entries[0];

        if (!data) throw new Error("No se encontró la canción.");

        // 2. Descargar Audio (128k para ligereza)
        const dlCmd = `yt-dlp -x --audio-format mp3 --audio-quality 128K --ffmpeg-location /usr/bin/ffmpeg -o "${tempFilePath}" "${data.webpage_url}"`;
        await execPromise(dlCmd);

        // 3. Procesar Miniatura con SHARP (Para que WhatsApp no la rechace)
        let thumbnailBuffer = null;
        if (data.thumbnail) {
            try {
                const response = await fetch(data.thumbnail);
                if (response.ok) {
                    const bufferRaw = Buffer.from(await response.arrayBuffer());
                    // Redimensionamos a 300x300 y convertimos a JPEG ligero
                    thumbnailBuffer = await sharp(bufferRaw)
                        .resize(300, 300)
                        .jpeg({ quality: 70 })
                        .toBuffer();
                }
            } catch (thumbError) {
                console.warn("[SC] Error procesando miniatura con sharp:", thumbError.message);
            }
        }

        // 4. Intento de Envío con Embed
        try {
            await sock.sendMessage(remoteJid, {
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
            }, { quoted: m });
        } catch (sendError) {
            console.error("[SC] Error en envío con embed, intentando envío simple...");
            // Si falla el envío con miniatura, enviamos solo el audio
            await sock.sendMessage(remoteJid, {
                audio: fs.readFileSync(tempFilePath),
                mimetype: 'audio/mpeg'
            }, { quoted: m });
        }

        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

        // Limpieza
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    } catch (error) {
        console.error('[SC] ERROR:', error);
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(remoteJid, { text: `❌ Error: ${error.message}` }, { quoted: m });
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
}
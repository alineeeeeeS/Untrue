import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

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

        // 2. Descargar Audio
        const dlCmd = `yt-dlp -x --audio-format mp3 --audio-quality 128K --ffmpeg-location /usr/bin/ffmpeg -o "${tempFilePath}" "${data.webpage_url}"`;
        await execPromise(dlCmd);

        // 3. Procesamiento de Miniatura "Ultra-Safe"
        let thumbnailBuffer = null;
        if (data.thumbnail) {
            try {
                const response = await fetch(data.thumbnail);
                if (response.ok) {
                    const bufferRaw = Buffer.from(await response.arrayBuffer());
                    thumbnailBuffer = await sharp(bufferRaw)
                        .resize(200, 200) // Tamaño pequeño es más seguro
                        .flatten({ background: { r: 255, g: 255, b: 255 } }) // Elimina transparencias
                        .jpeg({ quality: 80, chromaSubsampling: '4:4:4' }) // Perfil de color estándar
                        .toBuffer();
                }
            } catch (thumbError) {
                console.warn("[SC] Falló miniatura, siguiendo sin ella.");
            }
        }

        // 4. ENVÍO CON ESTRUCTURA BLINDADA
        const audioData = fs.readFileSync(tempFilePath);
        
        try {
            // Intentamos envío con miniatura (Embed)
            await sock.sendMessage(remoteJid, {
                audio: audioData,
                mimetype: 'audio/mpeg',
                fileName: `${data.title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        title: data.title.substring(0, 50),
                        body: 'SoundCloud Music',
                        thumbnail: thumbnailBuffer, // El buffer optimizado por Sharp
                        sourceUrl: data.webpage_url,
                        mediaType: 1,
                        showAdAttribution: true,
                        renderLargerThumbnail: false // Desactivado para evitar errores de carga
                    }
                }
            }, { quoted: m });
        } catch (err) {
            // FALLBACK: Si WhatsApp rechaza el embed, enviamos el audio solo
            await sock.sendMessage(remoteJid, {
                audio: audioData,
                mimetype: 'audio/mpeg',
                fileName: `${data.title}.mp3`
            }, { quoted: m });
        }

        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

        // Limpieza
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    } catch (error) {
        console.error('[SC] ERROR:', error);
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(remoteJid, { text: "❌ No se pudo completar la descarga. Intenta de nuevo." }, { quoted: m });
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
}
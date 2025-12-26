import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import axios from 'axios'; 

const execPromise = promisify(exec);

export async function scCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (args.length === 0) {
        return sock.sendMessage(remoteJid, { 
            text: "🔎 *SoundCloud Downloader*\n\nEscribe el nombre de la canción o pega un link.\nEjemplo: `#sc airbag radiohead`" 
        }, { quoted: m });
    }

    const query = args.join(' ');
    const isUrl = query.startsWith('http');
    const input = isUrl ? `"${query}"` : `"scsearch1:${query}"`;
    const tempFilePath = path.join('./temp', `sc_${Date.now()}`);

    try {
        await sock.sendMessage(remoteJid, { text: "⏳ Buscando y procesando... Por favor espera." }, { quoted: m });

        // 1. Descarga y obtención de datos con yt-dlp
        const command = `yt-dlp -x --audio-format mp3 --print-json --no-warnings --no-playlist -o "${tempFilePath}.%(ext)s" ${input}`;
        const { stdout } = await execPromise(command);
        const data = JSON.parse(stdout);
        const finalFileName = `${tempFilePath}.mp3`;

        // 2. Descargar la miniatura a un Buffer para evitar errores de entrega
        let thumbnailBuffer = null;
        if (data.thumbnail) {
            try {
                const res = await axios.get(data.thumbnail, { responseType: 'arraybuffer' });
                thumbnailBuffer = Buffer.from(res.data, 'binary');
            } catch (e) {
                console.error("Error descargando miniatura:", e.message);
            }
        }

        // 3. Leer el audio
        const audioBuffer = fs.readFileSync(finalFileName);

        // 4. Enviar a WhatsApp (Estructura optimizada)
        await sock.sendMessage(remoteJid, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: `${data.title}.mp3`,
            contextInfo: {
                externalAdReply: {
                    title: data.title,
                    body: `SoundCloud • ${data.uploader || 'Artista'}`,
                    mediaType: 1,
                    showAdAttribution: true,
                    renderLargerThumbnail: true,
                    // Si falló la descarga de la miniatura, no enviamos este campo para no romper el mensaje
                    thumbnail: thumbnailBuffer, 
                    sourceUrl: data.webpage_url
                }
            }
        }, { quoted: m });

        // 5. Limpieza
        if (fs.existsSync(finalFileName)) fs.unlinkSync(finalFileName);

    } catch (error) {
        console.error('❌ Error en SoundCloud:', error);
        if (fs.existsSync(`${tempFilePath}.mp3`)) fs.unlinkSync(`${tempFilePath}.mp3`);

        await sock.sendMessage(remoteJid, { 
            text: `❌ Error: No se pudo completar la descarga.` 
        }, { quoted: m });
    }
}
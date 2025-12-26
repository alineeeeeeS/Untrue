import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const execPromise = promisify(exec);

// Ruta que usas en youtubeDownloader.js
const YT_DLP = '/home/runner/workspace/.pythonlibs/bin/yt-dlp';

export async function scCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    // 1. Mensaje de uso simple
    if (!args || args.length === 0) {
        return sock.sendMessage(remoteJid, { 
            text: "❌ *Uso correcto:*\n▸ #sc _artista_ *canción*\n▸ #sc _link_" 
        }, { quoted: m });
    }

    const query = args.join(' ');
    const isUrl = query.startsWith('http');
    const input = isUrl ? `"${query}"` : `scsearch1:"${query}"`;
    const tempFilePath = path.join('./temp', `sc_${Date.now()}.mp3`);

    try {
        // 2. Reacción de procesamiento
        await sock.sendMessage(remoteJid, { react: { text: "⌛", key: m.key } });

        // 3. Obtener Metadatos (usando la lógica de tu youtubeDownloader)
        const { stdout: metaStdout } = await execPromise(`"${YT_DLP}" --dump-json --no-playlist --no-warnings ${input}`);
        const data = JSON.parse(metaStdout).entries ? JSON.parse(metaStdout).entries[0] : JSON.parse(metaStdout);

        // 4. Descarga (Forzando el codec libmp3lame para que WhatsApp no lo rechace)
        await execPromise(`"${YT_DLP}" -x --audio-format mp3 --audio-quality 128K --no-check-certificate -o "${tempFilePath}" "${data.webpage_url}"`);

        if (!fs.existsSync(tempFilePath)) throw new Error("Error: Archivo no generado.");

        // 5. Procesar miniatura (Solo si es necesario, usando arrayBuffer para evitar el error de Node 20)
        let thumbnail = null;
        if (data.thumbnail) {
            try {
                const res = await fetch(data.thumbnail);
                if (res.ok) {
                    const arrayBuffer = await res.arrayBuffer();
                    thumbnail = Buffer.from(arrayBuffer);
                }
            } catch (e) {
                console.log("Error miniatura ignorado para no bloquear envío");
            }
        }

        // 6. ENVÍO SIMPLE (Sin externalAdReply complejo para evitar el bloqueo de WhatsApp)
        // Esta es la estructura que WhatsApp NUNCA bloquea
        await sock.sendMessage(remoteJid, {
            audio: fs.readFileSync(tempFilePath),
            mimetype: 'audio/mpeg',
            fileName: `${data.title}.mp3`,
            contextInfo: {
                externalAdReply: {
                    title: data.title.substring(0, 60),
                    body: (data.uploader || 'SoundCloud').substring(0, 40),
                    thumbnail: thumbnail, // Si esto falla, Baileys lo ignora
                    mediaType: 1,
                    sourceUrl: data.webpage_url
                }
            }
        }, { quoted: m });

        // 7. Reacción de éxito
        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('[SC ERROR]:', error);
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(remoteJid, { text: "❌ Hubo un error al descargar la canción." }, { quoted: m });
    } finally {
        // Limpieza inmediata
        if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
        }
    }
}
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const execPromise = promisify(exec);

// Ruta compatible con tu Dockerfile
const YT_DLP = '/usr/bin/yt-dlp';

export async function scCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    // 1. MENSAJE DE USO (Simple como pediste)
    if (!args || args.length === 0) {
        return sock.sendMessage(remoteJid, { 
            text: "❌ *Uso correcto:*\n▸ #sc _artista_ *canción*\n▸ #sc _link_" 
        }, { quoted: m });
    }

    const query = args.join(' ');
    const isUrl = query.startsWith('http');
    const input = isUrl ? `"${query}"` : `scsearch1 viewer-process:"${query}"`;
    const tempFilePath = path.join('./temp', `sc_${Date.now()}.mp3`);

    try {
        // 2. REACCIÓN DE INICIO
        await sock.sendMessage(remoteJid, { react: { text: "⌛", key: m.key } });

        // 3. OBTENER METADATOS
        const { stdout: metaStdout } = await execPromise(`"${YT_DLP}" --dump-json --no-playlist --no-warnings ${isUrl ? `"${query}"` : `scsearch1:"${query}"`}`);
        const data = JSON.parse(metaStdout).entries ? JSON.parse(metaStdout).entries[0] : JSON.parse(metaStdout);

        // 4. DESCARGA DIRECTA (El método que confirmaste que funciona)
        await execPromise(`"${YT_DLP}" -x --audio-format mp3 --audio-quality 128K --no-check-certificate -o "${tempFilePath}" "${data.webpage_url}"`);

        // 5. PROCESAR MINIATURA (Versión corregida para Node 20)
        let thumbnailBuffer = null;
        if (data.thumbnail) {
            try {
                const response = await fetch(data.thumbnail);
                if (response.ok) {
                    // Usamos arrayBuffer para evitar el error de consola
                    const arrayBuffer = await response.arrayBuffer();
                    thumbnailBuffer = Buffer.from(arrayBuffer);
                }
            } catch (e) {
                console.log("Error miniatura omitido para asegurar envío");
            }
        }

        // 6. ENVÍO DE AUDIO (Estructura de YouTube que ya te funciona)
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
                    showAdAttribution: true
                }
            }
        }, { quoted: m });

        // 7. REACCIÓN DE ÉXITO
        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('[SC ERROR]:', error);
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(remoteJid, { text: "❌ Error al procesar la canción." }, { quoted: m });
    } finally {
        // Limpieza de archivo
        if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
        }
    }
}
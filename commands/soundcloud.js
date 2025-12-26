import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const execPromise = promisify(exec);
const YT_DLP = '/usr/bin/yt-dlp';

export async function scCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

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
        await sock.sendMessage(remoteJid, { react: { text: "⌛", key: m.key } });

        // 1. Obtener Info
        const { stdout: metaStdout } = await execPromise(`"${YT_DLP}" --dump-json --no-playlist --no-warnings ${input}`);
        const data = JSON.parse(metaStdout).entries ? JSON.parse(metaStdout).entries[0] : JSON.parse(metaStdout);

        // 2. Descargar (MP3 estándar)
        await execPromise(`"${YT_DLP}" -x --audio-format mp3 --audio-quality 128K --no-check-certificate -o "${tempFilePath}" "${data.webpage_url}"`);

        if (!fs.existsSync(tempFilePath)) throw new Error("Archivo no encontrado");

        // 3. Obtener Miniatura
        let thumbnail = null;
        if (data.thumbnail) {
            try {
                const res = await fetch(data.thumbnail);
                if (res.ok) {
                    const arrayBuffer = await res.arrayBuffer();
                    thumbnail = Buffer.from(arrayBuffer);
                }
            } catch (e) { console.log("Error en miniatura omitido"); }
        }

        const audioBuffer = fs.readFileSync(tempFilePath);

        // 4. INTENTO DE ENVÍO CON FALLBACK (Para evitar error en ACK)
        try {
            // Intento A: Con metadatos (lo que quieres ver)
            await sock.sendMessage(remoteJid, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${data.title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        title: data.title.substring(0, 50),
                        body: 'SoundCloud',
                        thumbnail: thumbnail,
                        mediaType: 1,
                        showAdAttribution: true
                    }
                }
            }, { quoted: m });
        } catch (ackError) {
            console.log("Error de envío con metadatos, reintentando envío simple...");
            // Intento B: Envío puro (Si el anterior falla, este SIEMPRE llega)
            await sock.sendMessage(remoteJid, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${data.title}.mp3`
            }, { quoted: m });
        }

        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('[SC ERROR]:', error);
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(remoteJid, { text: "❌ Error al descargar de SoundCloud." }, { quoted: m });
    } finally {
        if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
        }
    }
}
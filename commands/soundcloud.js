import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const execPromise = promisify(exec);

const YT_DLP = '/usr/bin/yt-dlp';

export async function scCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    // --- MENSAJE DE USO SIMPLE ---
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
        // 1. Reacción de carga
        await sock.sendMessage(remoteJid, { react: { text: "⌛", key: m.key } });

        // 2. Obtener Metadatos
        const { stdout: metaStdout } = await execPromise(`"${YT_DLP}" --dump-json --no-playlist --no-warnings ${input}`);
        const data = JSON.parse(metaStdout).entries ? JSON.parse(metaStdout).entries[0] : JSON.parse(metaStdout);

        // 3. Descarga Directa (Formato compatible con WhatsApp)
        await execPromise(`"${YT_DLP}" -x --audio-format mp3 --audio-quality 128K --no-check-certificate -o "${tempFilePath}" "${data.webpage_url}"`);

        // 4. Procesar Miniatura (Lógica YouTube)
        let thumb = null;
        if (data.thumbnail) {
            try {
                const res = await fetch(data.thumbnail);
                if (res.ok) thumb = await res.buffer();
            } catch (e) { console.error("Error thumb ignorado"); }
        }

        // 5. Envío de Audio (Estructura Blindada)
        await sock.sendMessage(remoteJid, {
            audio: { url: tempFilePath }, // Envío por ruta para máxima estabilidad
            mimetype: 'audio/mpeg',
            fileName: `${data.title}.mp3`,
            contextInfo: {
                externalAdReply: {
                    title: data.title.substring(0, 50),
                    body: (data.uploader || 'SoundCloud').substring(0, 30),
                    thumbnail: thumb,
                    sourceUrl: data.webpage_url,
                    mediaType: 1,
                    showAdAttribution: true
                }
            }
        }, { quoted: m });

        // 6. Éxito
        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('[SC ERROR]:', error);
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(remoteJid, { text: "❌ No se encontró la canción o hubo un error en la descarga." }, { quoted: m });
    } finally {
        // Borrado seguro con delay
        setTimeout(() => {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        }, 10000);
    }
}
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const execPromise = promisify(exec);

// Ruta exacta según tu Dockerfile
const YT_DLP_PATH = '/usr/bin/yt-dlp'; 

export async function scCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    if (!args || args.length === 0) return sock.sendMessage(remoteJid, { text: "❌ *Uso correcto:*\n▸ #sc _artista_ *canción*\n▸ #sc _link_" }, { quoted: m });

    const query = args.join(' ');
    const isUrl = query.startsWith('http');
    const input = isUrl ? `"${query}"` : `scsearch1:"${query}"`;
    const tempFilePath = path.join('./temp', `sc_${Date.now()}.mp3`);

    try {
        // 1. Reacción de inicio
        await sock.sendMessage(remoteJid, { react: { text: "⌛", key: m.key } });

        // 2. Obtener Metadatos (Sin descargar aún)
        const { stdout: metaStdout } = await execPromise(`"${YT_DLP_PATH}" --dump-json --no-playlist --no-warnings ${input}`);
        const rawData = JSON.parse(metaStdout);
        const data = rawData.entries ? rawData.entries[0] : rawData;

        if (!data) throw new Error("No se encontró el audio.");

        // 3. Descarga y Conversión (Forzando bitrate estándar de WhatsApp)
        // Usamos ffmpeg para asegurar que el contenedor sea MP3 puro
        await execPromise(`"${YT_DLP_PATH}" -x --audio-format mp3 --audio-quality 128K --no-check-certificate -o "${tempFilePath}" "${data.webpage_url}"`);

        if (!fs.existsSync(tempFilePath)) throw new Error("Error en la creación del archivo.");

        // 4. Procesar Miniatura (Lógica exacta de tu youtubeAudio.js)
        let thumbnailBuffer = null;
        if (data.thumbnail) {
            try {
                const response = await fetch(data.thumbnail);
                if (response.ok) {
                    thumbnailBuffer = Buffer.from(await response.arrayBuffer());
                }
            } catch (e) {
                console.warn("[SC] Error al descargar miniatura:", e.message);
            }
        }

        // 5. INTENTO DE ENVÍO ROBUSTO
        const audioBuffer = fs.readFileSync(tempFilePath);
        const baseOptions = {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: `${data.title}.mp3`
        };

        try {
            // Intento 1: Con "Embed" (Miniatura y Link)
            await sock.sendMessage(remoteJid, {
                ...baseOptions,
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
        } catch (embedError) {
            console.error("[SC] Error en envío con embed, reintentando envío simple...");
            // Intento 2: Envío simple (Sin miniatura) si el anterior fue bloqueado
            await sock.sendMessage(remoteJid, baseOptions, { quoted: m });
        }

        // 6. Éxito
        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('[SC] ERROR CRÍTICO:', error);
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        
        let msg = "❌ *ERROR EN LA DESCARGA*\n\n";
        if (error.message.includes("JSON")) msg += "No se encontró la canción. Intenta ser más específico.";
        else msg += "Ocurrió un error técnico al procesar el audio.";

        await sock.sendMessage(remoteJid, { text: msg }, { quoted: m });
    } finally {
        // Limpieza garantizada
        if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
        }
    }
}
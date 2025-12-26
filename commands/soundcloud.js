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
    const tempId = Date.now();
    const tempFilePath = path.join('./temp', `sc_${tempId}`);

    try {
        console.log(`[SC] Solicitud recibida: ${query}`);
        await sock.sendMessage(remoteJid, { text: "⏳ Buscando en SoundCloud..." }, { quoted: m });

        // PASO 1: Obtener Metadatos (Esto es muy rápido)
        console.log(`[SC] Paso 1: Obteniendo metadatos...`);
        const metaCmd = `yt-dlp --dump-single-json --no-warnings --no-check-certificate --no-playlist ${input}`;
        const { stdout: metaStdout } = await execPromise(metaCmd, { maxBuffer: 1024 * 1024 * 5 });
        
        const rawData = JSON.parse(metaStdout);
        const data = isUrl ? rawData : rawData.entries[0];

        if (!data) throw new Error("No se encontró ningún resultado.");
        console.log(`[SC] Encontrado: ${data.title}`);

        // PASO 2: Descargar y Convertir (Aquí es donde suele tardar)
        console.log(`[SC] Paso 2: Descargando audio...`);
        const dlCmd = `yt-dlp -x --audio-format mp3 --no-warnings --no-check-certificate -o "${tempFilePath}.%(ext)s" "${data.webpage_url}"`;
        
        // Aumentamos el buffer de ejecución para evitar cierres inesperados
        await execPromise(dlCmd, { maxBuffer: 1024 * 1024 * 20 }); 
        
        const finalFileName = `${tempFilePath}.mp3`;

        if (!fs.existsSync(finalFileName)) {
            throw new Error("El archivo MP3 no se generó.");
        }

        // PASO 3: Descargar Miniatura (Con timeout para no colgar el bot)
        let thumbnailBuffer = null;
        if (data.thumbnail) {
            console.log(`[SC] Paso 3: Descargando miniatura...`);
            try {
                const res = await axios.get(data.thumbnail, { 
                    responseType: 'arraybuffer',
                    timeout: 5000 
                });
                thumbnailBuffer = Buffer.from(res.data, 'binary');
            } catch (e) {
                console.error("[SC] Error en miniatura (se enviará sin ella):", e.message);
            }
        }

        // PASO 4: Envío a WhatsApp
        console.log(`[SC] Paso 4: Enviando a WhatsApp...`);
        const audioBuffer = fs.readFileSync(finalFileName);
        
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
                    thumbnail: thumbnailBuffer, 
                    sourceUrl: data.webpage_url
                }
            }
        }, { quoted: m });

        console.log(`[SC] ¡Completado con éxito!`);

        // Limpieza final
        if (fs.existsSync(finalFileName)) fs.unlinkSync(finalFileName);

    } catch (error) {
        console.error('[SC] ERROR:', error);
        
        if (fs.existsSync(`${tempFilePath}.mp3`)) fs.unlinkSync(`${tempFilePath}.mp3`);

        let msg = "❌ Error al procesar SoundCloud.";
        if (error.message.includes("No se encontró")) msg = "❌ No se encontraron resultados para esa búsqueda.";
        
        await sock.sendMessage(remoteJid, { text: msg }, { quoted: m });
    }
}
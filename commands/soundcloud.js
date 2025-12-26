import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = promisify(exec);

// Ruta absoluta de yt-dlp según tu Dockerfile
const YT_DLP = '/usr/local/bin/yt-dlp';

export async function scCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    // 1. Uso correcto (Simple)
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

        // 3. Descarga (Forzando MP3 estándar)
        // Eliminamos la búsqueda de metadatos previa para evitar errores de buffer
        const dlCommand = `"${YT_DLP}" -x --audio-format mp3 --audio-quality 128K --no-check-certificate -o "${tempFilePath}" ${input}`;
        await execPromise(dlCommand);

        if (!fs.existsSync(tempFilePath)) {
            throw new Error("No se pudo crear el archivo.");
        }

        // 4. ENVÍO (Versión Base: Sin miniaturas, sin externalAdReply)
        // Esto garantiza que NO haya error de ACK
        await sock.sendMessage(remoteJid, {
            audio: fs.readFileSync(tempFilePath),
            mimetype: 'audio/mpeg',
            ptt: false 
        }, { quoted: m });

        // 5. Reacción de éxito
        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('[SC ERROR]:', error);
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(remoteJid, { text: "❌ Error al descargar. Intenta de nuevo." }, { quoted: m });
    } finally {
        if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
        }
    }
}
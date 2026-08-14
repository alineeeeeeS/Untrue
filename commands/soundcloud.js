import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = promisify(exec);
const YT_DLP = '/usr/local/bin/yt-dlp';

export async function scCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!args || args.length === 0) {
        return sock.sendMessage(remoteJid, {
            text: "Uso correcto:\n#sc [artista] [canción]\n#sc [link]"
        }, { quoted: m });
    }

    const query = args.join(' ');
    const isUrl = query.startsWith('http');
    const input = isUrl ? `"${query}"` : `scsearch1:"${query}"`;
    const tempFilePath = path.join('./temp', `sc_${Date.now()}.mp3`);

    try {
        const dlCommand = `"${YT_DLP}" -x --audio-format mp3 --audio-quality 128K --no-check-certificate -o "${tempFilePath}" ${input}`;
        await execPromise(dlCommand);

        if (!fs.existsSync(tempFilePath)) {
            throw new Error("No se pudo crear el archivo.");
        }

        await sock.sendMessage(remoteJid, {
            audio: fs.readFileSync(tempFilePath),
            mimetype: 'audio/mpeg',
            ptt: false
        }, { quoted: m });

    } catch (error) {
        await sock.sendMessage(remoteJid, { text: "Error al descargar. Intenta de nuevo." }, { quoted: m });
    } finally {
        if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
        }
    }
}

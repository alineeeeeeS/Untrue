import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = promisify(exec);

export async function scCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    if (args.length === 0) return sock.sendMessage(remoteJid, { text: "🔎 Uso: `#sc nombre o link`" }, { quoted: m });

    const query = args.join(' ');
    const isUrl = query.startsWith('http');
    const input = isUrl ? `"${query}"` : `"scsearch1:${query}"`;
    const tempId = Date.now();
    const tempFilePath = path.join('./temp', `sc_${tempId}.mp3`);

    try {
        console.log(`[SC] Iniciando proceso para: ${query}`);
        await sock.sendMessage(remoteJid, { text: "⏳ Procesando audio..." }, { quoted: m });

        // 1. Descarga y Conversión DIRECTA a MP3 usando el ffmpeg del sistema
        // Forzamos 128k y codec libmp3lame para máxima compatibilidad con WhatsApp
        const command = `yt-dlp --no-warnings --no-check-certificate --no-playlist -x --audio-format mp3 --audio-quality 128K --ffmpeg-location /usr/bin/ffmpeg -o "${tempFilePath}" ${input}`;
        
        const { stdout } = await execPromise(command);
        
        // Extraer metadatos básicos del log de yt-dlp para el nombre
        const titleMatch = stdout.match(/\[download\] Destination: .*?sc_.*?\.(.*)/);
        
        if (!fs.existsSync(tempFilePath)) {
            throw new Error("Archivo no encontrado tras descarga.");
        }

        console.log(`[SC] Archivo generado: ${tempFilePath}. Tamaño: ${fs.statSync(tempFilePath).size} bytes`);

        // 2. Envío Simplificado (Sin miniaturas ni links externos por ahora)
        // Si este envío funciona, sabremos que el error era el externalAdReply
        await sock.sendMessage(remoteJid, {
            audio: fs.readFileSync(tempFilePath),
            mimetype: 'audio/mpeg',
            ptt: false // Cambiar a true si quieres que se envíe como nota de voz
        }, { quoted: m });

        console.log(`[SC] ¡Enviado correctamente!`);

        // Limpieza
        fs.unlinkSync(tempFilePath);

    } catch (error) {
        console.error('[SC] ERROR:', error);
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        await sock.sendMessage(remoteJid, { text: "❌ Error al procesar la descarga." }, { quoted: m });
    }
}
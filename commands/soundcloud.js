import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export async function scCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (args.length === 0) {
        return sock.sendMessage(remoteJid, { 
            text: "🔎 *SoundCloud Downloader*\n\nEscribe el nombre de la canción o pega un link.\nEjemplo: `#sc airbag radiohead` o `#sc [link]`" 
        }, { quoted: m });
    }

    const query = args.join(' ');
    const isUrl = query.startsWith('http');
    // Usamos scsearch1: para obtener solo el primer resultado si es una búsqueda
    const input = isUrl ? `"${query}"` : ` "scsearch1:${query}"`;

    try {
        await sock.sendMessage(remoteJid, { text: "⏳ Buscando en SoundCloud..." }, { quoted: m });

        // 1. Obtener metadatos (Título, Uploader, Thumbnail y URL real)
        const metadataCmd = `yt-dlp --dump-single-json --no-warnings ${input}`;
        const { stdout: metaStdout } = await execPromise(metadataCmd);
        const rawData = JSON.parse(metaStdout);
        
        // yt-dlp devuelve los datos en 'entries' si es una búsqueda
        const data = isUrl ? rawData : rawData.entries[0];

        if (!data) throw new Error("No se encontró el contenido.");

        // 2. Descargar el audio y convertirlo a Buffer
        // Usamos la mejor calidad de audio disponible
        const downloadCmd = `yt-dlp -f bestaudio -o - "${data.webpage_url}"`;
        
        // Ejecutamos la descarga con un buffer máximo mayor para evitar errores en archivos grandes
        const { stdout: audioBuffer } = await execPromise(downloadCmd, { 
            encoding: 'buffer', 
            maxBuffer: 100 * 1024 * 1024 // 100MB
        });

        // 3. Enviar el audio con metadatos enriquecidos
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
                    thumbnailUrl: data.thumbnail,
                    sourceUrl: data.webpage_url
                }
            }
        }, { quoted: m });

    } catch (error) {
        console.error('❌ Error en SoundCloud:', error);
        await sock.sendMessage(remoteJid, { 
            text: `❌ Error al procesar SoundCloud.\n\nDetalle: ${error.message}` 
        }, { quoted: m });
    }
}
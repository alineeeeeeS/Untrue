import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

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
    // Escapamos la consulta para evitar errores con caracteres especiales
    const input = isUrl ? `"${query}"` : `"scsearch1:${query}"`;
    
    // Generamos un nombre de archivo único en la carpeta temp/ que ya existe en tu bot
    const tempFilePath = path.join('./temp', `sc_${Date.now()}`);

    try {
        await sock.sendMessage(remoteJid, { text: "⏳ Buscando y procesando en SoundCloud... Esto puede tardar unos segundos." }, { quoted: m });

        // 1. Obtener metadatos y descargar al mismo tiempo usando yt-dlp
        // -x: Extraer audio
        // --audio-format mp3: Convertir a mp3
        // --print: Para obtener la info en JSON al final
        const command = `yt-dlp -x --audio-format mp3 --print-json --no-warnings --no-playlist -o "${tempFilePath}.%(ext)s" ${input}`;
        
        console.log(`Ejecutando: ${command}`);
        const { stdout } = await execPromise(command);
        const data = JSON.parse(stdout);

        const finalFileName = `${tempFilePath}.mp3`;

        if (!fs.existsSync(finalFileName)) {
            throw new Error("El archivo de audio no se generó correctamente.");
        }

        // 2. Leer el archivo generado
        const audioBuffer = fs.readFileSync(finalFileName);

        // 3. Enviar a WhatsApp
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

        // 4. Limpieza: Borrar el archivo temporal para no llenar el disco de Railway
        fs.unlinkSync(finalFileName);

    } catch (error) {
        console.error('❌ Error detallado en SoundCloud:', error);
        
        // Limpieza en caso de error si el archivo alcanzó a crearse
        const errorFile = `${tempFilePath}.mp3`;
        if (fs.existsSync(errorFile)) fs.unlinkSync(errorFile);

        await sock.sendMessage(remoteJid, { 
            text: `❌ No se pudo descargar.\n\n*Causa:* ${error.message.includes('JSON') ? 'No se encontraron resultados' : 'Error en el servidor'}` 
        }, { quoted: m });
    }
}
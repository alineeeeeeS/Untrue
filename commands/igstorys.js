import axios from 'axios';
import * as cheerio from 'cheerio';

export async function igstorysCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        if (!args[0]) {
            return await sock.sendMessage(jid, { 
                text: "❌ *Uso correcto:*\n▸ #story _usuario_\n▸ #story *número* _usuario_"
            }, { quoted: m });
        }

        let pos = (args.length >= 2 && !isNaN(args[0])) ? parseInt(args[0]) : null;
        let username = pos ? args[1] : args[0];
        username = username.replace('@', '').trim();

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        // --- CONFIGURACIÓN DE LA PETICIÓN SEGÚN TU HTML ---
        const formData = new URLSearchParams();
        formData.append('url', `https://www.instagram.com/${username}/`);
        // Nota: Añadimos el submit para imitar el clic del botón
        formData.append('submit', ''); 

        console.log(`📡 [DOWNLOADGRAM] Solicitando historias de: ${username}`);

        const response = await axios.post('https://api.downloadgram.org/story', formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://downloadgram.org/story-downloader.php',
                'Origin': 'https://downloadgram.org',
                'Accept': 'text/plain, */*; q=0.01'
            },
            timeout: 30000
        });

        // --- EXTRACCIÓN MEDIANTE SELECTORES QUE ME PASASTE ---
        const $ = cheerio.load(response.data);
        const stories = [];

        // Buscamos dentro de la ID que identificaste: #downloadhere
        $('#downloadhere .row').each((i, el) => {
            const downloadLink = $(el).find('a[href]').attr('href');
            
            if (downloadLink) {
                // El CDN de downloadgram usa tokens JWT. 
                // Si la URL contiene "force=true" o "mp4" suele ser video.
                const isVideo = downloadLink.includes('mp4') || downloadLink.includes('video') || downloadLink.includes('force=true');
                
                stories.push({
                    url: downloadLink,
                    type: isVideo ? 'video' : 'image',
                    mimetype: isVideo ? 'video/mp4' : 'image/jpeg'
                });
            }
        });

        if (stories.length === 0) throw new Error('NO_STORIES');

        // --- SELECCIÓN Y ENVÍO ---
        let toSend = pos ? [stories[pos - 1]] : stories;
        if (!toSend[0]) throw new Error('POS_ERROR');

        for (let i = 0; i < toSend.length; i++) {
            const s = toSend[i];
            const caption = `Historia descargada! _@${username}_ ${pos || (i + 1)}/${stories.length}`;

            // IMPORTANTE: Enviamos la URL con el Token JWT directamente
            await sock.sendMessage(jid, {
                [s.type]: { url: s.url },
                caption: caption,
                mimetype: s.mimetype,
                fileName: `ig_story_${username}.${s.type === 'video' ? 'mp4' : 'jpg'}`
            }, { quoted: m });

            // Pequeño delay para no saturar la conexión de WhatsApp
            if (toSend.length > 1) await new Promise(r => setTimeout(r, 1500));
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("❌ Error en Scraper:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        
        let msg = "⚠️ *Error:* No se pudo conectar con el servidor de descargas.";
        if (e.message === 'NO_STORIES') msg = "⚠️ *Error:* El usuario no tiene historias o es cuenta privada.";
        if (e.message === 'POS_ERROR') msg = `⚠️ *Error:* La historia #${pos} no existe.`;
        
        await sock.sendMessage(jid, { text: msg }, { quoted: m });
    }
}
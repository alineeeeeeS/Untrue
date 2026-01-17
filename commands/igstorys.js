import axios from 'axios';
import * as cheerio from 'cheerio';

export async function igstorysCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        if (!args[0]) return;

        let pos = (args.length >= 2 && !isNaN(args[0])) ? parseInt(args[0]) : null;
        let username = pos ? args[1] : args[0];
        username = username.replace('@', '').trim();

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        // Preparamos los datos del formulario
        const params = new URLSearchParams();
        params.append('url', `https://www.instagram.com/${username}/`);
        params.append('submit', ''); // Añadimos el valor del botón por si el PHP lo valida

        console.log(`📡 [DOWNLOADGRAM] Procesando descarga en /download para: ${username}`);

        // Hacemos el POST a la URL de destino que me indicaste
        const response = await axios.post('https://downloadgram.org/download', params, {
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'accept-language': 'es-ES,es;q=0.9',
                'content-type': 'application/x-www-form-urlencoded',
                'origin': 'https://downloadgram.org',
                'referer': 'https://downloadgram.org/story-downloader.php',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'upgrade-insecure-requests': '1'
            },
            maxRedirects: 5, // Por si la web hace saltos
            timeout: 35000
        });

        const $ = cheerio.load(response.data);
        const stories = [];

        // Buscamos los enlaces de descarga en la nueva página de resultados
        // Filtramos por links que contengan el token que vimos en tus etiquetas
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('token=') || href.includes('cdn.downloadgram.org'))) {
                // Si el link tiene 'force=true' o termina en .mp4 lo tratamos como video
                const isVideo = href.includes('force=true') || href.includes('.mp4');
                stories.push({
                    url: href,
                    type: isVideo ? 'video' : 'image',
                    mimetype: isVideo ? 'video/mp4' : 'image/jpeg'
                });
            }
        });

        // Eliminar posibles duplicados
        const uniqueStories = Array.from(new Set(stories.map(s => s.url)))
            .map(url => stories.find(s => s.url === url));

        if (uniqueStories.length === 0) {
            console.log("⚠️ No se hallaron links. Longitud HTML recibido:", response.data.length);
            throw new Error('NO_STORIES');
        }

        let toSend = pos ? [uniqueStories[pos - 1]] : uniqueStories;
        if (!toSend[0]) throw new Error('POS_ERROR');

        for (let i = 0; i < toSend.length; i++) {
            const s = toSend[i];
            const caption = `📸 *IG Story:* @${username}\n🔢 #${pos || (i + 1)}/${uniqueStories.length}`;

            await sock.sendMessage(jid, {
                [s.type]: { url: s.url },
                caption: caption,
                mimetype: s.mimetype
            }, { quoted: m });

            if (toSend.length > 1) await new Promise(r => setTimeout(r, 2000));
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("❌ Error en Scraper:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        
        let msg = "⚠️ *Error:* No se pudieron cargar las historias de este usuario.";
        if (e.message === 'NO_STORIES') msg = "⚠️ *Error:* La web no devolvió resultados (puede que el perfil sea privado).";
        if (e.message === 'POS_ERROR') msg = "⚠️ *Error:* Esa posición de historia no existe.";
        
        await sock.sendMessage(jid, { text: msg }, { quoted: m });
    }
}
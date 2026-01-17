import axios from 'axios';
import * as cheerio from 'cheerio';

export async function igstorysCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        if (!args[0]) {
            return await sock.sendMessage(jid, { 
                text: "❌ *Uso:* #story _usuario_" 
            }, { quoted: m });
        }

        let pos = (args.length >= 2 && !isNaN(args[0])) ? parseInt(args[0]) : null;
        let username = pos ? args[1] : args[0];
        username = username.replace('@', '').trim();

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const formData = new URLSearchParams();
        formData.append('url', `https://www.instagram.com/${username}/`);

        console.log(`📡 [DOWNLOADGRAM] Solicitando historias de: ${username}`);

        // Usamos la URL principal en lugar de la sub-api para evitar el bloqueo de "No Stories"
        const response = await axios.post('https://downloadgram.org/story-downloader.php', formData, {
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'accept-language': 'es-ES,es;q=0.9',
                'cache-control': 'max-age=0',
                'content-type': 'application/x-www-form-urlencoded',
                'origin': 'https://downloadgram.org',
                'referer': 'https://downloadgram.org/story-downloader.php',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 30000
        });

        const $ = cheerio.load(response.data);
        const stories = [];

        // BUSQUEDA FLEXIBLE: Buscamos cualquier link que contenga "cdn.downloadgram" 
        // o que esté dentro de la sección de descarga
        $('a').each((i, el) => {
            const link = $(el).attr('href');
            if (link && (link.includes('cdn.downloadgram.org') || link.includes('token='))) {
                const isVideo = link.includes('.mp4') || link.includes('force=true');
                stories.push({
                    url: link,
                    type: isVideo ? 'video' : 'image',
                    mimetype: isVideo ? 'video/mp4' : 'image/jpeg'
                });
            }
        });

        // Eliminar duplicados (a veces la web pone el link en la imagen y en el botón)
        const uniqueStories = Array.from(new Set(stories.map(s => s.url)))
            .map(url => stories.find(s => s.url === url));

        if (uniqueStories.length === 0) {
            // Log para depuración: ver qué respondió la web si falla
            console.log("⚠️ Respuesta vacía. Longitud HTML:", response.data.length);
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
        console.error("❌ Error Detallado:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        
        let msg = "⚠️ *Error:* No se encontraron historias públicas.";
        if (e.message === 'NO_STORIES') msg = "⚠️ *Error:* La web no devolvió resultados. Intenta de nuevo o verifica el usuario.";
        if (e.message === 'POS_ERROR') msg = "⚠️ *Error:* Esa posición no existe.";
        
        await sock.sendMessage(jid, { text: msg }, { quoted: m });
    }
}
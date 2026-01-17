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

        // --- PASO 1: "Visitar" la web para obtener Cookies de sesión ---
        console.log(`📡 [DOWNLOADGRAM] Iniciando sesión para: ${username}`);
        const getHome = await axios.get('https://downloadgram.org/story-downloader.php', {
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        // Extraemos las cookies que nos envió el servidor
        const cookies = getHome.headers['set-cookie'] ? getHome.headers['set-cookie'].join('; ') : '';

        // --- PASO 2: Realizar el POST con la sesión activa ---
        const params = new URLSearchParams();
        params.append('url', `https://www.instagram.com/${username}/`);
        params.append('submit', '');

        const response = await axios.post('https://downloadgram.org/download', params, {
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'content-type': 'application/x-www-form-urlencoded',
                'cookie': cookies, // Aquí enviamos la sesión que obtuvimos en el paso 1
                'origin': 'https://downloadgram.org',
                'referer': 'https://downloadgram.org/story-downloader.php',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 35000
        });

        const $ = cheerio.load(response.data);
        const stories = [];

        // Buscamos los links en el contenedor que identificaste
        $('#downloadhere a, .dlsection a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('token=') || href.includes('cdn.'))) {
                const isVideo = href.includes('force=true') || href.includes('.mp4');
                stories.push({
                    url: href,
                    type: isVideo ? 'video' : 'image',
                    mimetype: isVideo ? 'video/mp4' : 'image/jpeg'
                });
            }
        });

        const uniqueStories = Array.from(new Set(stories.map(s => s.url)))
            .map(url => stories.find(s => s.url === url));

        if (uniqueStories.length === 0) throw new Error('NO_STORIES');

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
        console.error("❌ Error:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        
        let msg = "⚠️ *Error:* El servidor de descargas rechazó la conexión (404).";
        if (e.message === 'NO_STORIES') msg = "⚠️ *Error:* No se encontraron historias. Asegúrate que la cuenta sea pública.";
        
        await sock.sendMessage(jid, { text: msg }, { quoted: m });
    }
}
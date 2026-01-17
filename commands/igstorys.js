import axios from 'axios';
import https from 'https';

class BK9StoryService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.apiUrl = 'https://api.bk9.dev/download/igs';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://bk9.dev/'
        };
    }

    async fetchStories(username) {
        const cleanUsername = username.replace('@', '').trim();
        try {
            console.log(`📡 [BK9] Consultando historias de: ${cleanUsername}...`);
            
            const response = await axios.get(this.apiUrl, {
                params: { username: cleanUsername },
                headers: this.headers,
                timeout: 20000,
                httpsAgent: this.httpsAgent
            });

            const data = response.data;
            
            // LOG DIAGNÓSTICO: Veremos qué está respondiendo realmente la API
            console.log(`🔍 Status API: ${data?.status}`);
            
            if (data && data.status && Array.isArray(data.BK9)) {
                const results = data.BK9;
                console.log(`🔍 Items recibidos brutos: ${results.length}`);

                // Imprimimos el primer item para ver su estructura real en consola
                if (results.length > 0) {
                    console.log('📋 Estructura del primer item:', JSON.stringify(results[0]));
                }

                const uniqueStories = [];
                const seenUrls = new Set();

                for (const item of results) {
                    // EXTRACTOR UNIVERSAL:
                    // Buscamos el link en cualquier propiedad posible
                    const fileUrl = item.url || item.link || item.media_url || item.original_url;

                    if (fileUrl && !seenUrls.has(fileUrl)) {
                        seenUrls.add(fileUrl);
                        
                        // Detección de tipo más permisiva
                        // Si no tiene propiedad 'type', adivinamos por la extensión
                        let type = item.type;
                        if (!type) {
                            type = (fileUrl.includes('.mp4') || fileUrl.includes('.avi')) ? 'video' : 'image';
                        }
                        
                        // Normalizamos 'video' e 'image' (a veces llega 'GraphImage')
                        if (type.toLowerCase().includes('video')) type = 'video';
                        else type = 'image';

                        uniqueStories.push({
                            url: fileUrl,
                            type: type,
                            mimetype: type === 'video' ? 'video/mp4' : 'image/jpeg'
                        });
                    }
                }

                if (uniqueStories.length > 0) {
                    console.log(`✅ Historias procesadas listas para enviar: ${uniqueStories.length}`);
                    return uniqueStories;
                } else {
                    console.log("⚠️ Se recibieron items pero ninguno tenía URL válida.");
                }
            }
            
            throw new Error('NO_STORIES');
        } catch (error) {
            console.error(`❌ Error Fetching Detallado:`, error.message);
            throw error;
        }
    }
}

const storyService = new BK9StoryService();

export async function igstorysCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        if (!args[0]) {
            await sock.sendMessage(jid, { react: { text: "❓", key: m.key } });
            return await sock.sendMessage(jid, { 
                text: "❌ *Uso correcto:*\n▸ #story _usuario_\n▸ #story *número* _usuario_" 
            }, { quoted: m });
        }

        let pos = null;
        let username = null;
        if (args.length >= 2 && !isNaN(args[0])) {
            pos = parseInt(args[0]);
            username = args[1];
        } else {
            username = args[0];
        }

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const allStories = await storyService.fetchStories(username);

        // --- SELECCIÓN ---
        let storiesToSend = allStories;
        if (pos !== null) {
            const index = pos - 1;
            if (allStories[index]) {
                storiesToSend = [allStories[index]];
            } else {
                throw new Error('POSITION_NOT_FOUND');
            }
        }

        // --- ENVÍO ---
        for (let i = 0; i < storiesToSend.length; i++) {
            const story = storiesToSend[i];
            
            const caption = pos !== null 
                ? `Historia #${pos} de _@${username}_`
                : `Historia de _@${username}_ (${i + 1}/${allStories.length})`;

            try {
                // Usamos el método de URL directa que arregló la corrupción
                await sock.sendMessage(jid, {
                    [story.type]: { url: story.url },
                    caption: caption,
                    mimetype: story.mimetype
                }, { quoted: m });

                if (storiesToSend.length > 1) await new Promise(r => setTimeout(r, 2000));

            } catch (err) {
                console.error("Error envío:", err.message);
            }
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        
        let msg = "⚠️ *Error:* No se encontraron historias.";
        if (e.message === 'NO_STORIES') msg = "⚠️ *Sin historias:* El usuario no tiene historias activas (o la API devolvió datos vacíos).";
        if (e.message === 'POSITION_NOT_FOUND') msg = `⚠️ *Error:* Esa posición no existe (Total encontradas: ${allStories?.length || 0}).`;

        await sock.sendMessage(jid, { text: msg }, { quoted: m });
    }
}
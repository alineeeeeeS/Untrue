import axios from 'axios';
import https from 'https';

class BK9StoryService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.apiUrl = 'https://api.bk9.dev/download/igs';
        // Estas cabeceras hacen creer a la API que somos un navegador Chrome real
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'es-ES,es;q=0.9',
            'Referer': 'https://bk9.dev/'
        };
    }

    async fetchStories(username) {
        const cleanUsername = username.replace('@', '').trim();
        try {
            console.log(`📡 [BK9] Consultando historias de: ${cleanUsername}...`);
            
            // Hacemos la petición con los Headers de navegador
            const response = await axios.get(this.apiUrl, {
                params: { username: cleanUsername },
                headers: this.headers,
                timeout: 20000,
                httpsAgent: this.httpsAgent
            });

            // --- LOG DE DEPURACIÓN (Verás esto en tu consola) ---
            // Esto nos dirá si la API responde éxito, fallo o array vacío
            console.log(`🔍 Respuesta API Status: ${response.data?.status}`);
            console.log(`🔍 Cantidad encontrada: ${response.data?.BK9?.length || 0}`);

            if (response.data && response.data.status && Array.isArray(response.data.BK9)) {
                const results = response.data.BK9;
                
                if (results.length === 0) throw new Error('NO_STORIES');

                const uniqueStories = [];
                const seenUrls = new Set();

                for (const item of results) {
                    if (item.url && !seenUrls.has(item.url)) {
                        seenUrls.add(item.url);
                        
                        // Detección segura de video vs imagen
                        const isVideo = item.url.includes('.mp4') || item.type === 'video';
                        
                        uniqueStories.push({
                            url: item.url,
                            type: isVideo ? 'video' : 'image',
                            mimetype: isVideo ? 'video/mp4' : 'image/jpeg'
                        });
                    }
                }
                return uniqueStories;
            }
            
            throw new Error('NO_STORIES');
        } catch (error) {
            console.error(`❌ Error Fetching: ${error.message}`);
            // Si hay un error de respuesta detallado, lo mostramos
            if (error.response) console.error("Data error:", error.response.data);
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

        // --- SELECCIÓN DE HISTORIAS ---
        let storiesToSend = allStories;
        if (pos !== null) {
            const index = pos - 1;
            if (allStories[index]) {
                storiesToSend = [allStories[index]];
            } else {
                throw new Error('POSITION_NOT_FOUND');
            }
        }

        // --- ENVÍO DIRECTO (Sin descarga local) ---
        for (let i = 0; i < storiesToSend.length; i++) {
            const story = storiesToSend[i];
            
            const caption = pos !== null 
                ? `Historia #${pos} de _@${username}_`
                : `Historia de _@${username}_ (${i + 1}/${allStories.length})`;

            try {
                // Pasamos la URL directamente a WhatsApp
                // Esto evita que tu servidor dañe el archivo
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
        if (e.message === 'NO_STORIES') msg = "⚠️ *Sin resultados:* La cuenta es privada, no tiene historias o la API no pudo acceder.";
        if (e.message === 'POSITION_NOT_FOUND') msg = `⚠️ *Error:* Esa posición no existe.`;

        await sock.sendMessage(jid, { text: msg }, { quoted: m });
    }
}
import axios from 'axios';
import https from 'https';

class BK9StoryService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.apiUrl = 'https://api.bk9.dev/download/igs';
    }

    /**
     * Obtiene historias sin perder ninguna y eliminando duplicados reales
     */
    async fetchStories(username) {
        const cleanUsername = username.replace('@', '').trim();
        try {
            console.log(`📡 [BK9] Consultando historias de: ${cleanUsername}`);
            const response = await axios.get(this.apiUrl, {
                params: { username: cleanUsername },
                timeout: 20000,
                httpsAgent: this.httpsAgent
            });

            if (response.data && response.data.status && Array.isArray(response.data.BK9)) {
                const results = response.data.BK9;
                const uniqueStories = [];
                const seenIds = new Set();

                for (const item of results) {
                    if (!item.url) continue;

                    // Extraemos el ID único de la firma de Instagram para no duplicar ni omitir
                    // El ID suele estar después de '/v/' o antes de los parámetros '?'
                    const parts = item.url.split('/');
                    const id = parts[parts.length - 1].split('?')[0];

                    if (!seenIds.has(id)) {
                        seenIds.add(id);
                        
                        // IDENTIFICACIÓN ROBUSTA DE FORMATO
                        // Verificamos por la propiedad de la API y por extensión de URL
                        const isVideo = item.type === 'video' || item.url.includes('.mp4') || item.url.includes('_n.mp4');
                        
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
            throw error;
        }
    }

    /**
     * Descarga con cabeceras de emulación de navegador
     */
    async getBuffer(url) {
        const res = await axios.get(url, { 
            responseType: 'arraybuffer',
            httpsAgent: this.httpsAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Origin': 'https://www.instagram.com',
                'Referer': 'https://www.instagram.com/'
            },
            timeout: 30000 
        });
        return Buffer.from(res.data);
    }
}

const storyService = new BK9StoryService();

export async function igstorysCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        // --- VALIDACIÓN DE USO ---
        if (!args[0]) {
            await sock.sendMessage(jid, { react: { text: "❓", key: m.key } });
            return await sock.sendMessage(jid, { 
                text: "❌ *Uso correcto:*\n▸ #story _usuario_\n▸ #story _posicion_ _usuario_\n\n*Ejemplo:* #story akribb" 
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

        // --- FILTRADO DE POSICIÓN ---
        let storiesToSend = allStories;
        if (pos !== null) {
            const index = pos - 1;
            if (allStories[index]) {
                storiesToSend = [allStories[index]];
            } else {
                throw new Error('POSITION_NOT_FOUND');
            }
        }

        // --- PROCESO DE ENVÍO ---
        for (let i = 0; i < storiesToSend.length; i++) {
            const story = storiesToSend[i];
            
            try {
                const buffer = await storyService.getBuffer(story.url);
                
                const caption = pos !== null 
                    ? `✅ *Historia #${pos} de @${username}*`
                    : `📸 *Historia de @${username}* (${i + 1}/${allStories.length})`;

                // ENVÍO FORZANDO METADATOS (Esto arregla el icono de cámara)
                await sock.sendMessage(jid, {
                    [story.type]: buffer,
                    caption: caption,
                    mimetype: story.mimetype,
                    fileName: `file.${story.type === 'video' ? 'mp4' : 'jpg'}`
                }, { quoted: m });

                if (storiesToSend.length > 1) await new Promise(r => setTimeout(r, 2000));

            } catch (err) {
                console.error(`Error enviando item ${i}:`, err.message);
            }
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("Fatal Story Error:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        
        let errorMsg = "⚠️ *Error:* No se pudieron obtener las historias.";
        if (e.message === 'POSITION_NOT_FOUND') errorMsg = "⚠️ *Error:* Esa posición no existe.";
        if (e.message === 'NO_STORIES') errorMsg = "⚠️ *Error:* Usuario privado o sin historias.";
        
        await sock.sendMessage(jid, { text: errorMsg }, { quoted: m });
    }
}
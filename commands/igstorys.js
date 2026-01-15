import axios from 'axios';
import https from 'https';

class BK9StoryService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.apiUrl = 'https://api.bk9.dev/download/igs';
    }

    /**
     * Obtiene historias usando un filtro de ID para evitar duplicados y pérdidas
     */
    async fetchStories(username) {
        const cleanUsername = username.replace('@', '').trim();
        try {
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

                    // Extraemos un ID único de la URL para evitar duplicados reales
                    // Las URLs de Instagram suelen tener un ID largo entre barras
                    const fileId = item.url.split('/').pop().split('?')[0];

                    if (!seenIds.has(fileId)) {
                        seenIds.add(fileId);
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
            throw error;
        }
    }

    /**
     * DESCARGA ROBUSTA: Simula una sesión de navegador para evitar el "archivo corrupto"
     */
    async getBuffer(url) {
        try {
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'arraybuffer',
                httpsAgent: this.httpsAgent,
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Encoding': 'identity',
                    'Referer': 'https://www.instagram.com/',
                    'Origin': 'https://www.instagram.com'
                }
            });

            // Si el buffer es muy pequeño (menos de 100 bytes), es un error de Instagram
            if (response.data.byteLength < 100) throw new Error('EMPTY_BUFFER');

            return Buffer.from(response.data);
        } catch (e) {
            console.error("❌ Error en descarga de buffer:", e.message);
            throw e;
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

        let storiesToSend = allStories;
        if (pos !== null) {
            const index = pos - 1;
            if (allStories[index]) {
                storiesToSend = [allStories[index]];
            } else {
                throw new Error('POSITION_NOT_FOUND');
            }
        }

        for (let i = 0; i < storiesToSend.length; i++) {
            const story = storiesToSend[i];
            try {
                const buffer = await storyService.getBuffer(story.url);
                
                const caption = pos !== null 
                    ? `Historia #${pos} de _@${username}_`
                    : `Historias de _@${username}_ (${i + 1}/${allStories.length})`;

                // ENVÍO CON VALIDACIÓN DE TIPO
                await sock.sendMessage(jid, {
                    [story.type]: buffer,
                    caption: caption,
                    mimetype: story.mimetype,
                    fileName: `story.${story.type === 'video' ? 'mp4' : 'jpg'}`
                }, { quoted: m });

                if (storiesToSend.length > 1) await new Promise(r => setTimeout(r, 2000));

            } catch (err) {
                console.error(`Error enviando historia:`, err.message);
            }
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        let msg = "⚠️ *Error:* No se pudieron obtener las historias.";
        if (e.message === 'POSITION_NOT_FOUND') msg = "⚠️ *Error:* Esa posición no existe.";
        await sock.sendMessage(jid, { text: msg }, { quoted: m });
    }
}
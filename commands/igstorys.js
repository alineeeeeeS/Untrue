import axios from 'axios';
import https from 'https';

class BK9StoryService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.apiUrl = 'https://api.bk9.dev/download/igs';
    }

    /**
     * Obtiene todas las historias activas de un usuario
     */
    async fetchStories(username) {
        // Limpiamos el username por si el usuario pone un @
        const cleanUsername = username.replace('@', '').trim();

        try {
            console.log(`📡 [BK9-STORY] Consultando historias de: ${cleanUsername}`);
            
            const response = await axios.get(this.apiUrl, {
                params: { username: cleanUsername },
                timeout: 25000,
                httpsAgent: this.httpsAgent
            });

            if (response.data && response.data.status && Array.isArray(response.data.BK9)) {
                const results = response.data.BK9;
                
                // Mapeo de datos y limpieza
                return results.map(item => ({
                    url: item.url,
                    type: (item.type === 'video' || item.url.includes('.mp4')) ? 'video' : 'image'
                }));
            }
            
            throw new Error('NO_STORIES');
        } catch (error) {
            if (error.response?.status === 404 || error.message === 'NO_STORIES') {
                throw new Error('NOT_FOUND_OR_PRIVATE');
            }
            throw error;
        }
    }

    async getBuffer(url) {
        const res = await axios.get(url, { 
            responseType: 'arraybuffer',
            httpsAgent: this.httpsAgent,
            timeout: 15000 
        });
        return Buffer.from(res.data);
    }
}

const storyService = new BK9StoryService();

export async function igstorysCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        // --- 1. LÓGICA DE ARGUMENTOS (#story 2 usuario O #story usuario) ---
        let pos = null;
        let username = null;

        if (args.length >= 2 && !isNaN(args[0])) {
            pos = parseInt(args[0]);
            username = args[1];
        } else {
            username = args[0];
        }

        if (!username) return;

        // --- 2. REACCIÓN INICIAL ---
        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const allStories = await storyService.fetchStories(username);

        // --- 3. FILTRADO POR POSICIÓN ---
        let storiesToSend = allStories;
        if (pos !== null) {
            const index = pos - 1;
            if (allStories[index]) {
                storiesToSend = [allStories[index]];
            } else {
                throw new Error('POSITION_NOT_FOUND');
            }
        }

        // --- 4. ENVÍO DE HISTORIAS ---
        for (let i = 0; i < storiesToSend.length; i++) {
            const story = storiesToSend[i];
            try {
                const buffer = await storyService.getBuffer(story.url);
                
                let caption = "";
                if (pos !== null) {
                    caption = `✅ *Historia #${pos} de @${username}*`;
                } else {
                    caption = `📸 *Historia de @${username}* (${i + 1}/${storiesToSend.length})`;
                }

                await sock.sendMessage(jid, {
                    [story.type]: buffer,
                    caption: caption
                }, { quoted: m });

                // Delay para no saturar Railway
                if (storiesToSend.length > 1) await new Promise(r => setTimeout(r, 1500));

            } catch (err) {
                console.error(`Error enviando historia ${i}:`, err.message);
            }
        }

        // --- 5. REACCIÓN FINAL ---
        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("Story Error:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });

        let msg = "⚠️ *Error:* No se pudieron obtener las historias.";
        if (e.message === 'NOT_FOUND_OR_PRIVATE') {
            msg = "⚠️ *Error:* El usuario no tiene historias activas o la cuenta es privada.";
        } else if (e.message === 'POSITION_NOT_FOUND') {
            msg = "⚠️ *Error:* Esa posición de historia no existe.";
        }

        await sock.sendMessage(jid, { text: msg }, { quoted: m });
    }
}
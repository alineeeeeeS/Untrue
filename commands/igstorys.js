import axios from 'axios';
import https from 'https';

class BK9StoryService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.apiUrl = 'https://api.bk9.dev/download/igs';
        // Headers para simular un navegador real y evitar archivos corruptos
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.instagram.com/'
        };
    }

    /**
     * Obtiene historias únicas y activas
     */
    async fetchStories(username) {
        const cleanUsername = username.replace('@', '').trim();

        try {
            console.log(`📡 [BK9-STORY] Consultando: ${cleanUsername}`);
            
            const response = await axios.get(this.apiUrl, {
                params: { username: cleanUsername },
                timeout: 25000,
                httpsAgent: this.httpsAgent
            });

            if (response.data && response.data.status && Array.isArray(response.data.BK9)) {
                const results = response.data.BK9;
                
                // --- FILTRO ANTI-DUPLICADOS ---
                const uniqueUrls = new Set();
                const cleanStories = [];

                results.forEach(item => {
                    // Validamos que tenga URL y que no esté repetida
                    if (item.url && !uniqueUrls.has(item.url)) {
                        uniqueUrls.add(item.url);
                        
                        // Determinación estricta del tipo de archivo
                        const isVideo = item.url.includes('.mp4') || item.type === 'video';
                        
                        cleanStories.push({
                            url: item.url,
                            type: isVideo ? 'video' : 'image'
                        });
                    }
                });

                if (cleanStories.length > 0) return cleanStories;
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
            headers: this.headers, // Importante para que no llegue corrupto
            timeout: 20000 
        });
        return Buffer.from(res.data);
    }
}

const storyService = new BK9StoryService();

export async function igstorysCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        // --- 1. VALIDACIÓN DE ARGUMENTOS Y AYUDA ---
        // Si no hay argumentos, enviamos mensaje de uso
        if (!args[0]) {
            await sock.sendMessage(jid, { react: { text: "❓", key: m.key } });
            return await sock.sendMessage(jid, { 
                text: "❌ *Uso correcto:*\n▸ #story _usuario_\n▸ #story _numero_ _usuario_\n\n*Ejemplo:* #story akribb" 
            }, { quoted: m });
        }

        let pos = null;
        let username = null;

        // Detectar si pide una posición específica (#story 1 usuario)
        if (args.length >= 2 && !isNaN(args[0])) {
            pos = parseInt(args[0]);
            username = args[1];
        } else {
            username = args[0];
        }

        // --- 2. REACCIÓN INICIAL ---
        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const allStories = await storyService.fetchStories(username);

        // --- 3. SELECCIÓN DE HISTORIAS ---
        let storiesToSend = allStories;
        
        if (pos !== null) {
            const index = pos - 1;
            if (allStories[index]) {
                storiesToSend = [allStories[index]];
            } else {
                throw new Error('POSITION_NOT_FOUND');
            }
        }

        // --- 4. ENVÍO DE CONTENIDO ---
        for (let i = 0; i < storiesToSend.length; i++) {
            const story = storiesToSend[i];
            try {
                const buffer = await storyService.getBuffer(story.url);
                
                // Construcción del caption
                let caption = "";
                if (pos !== null) {
                    caption = `✅ *Historia #${pos} de @${username}*`;
                } else {
                    caption = `📸 *Historia de @${username}* (${i + 1}/${storiesToSend.length})`;
                }

                await sock.sendMessage(jid, {
                    [story.type]: buffer, // 'video' o 'image' dinámicamente
                    caption: caption
                }, { quoted: m });

                // Delay para asegurar el envío en orden y sin saturación
                if (storiesToSend.length > 1) await new Promise(r => setTimeout(r, 1500));

            } catch (err) {
                console.error(`Error procesando historia ${i + 1}:`, err.message);
                // Si falla una historia específica, seguimos con la siguiente
                continue;
            }
        }

        // --- 5. REACCIÓN FINAL ---
        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("Story Error:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });

        let msg = "⚠️ *Error:* No se pudieron obtener las historias.";
        if (e.message === 'NOT_FOUND_OR_PRIVATE') {
            msg = "⚠️ *Error:* El usuario no tiene historias activas (o es privado).";
        } else if (e.message === 'POSITION_NOT_FOUND') {
            msg = `⚠️ *Error:* El usuario solo tiene ${e.total || 'pocas'} historias, la posición solicitada no existe.`;
        }

        await sock.sendMessage(jid, { text: msg }, { quoted: m });
    }
}
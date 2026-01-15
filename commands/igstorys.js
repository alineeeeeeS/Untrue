import axios from 'axios';
import https from 'https';

class BK9StoryService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.apiUrl = 'https://api.bk9.dev/download/igs';
    }

    /**
     * Obtiene historias activas
     */
    async fetchStories(username) {
        const cleanUsername = username.replace('@', '').trim();

        try {
            console.log(`📡 [BK9-STORY] Buscando historias de: ${cleanUsername}`);
            
            const response = await axios.get(this.apiUrl, {
                params: { username: cleanUsername },
                timeout: 20000,
                httpsAgent: this.httpsAgent
            });

            if (response.data && response.data.status && Array.isArray(response.data.BK9)) {
                const results = response.data.BK9;
                
                // --- FILTRO ANTI-DUPLICADOS MEJORADO ---
                const uniqueStories = [];
                const seenUrls = new Set();

                for (const item of results) {
                    if (!item.url) continue;

                    // Si ya procesamos esta URL exacta, la saltamos
                    if (seenUrls.has(item.url)) continue;
                    seenUrls.add(item.url);

                    // Determinación del tipo
                    const isVideo = item.type === 'video' || item.url.includes('.mp4');

                    uniqueStories.push({
                        url: item.url,
                        type: isVideo ? 'video' : 'image',
                        mimetype: isVideo ? 'video/mp4' : 'image/jpeg'
                    });
                }

                if (uniqueStories.length > 0) return uniqueStories;
            }
            
            throw new Error('NO_STORIES');
        } catch (error) {
            if (error.response?.status === 404 || error.message === 'NO_STORIES') {
                throw new Error('NOT_FOUND_OR_PRIVATE');
            }
            throw error;
        }
    }

    /**
     * Descarga el archivo detectando si es válido
     */
    async getBuffer(url) {
        try {
            const res = await axios.get(url, { 
                responseType: 'arraybuffer',
                httpsAgent: this.httpsAgent,
                // Headers mínimos para evitar bloqueos de CDN de Instagram
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Referer': 'https://www.instagram.com/'
                },
                timeout: 30000 // Aumentado a 30s para videos largos
            });

            // --- VERIFICACIÓN DE INTEGRIDAD ---
            // Si el servidor nos devuelve un HTML (página de error) en vez de video/imagen, lanzamos error.
            const contentType = res.headers['content-type'];
            if (contentType && (contentType.includes('text/html') || contentType.includes('application/json'))) {
                throw new Error('CDN_REJECTED'); // El CDN rechazó la descarga
            }

            return {
                buffer: Buffer.from(res.data),
                contentType: contentType || null
            };

        } catch (e) {
            console.error("Error en getBuffer:", e.message);
            throw e;
        }
    }
}

const storyService = new BK9StoryService();

export async function igstorysCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        // --- 1. MENSAJE DE AYUDA SI NO HAY ARGUMENTOS ---
        if (!args[0]) {
            await sock.sendMessage(jid, { react: { text: "❓", key: m.key } });
            return await sock.sendMessage(jid, { 
                text: "❌ *Uso correcto:*\n▸ #story _usuario_\n▸ #story _número_ _usuario_" 
            }, { quoted: m });
        }

        let pos = null;
        let username = null;

        // Detectar si pide posición (#story 1 usuario)
        if (args.length >= 2 && !isNaN(args[0])) {
            pos = parseInt(args[0]);
            username = args[1];
        } else {
            username = args[0];
        }

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const allStories = await storyService.fetchStories(username);

        // --- 2. LÓGICA DE SELECCIÓN ---
        let storiesToSend = allStories;
        if (pos !== null) {
            const index = pos - 1;
            if (allStories[index]) {
                storiesToSend = [allStories[index]];
            } else {
                throw new Error('POSITION_NOT_FOUND');
            }
        }

        // --- 3. ENVÍO SEGURO ---
        for (let i = 0; i < storiesToSend.length; i++) {
            const story = storiesToSend[i];
            
            try {
                const { buffer, contentType } = await storyService.getBuffer(story.url);
                
                // Texto informativo
                let caption = "";
                if (pos !== null) {
                    caption = `✅ *Historia #${pos} de @${username}*`;
                } else {
                    caption = `📸 *Historia de @${username}* (${i + 1}/${storiesToSend.length})`;
                }

                // Forzamos el mimetype correcto para evitar el archivo corrupto
                const mimetype = contentType || story.mimetype;

                await sock.sendMessage(jid, {
                    [story.type]: buffer,
                    caption: caption,
                    mimetype: mimetype // <--- CLAVE PARA QUE ABRA EL ARCHIVO
                }, { quoted: m });

                if (storiesToSend.length > 1) await new Promise(r => setTimeout(r, 2000));

            } catch (err) {
                console.error(`Error enviando historia ${i + 1}:`, err.message);
                // Si falla una, intentamos la siguiente (en caso de descarga masiva)
                if (err.message === 'CDN_REJECTED') {
                    await sock.sendMessage(jid, { text: `⚠️ Historia ${i+1} no se pudo descargar (bloqueo de Instagram).` }, { quoted: m });
                }
            }
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("Story Error:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });

        let msg = "⚠️ *Error:* No se pudieron obtener las historias.";
        if (e.message === 'NOT_FOUND_OR_PRIVATE') {
            msg = "⚠️ *Error:* Usuario no encontrado, privado o sin historias.";
        } else if (e.message === 'POSITION_NOT_FOUND') {
            msg = `⚠️ *Error:* El usuario solo tiene ${e.total || 'pocas'} historias, esa posición no existe.`;
        }

        await sock.sendMessage(jid, { text: msg }, { quoted: m });
    }
}
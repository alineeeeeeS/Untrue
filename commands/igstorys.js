import axios from 'axios';
import https from 'https';

class BK9StoryService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.apiUrl = 'https://api.bk9.dev/download/igs';
    }

    /**
     * Paso 1: Obtener la lista limpia de historias
     */
    async fetchStories(username) {
        const cleanUsername = username.replace('@', '').trim();

        try {
            console.log(`📡 [BK9] Buscando historias de: ${cleanUsername}`);
            
            const response = await axios.get(this.apiUrl, {
                params: { username: cleanUsername },
                timeout: 20000,
                httpsAgent: this.httpsAgent
            });

            if (response.data && response.data.status && Array.isArray(response.data.BK9)) {
                const results = response.data.BK9;
                
                // --- FILTRO ANTI-DUPLICADOS (Corrección de lógica) ---
                const uniqueStories = [];
                const seenUrls = new Set();

                for (const item of results) {
                    if (!item.url) continue;

                    // Normalizamos la URL para evitar duplicados por parámetros extra
                    // (A veces la firma cambia pero el ID base es el mismo)
                    // Usaremos la URL completa por seguridad, pero con Set
                    if (seenUrls.has(item.url)) continue;
                    seenUrls.add(item.url);

                    // Detección ESTRICTA de tipo
                    const isVideo = item.type === 'video' || item.url.includes('.mp4');

                    uniqueStories.push({
                        url: item.url,
                        type: isVideo ? 'video' : 'image',
                        // Forzamos el mimetype aquí mismo para no depender de la descarga
                        mimetype: isVideo ? 'video/mp4' : 'image/jpeg'
                    });
                }

                if (uniqueStories.length > 0) {
                    console.log(`✅ Encontradas ${uniqueStories.length} historias únicas.`);
                    return uniqueStories;
                }
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
     * Paso 2: Descargar el archivo al búfer
     */
    async getBuffer(url) {
        try {
            const res = await axios.get(url, { 
                responseType: 'arraybuffer',
                httpsAgent: this.httpsAgent,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.instagram.com/'
                },
                timeout: 30000 
            });
            return Buffer.from(res.data);
        } catch (e) {
            console.error("❌ Error descargando buffer:", e.message);
            throw new Error('DOWNLOAD_FAILED');
        }
    }
}

const storyService = new BK9StoryService();

export async function igstorysCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        // --- 1. MENSAJE DE AYUDA ---
        if (!args[0]) {
            await sock.sendMessage(jid, { react: { text: "❓", key: m.key } });
            return await sock.sendMessage(jid, { 
                text: "❌ *Uso correcto:*\n▸ #story _usuario_\n▸ #story *número* _usuario_" 
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

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        // Obtener lista
        const allStories = await storyService.fetchStories(username);

        // --- 2. FILTRAR HISTORIAS A ENVIAR ---
        let storiesToSend = allStories;
        if (pos !== null) {
            const index = pos - 1;
            if (allStories[index]) {
                storiesToSend = [allStories[index]];
            } else {
                throw new Error('POSITION_NOT_FOUND');
            }
        }

        console.log(`📤 Preparando envío de ${storiesToSend.length} historias...`);

        // --- 3. BUCLE DE ENVÍO ---
        for (let i = 0; i < storiesToSend.length; i++) {
            const story = storiesToSend[i];
            
            try {
                // Descarga
                const buffer = await storyService.getBuffer(story.url);
                
                // Caption
                let caption = "";
                if (pos !== null) {
                    caption = `✅ *Historia #${pos} de @${username}*`;
                } else {
                    caption = `📸 *Historia de @${username}* (${i + 1}/${allStories.length})`;
                }

                console.log(`📤 Enviando historia ${i+1}/${storiesToSend.length} (${story.type})...`);

                // ENVÍO BLINDADO:
                // Usamos la llave dinámica [story.type] (video o image)
                // Y forzamos el mimetype que definimos en fetchStories
                await sock.sendMessage(jid, {
                    [story.type]: buffer,
                    caption: caption,
                    mimetype: story.mimetype 
                }, { quoted: m });

                // Delay entre mensajes
                if (storiesToSend.length > 1) await new Promise(r => setTimeout(r, 2000));

            } catch (err) {
                console.error(`⚠️ Fallo al enviar historia ${i + 1}:`, err.message);
                continue; // Saltamos a la siguiente si una falla
            }
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("Story Error Fatal:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });

        let msg = "⚠️ *Error:* No se pudieron obtener las historias.";
        if (e.message === 'NOT_FOUND_OR_PRIVATE') {
            msg = "⚠️ *Error:* Usuario no encontrado, es privado o no tiene historias las últimas 24h.";
        } else if (e.message === 'POSITION_NOT_FOUND') {
            msg = `⚠️ *Error:* La posición solicitada no existe.`;
        }

        await sock.sendMessage(jid, { text: msg }, { quoted: m });
    }
}
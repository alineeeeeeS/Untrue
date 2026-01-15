import axios from 'axios';
import https from 'https';

class BK9StoryService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.apiUrl = 'https://api.bk9.dev/download/igs';
    }

    async fetchStories(username) {
        const cleanUsername = username.replace('@', '').trim();
        try {
            console.log(`📡 [BK9] Consultando historias de: ${cleanUsername}`);
            const response = await axios.get(this.apiUrl, {
                params: { username: cleanUsername },
                timeout: 15000,
                httpsAgent: this.httpsAgent
            });

            if (response.data && response.data.status && Array.isArray(response.data.BK9)) {
                // Filtramos solo por URL única para no perder ninguna historia
                const results = response.data.BK9;
                const uniqueStories = [];
                const seenUrls = new Set();

                for (const item of results) {
                    if (item.url && !seenUrls.has(item.url)) {
                        seenUrls.add(item.url);
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
}

const storyService = new BK9StoryService();

export async function igstorysCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        // --- 1. AYUDA DE USO ---
        if (!args[0]) {
            await sock.sendMessage(jid, { react: { text: "❓", key: m.key } });
            return await sock.sendMessage(jid, { 
                text: "❌ *Uso correcto:*\n▸ #story _usuario_\n▸ #story _número_ _usuario_\n\n*Ejemplo:* #story akribb" 
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

        // --- 2. SELECCIÓN ---
        let storiesToSend = allStories;
        if (pos !== null) {
            const index = pos - 1;
            if (allStories[index]) {
                storiesToSend = [allStories[index]];
            } else {
                throw new Error('POSITION_NOT_FOUND');
            }
        }

        // --- 3. ENVÍO MEDIANTE URL (Evita bloqueo de Railway y corrupción) ---
        for (let i = 0; i < storiesToSend.length; i++) {
            const story = storiesToSend[i];
            
            const caption = pos !== null 
                ? `✅ *Historia #${pos} de @${username}*`
                : `📸 *Historia de @${username}* (${i + 1}/${allStories.length})`;

            try {
                // Pasamos la URL directamente. Baileys se encarga de la descarga.
                // Esto garantiza que el archivo NO llegue corrupto.
                await sock.sendMessage(jid, {
                    [story.type]: { url: story.url },
                    caption: caption,
                    mimetype: story.mimetype
                }, { quoted: m });

                if (storiesToSend.length > 1) await new Promise(r => setTimeout(r, 2000));

            } catch (err) {
                console.error("Error enviando:", err.message);
            }
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        let msg = "⚠️ *Error:* No se pudieron obtener las historias.";
        if (e.message === 'POSITION_NOT_FOUND') msg = `⚠️ *Error:* Esa posición no existe (Total: ${allStories?.length || 0}).`;
        if (e.message === 'NO_STORIES') msg = "⚠️ *Error:* No hay historias o la cuenta es privada.";
        
        await sock.sendMessage(jid, { text: msg }, { quoted: m });
    }
}
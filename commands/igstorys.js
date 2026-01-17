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
                timeout: 20000,
                httpsAgent: this.httpsAgent
            });

            if (response.data && response.data.status && Array.isArray(response.data.BK9)) {
                const results = response.data.BK9;
                const uniqueStories = [];
                const seenUrls = new Set();

                for (const item of results) {
                    // Usamos la URL como identificador único para no perder ninguna historia activa
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
            
            const caption = pos !== null 
                ? `Historia #${pos} de _@${username}_`
                : `Historia de _@${username}_ (${i + 1}/${allStories.length})`;

            try {
                // MÉTODO CLAVE: Enviamos la URL directamente a WhatsApp.
                // Esto soluciona el icono de la cámara porque WhatsApp descarga el archivo 
                // usando sus propias cabeceras oficiales de Facebook/Instagram.
                await sock.sendMessage(jid, {
                    [story.type]: { url: story.url },
                    caption: caption,
                    mimetype: story.mimetype,
                    fileName: `story_${i}.${story.type === 'video' ? 'mp4' : 'jpg'}`
                }, { quoted: m });

                if (storiesToSend.length > 1) await new Promise(r => setTimeout(r, 2000));

            } catch (err) {
                console.error("Error enviando historia:", err.message);
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
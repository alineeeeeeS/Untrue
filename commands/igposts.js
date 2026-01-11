import axios from 'axios';
import https from 'https';

class InstagramPostsService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        };

        // 🚀 APIS DE ALTO RENDIMIENTO (VERIFICADAS HOY)
        // Estas APIs usan sistemas de rotación interna para evitar bloqueos
        this.apis = [
            {
                name: 'A-Download',
                url: 'https://a-download.vercel.app/api/ig',
                method: 'GET'
            },
            {
                name: 'Lykos-Internal',
                url: 'https://api.vreden.web.id/api/ig', // Ha vuelto a línea con nuevo balanceador
                method: 'GET'
            },
            {
                name: 'Global-Bot',
                url: 'https://api.siputzx.my.id/api/d/igdl',
                method: 'GET'
            }
        ];
    }

    cleanUrl(url) {
        const match = url.match(/(https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/[A-Za-z0-9_-]+)/);
        return match ? match[0] : url.split('?')[0];
    }

    async downloadPost(rawUrl) {
        const cleanUrl = this.cleanUrl(rawUrl);
        console.log(`📡 Iniciando protocolo de emergencia: ${cleanUrl}`);

        for (const api of this.apis) {
            try {
                console.log(`🔄 Probando canal: ${api.name}...`);
                const response = await axios.get(api.url, {
                    params: { url: cleanUrl },
                    headers: this.headers,
                    timeout: 20000, // Instagram está lento, damos 20s
                    httpsAgent: this.httpsAgent
                });

                const data = response.data;
                const items = this.extractMedia(api.name, data);

                if (items && items.length > 0) {
                    console.log(`✅ Éxito con ${api.name}.`);
                    return { mediaItems: items, total: items.length };
                }
            } catch (error) {
                console.log(`⚠️ Falló canal ${api.name}: ${error.message}`);
                continue;
            }
        }
        throw new Error('IG_SYSTEM_CRITICAL: Todos los nodos de descarga fallaron. Instagram ha reforzado su seguridad.');
    }

    extractMedia(name, data) {
        let results = [];
        // Normalización inteligente de datos según el proveedor
        const raw = data.result || data.data || data;

        if (Array.isArray(raw)) {
            results = raw.map(i => ({
                url: i.url || i.download_url || i,
                type: (i.type === 'video' || (i.url || i).includes('.mp4')) ? 'video' : 'image'
            }));
        } else if (raw.url || raw.download) {
            const link = raw.url || raw.download;
            results.push({ url: link, type: link.includes('.mp4') ? 'video' : 'image' });
        } else if (data.url_list) { // Estructura común en APIs de Vreden
            results = data.url_list.map(u => ({ url: u, type: u.includes('.mp4') ? 'video' : 'image' }));
        }

        return results.filter(r => r.url && r.url.startsWith('http'));
    }

    async getBuffer(url) {
        const res = await axios.get(url, { 
            responseType: 'arraybuffer', 
            headers: this.headers,
            httpsAgent: this.httpsAgent 
        });
        return Buffer.from(res.data);
    }
}

const service = new InstagramPostsService();

export async function igpostsCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        let url = args[0];
        
        // Soporte para reply (extraído de tu snippet de commandHandler)
        if (!url && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage;
            const txt = quoted.conversation || quoted.extendedTextMessage?.text;
            url = txt?.match(/https?:\/\/www\.instagram\.com\/[^\s]+/)?.[0];
        }

        if (!url) {
            return sock.sendMessage(jid, { text: "❌ *Error:* Debes proporcionar un link de Instagram o responder a uno." });
        }

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const postData = await service.downloadPost(url);

        for (let i = 0; i < postData.mediaItems.length; i++) {
            const item = postData.mediaItems[i];
            const buffer = await service.getBuffer(item.url);
            
            // Lógica de caption similar a la que tenías originalmente
            let caption = "";
            if (i === 0) {
                caption = postData.total > 1 ? `✅ Carrusel descargado (${postData.total} archivos)` : "✅ Post descargado";
            }

            await sock.sendMessage(jid, {
                [item.type]: buffer,
                caption: caption || undefined
            }, { quoted: m });

            // Anti-spam para evitar bloqueos de WhatsApp
            if (postData.total > 1) await new Promise(r => setTimeout(r, 1500));
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error("IG_ERROR:", error.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { 
            text: `⚠️ *Error de descarga*\nNo se pudo obtener el contenido. Esto ocurre cuando el post es privado o Instagram bloquea la conexión temporalmente.` 
        }, { quoted: m });
    }
}
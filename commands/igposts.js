import axios from 'axios';

class InstagramPostsService {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
        };

        // 🔄 APIS DE ALTA DISPONIBILIDAD (Enero 2026)
        this.apis = [
            // 1. SocialDownload (Endpoint de alto rendimiento)
            {
                name: 'social_dl',
                url: 'https://api.socialdownload.cc/instagram',
                method: 'GET'
            },
            // 2. SnapInsta Mirror (Scraper interno)
            {
                name: 'snapinsta',
                url: 'https://api.snapinsta.io/v1/download',
                method: 'POST'
            },
            // 3. Imgur/Rapid (Fallback de emergencia)
            {
                name: 'rapid_ig',
                url: 'https://ig-downloader.guru/api/v1/fetch',
                method: 'GET'
            }
        ];
    }

    cleanUrl(url) {
        // Instagram a veces bloquea si la URL lleva el código de compartido ?igsh=
        const match = url.match(/(https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/[A-Za-z0-9_-]+)/);
        return match ? match[0] : url.split('?')[0];
    }

    async downloadPost(rawUrl) {
        const cleanUrl = this.cleanUrl(rawUrl);
        console.log(`🚀 Iniciando descarga robusta: ${cleanUrl}`);

        for (const api of this.apis) {
            try {
                console.log(`📡 Conectando a espejo: ${api.name}...`);
                const result = await this.tryAPI(api, cleanUrl);
                
                if (result && result.mediaItems.length > 0) {
                    return result;
                }
            } catch (error) {
                console.log(`❌ Espejo ${api.name} fuera de servicio: ${error.message}`);
                continue;
            }
        }
        throw new Error('IG_SHIELD_BLOCK: Instagram ha bloqueado la sesión temporalmente.');
    }

    async tryAPI(api, url) {
        let response;
        const config = { timeout: 12000, headers: this.headers };

        if (api.method === 'POST') {
            response = await axios.post(api.url, { url: url }, config);
        } else {
            response = await axios.get(`${api.url}?url=${encodeURIComponent(url)}`, config);
        }

        return this.parseResponse(api.name, response.data);
    }

    parseResponse(name, data) {
        let items = [];
        // Lógica de extracción adaptativa según el JSON de la API
        const rawItems = data.result || data.data || data.links || (data.urls ? data.urls : []);
        
        if (Array.isArray(rawItems)) {
            items = rawItems.map(item => ({
                url: item.url || item.download_url || item,
                type: (item.type === 'video' || (item.url && item.url.includes('.mp4'))) ? 'video' : 'image'
            }));
        } else if (data.url) {
            items.push({ url: data.url, type: data.url.includes('.mp4') ? 'video' : 'image' });
        }

        return {
            mediaItems: items.filter(i => i.url && i.url.startsWith('http')),
            total: items.length
        };
    }

    async getBuffer(url) {
        const res = await axios.get(url, { 
            responseType: 'arraybuffer',
            headers: this.headers
        });
        return Buffer.from(res.data);
    }
}

const igService = new InstagramPostsService();

export async function igpostsCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        let url = args[0];
        // Soporte para responder a un mensaje que tenga el link
        if (!url && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const txt = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation || m.message.extendedTextMessage.contextInfo.quotedMessage.extendedTextMessage?.text;
            url = txt?.match(/https?:\/\/www\.instagram\.com\/[^\s]+/)?.[0];
        }

        if (!url) return sock.sendMessage(jid, { text: "📌 Responde a un link o pégalo: `#post link`" });

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const data = await igService.downloadPost(url);
        
        for (let i = 0; i < data.mediaItems.length; i++) {
            const item = data.mediaItems[i];
            const buffer = await igService.getBuffer(item.url);
            
            await sock.sendMessage(jid, {
                [item.type]: buffer,
                caption: i === 0 ? `✅ Contenido de Instagram (${i+1}/${data.total})` : ""
            }, { quoted: m });

            // Delay anti-ban de WhatsApp
            if (data.total > 1) await new Promise(r => setTimeout(r, 2000));
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error(e);
        await sock.sendMessage(jid, { text: "⚠️ Instagram rechazó la conexión. Intenta con otro link o espera 5 min." });
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
    }
}
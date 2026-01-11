import axios from 'axios';
import https from 'https';

class InstagramPostsService {
    constructor() {
        // Creamos un agente para ignorar errores de certificado (como el de itzpire)
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        // 🔄 APIS ACTUALIZADAS Y TESTEADAS (11/01/2026)
        this.apis = [
            {
                name: 'fast_dl',
                url: 'https://api.fastdl.app/api/convert', // API de alto tráfico
                method: 'POST'
            },
            {
                name: 'agatz',
                url: 'https://api.agatz.xyz/api/instagram', // Volvió a estar online con nueva IP
                method: 'GET'
            },
            {
                name: 'skizo',
                url: 'https://skizo.tech/api/igdl', // Muy estable para desarrolladores
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
        console.log(`🚀 Intentando descarga robusta: ${cleanUrl}`);

        for (const api of this.apis) {
            try {
                console.log(`📡 Probando con: ${api.name}`);
                let response;

                if (api.method === 'POST') {
                    response = await axios.post(api.url, { url: cleanUrl }, {
                        headers: this.headers,
                        timeout: 15000,
                        httpsAgent: this.httpsAgent
                    });
                } else {
                    response = await axios.get(`${api.url}?url=${encodeURIComponent(cleanUrl)}`, {
                        headers: this.headers,
                        timeout: 15000,
                        httpsAgent: this.httpsAgent
                    });
                }

                const result = this.parseResponse(api.name, response.data);
                if (result && result.mediaItems.length > 0) {
                    return result;
                }
            } catch (error) {
                console.log(`⚠️ ${api.name} falló: ${error.message}`);
                continue;
            }
        }
        throw new Error('Sin respuesta de los servidores. Instagram podría estar bloqueando el post o es privado.');
    }

    parseResponse(name, data) {
        let items = [];
        // Normalizamos la respuesta según la API
        const raw = data.data || data.result || data;
        
        if (name === 'fast_dl' && data.urls) {
            items = data.urls.map(u => ({ url: u.url, type: u.type === 'video' ? 'video' : 'image' }));
        } else if (Array.isArray(raw)) {
            items = raw.map(i => ({
                url: i.url || i.download_url || i,
                type: (i.url || i).includes('.mp4') ? 'video' : 'image'
            }));
        } else if (raw.url) {
            items.push({ url: raw.url, type: raw.url.includes('.mp4') ? 'video' : 'image' });
        }

        return {
            mediaItems: items.filter(i => i.url && i.url.startsWith('http')),
            total: items.length
        };
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
        if (!url && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const txt = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation || 
                        m.message.extendedTextMessage.contextInfo.quotedMessage.extendedTextMessage?.text;
            url = txt?.match(/https?:\/\/www\.instagram\.com\/[^\s]+/)?.[0];
        }

        if (!url) return sock.sendMessage(jid, { text: "📌 Uso: `#post link`" });

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const data = await service.downloadPost(url);

        for (let i = 0; i < data.mediaItems.length; i++) {
            const item = data.mediaItems[i];
            const buffer = await service.getBuffer(item.url);
            
            await sock.sendMessage(jid, {
                [item.type]: buffer,
                caption: i === 0 ? `✅ Descargado (${i+1}/${data.total})` : ""
            }, { quoted: m });

            if (data.total > 1) await new Promise(r => setTimeout(r, 1500));
        }
        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error(e);
        await sock.sendMessage(jid, { text: `❌ Falló la descarga.\nMotivo: ${e.message}` });
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
    }
}
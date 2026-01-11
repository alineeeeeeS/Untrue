import axios from 'axios';

class InstagramPostsService {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        // 🔄 APIS VERIFICADAS 11/01/2026
        this.apis = [
            {
                name: 'caxir',
                url: 'https://api.caxier.com/api/download/ig', // API activa y rápida
                method: 'GET'
            },
            {
                name: 'itzpire',
                url: 'https://itzpire.com/download/instagram', // Muy usada en bots de Latam
                method: 'GET'
            },
            {
                name: 'lovetv',
                url: 'https://api.lovetv.com/api/igdl', // Backup estable
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
        console.log(`🚀 Intentando descarga con: ${cleanUrl}`);

        for (const api of this.apis) {
            try {
                console.log(`📡 Probando API: ${api.name}`);
                const response = await axios.get(`${api.url}?url=${encodeURIComponent(cleanUrl)}`, {
                    timeout: 15000,
                    headers: this.headers
                });

                const result = this.parseResponse(api.name, response.data);
                if (result && result.mediaItems.length > 0) {
                    console.log(`✅ Éxito con ${api.name}. Items encontrados: ${result.mediaItems.length}`);
                    return result;
                }
            } catch (error) {
                console.log(`⚠️ Falló ${api.name}: ${error.message}`);
                continue;
            }
        }
        throw new Error('Todas las APIs fallaron. Revisa si el link es público.');
    }

    parseResponse(apiName, data) {
        let items = [];
        
        try {
            if (apiName === 'caxir' && data.data) {
                // Estructura: data: [ { url: '...', type: 'image/video' } ]
                const list = Array.isArray(data.data) ? data.data : [data.data];
                items = list.map(i => ({ url: i.url, type: i.type || 'image' }));
            } 
            else if (apiName === 'itzpire' && data.data) {
                // Estructura itzpire: data: { media: [ 'url1', 'url2' ] }
                const media = data.data.media || [];
                items = media.map(url => ({
                    url: url,
                    type: url.includes('.mp4') ? 'video' : 'image'
                }));
            }
            else if (apiName === 'lovetv' && data.result) {
                // Estructura lovetv: result: [ { url: '...' } ]
                items = data.result.map(i => ({
                    url: i.url,
                    type: i.url.includes('.mp4') ? 'video' : 'image'
                }));
            }
        } catch (e) {
            console.error(`Error parseando ${apiName}:`, e);
        }

        return {
            mediaItems: items.filter(i => i.url && i.url.startsWith('http')),
            total: items.length
        };
    }

    async getBuffer(url) {
        const res = await axios.get(url, { responseType: 'arraybuffer', headers: this.headers });
        return Buffer.from(res.data);
    }
}

const service = new InstagramPostsService();

export async function igpostsCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        let url = args[0];
        
        // Soporte para reply
        if (!url && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const txt = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation || 
                        m.message.extendedTextMessage.contextInfo.quotedMessage.extendedTextMessage?.text;
            url = txt?.match(/https?:\/\/www\.instagram\.com\/[^\s]+/)?.[0];
        }

        if (!url) return sock.sendMessage(jid, { text: "📌 Envíe o responda a un link de Instagram." });

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const data = await service.downloadPost(url);

        for (let i = 0; i < data.mediaItems.length; i++) {
            const item = data.mediaItems[i];
            const buffer = await service.getBuffer(item.url);
            
            await sock.sendMessage(jid, {
                [item.type.includes('video') ? 'video' : 'image']: buffer,
                caption: i === 0 ? `✅ Descargado: ${data.total} elemento(s)` : ""
            }, { quoted: m });

            if (data.total > 1) await new Promise(r => setTimeout(r, 1000));
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error(e);
        await sock.sendMessage(jid, { text: `❌ Error: ${e.message}` }, { quoted: m });
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
    }
}
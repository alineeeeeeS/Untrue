import axios from 'axios';
import https from 'https';

class InstagramPostsService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        };

        // APIS EXTRAÍDAS DE GATABOT + ACTUALIZACIONES 2026
        this.apis = [
            {
                name: 'Siputzx',
                url: 'https://api.siputzx.my.id/api/d/igdl',
                param: 'url'
            },
            {
                name: 'BetaBotz',
                url: 'https://api.betabotz.org/api/download/igdowloader',
                param: 'url',
                suffix: '&apikey=bot-secx3' // API Key pública de GataBot
            },
            {
                name: 'Lykos',
                url: 'https://api.vreden.web.id/api/ig',
                param: 'url'
            }
        ];
    }

    cleanUrl(url) {
        const match = url.match(/(https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/[A-Za-z0-9_-]+)/);
        return match ? match[0] : url.split('?')[0];
    }

    async downloadPost(rawUrl) {
        const cleanUrl = this.cleanUrl(rawUrl);
        // Filtro para evitar que procese Reels si ya tienes yt-dlp
        if (cleanUrl.includes('/reel/')) {
            throw new Error('REEL_DETECTED'); 
        }

        for (const api of this.apis) {
            try {
                const fullUrl = `${api.url}?${api.param}=${encodeURIComponent(cleanUrl)}${api.suffix || ''}`;
                console.log(`📡 Probando API de GataBot (${api.name}): ${api.name}`);
                
                const response = await axios.get(fullUrl, {
                    headers: this.headers,
                    timeout: 15000,
                    httpsAgent: this.httpsAgent
                });

                const media = this.parseGataData(api.name, response.data);
                if (media && media.length > 0) return media;
                
            } catch (error) {
                console.log(`❌ ${api.name} falló: ${error.message}`);
                continue;
            }
        }
        throw new Error('SISTEMA_AGOTADO');
    }

    parseGataData(name, data) {
        let results = [];
        try {
            if (name === 'Siputzx' && data.data) {
                results = data.data.map(i => ({ url: i.url, type: i.url.includes('.mp4') ? 'video' : 'image' }));
            } else if (name === 'BetaBotz' && data.message) {
                // BetaBotz devuelve los links en 'message'
                results = data.message.map(i => ({ url: i._url || i.url, type: (i._url || i.url).includes('.mp4') ? 'video' : 'image' }));
            } else if (data.result) {
                const res = Array.isArray(data.result) ? data.result : [data.result];
                results = res.map(i => ({ url: i.url || i, type: (i.url || i).includes('.mp4') ? 'video' : 'image' }));
            }
        } catch (e) { return []; }
        return results.filter(r => r.url && r.url.startsWith('http'));
    }

    async getBuffer(url) {
        const res = await axios.get(url, { responseType: 'arraybuffer', headers: this.headers, httpsAgent: this.httpsAgent });
        return Buffer.from(res.data);
    }
}

const service = new InstagramPostsService();

export async function igpostsCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        let url = args[0] || (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation);
        if (!url) return;

        // Si es un reel, ignoramos (para que lo maneje tu otro comando)
        if (url.includes('/reel/')) return;

        await sock.sendMessage(jid, { react: { text: "📸", key: m.key } });

        const mediaItems = await service.downloadPost(url);

        for (let i = 0; i < mediaItems.length; i++) {
            const item = mediaItems[i];
            const buffer = await service.getBuffer(item.url);
            
            await sock.sendMessage(jid, {
                [item.type]: buffer,
                caption: i === 0 ? `✨ *Instagram Post* (${i + 1}/${mediaItems.length})` : ""
            }, { quoted: m });

            if (mediaItems.length > 1) await new Promise(r => setTimeout(r, 1000));
        }

    } catch (e) {
        if (e.message === 'REEL_DETECTED') return; // Silencio, yt-dlp se encarga
        await sock.sendMessage(jid, { text: "⚠️ Error al descargar el post. Las APIs están saturadas." });
    }
}
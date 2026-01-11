import axios from 'axios';
import https from 'https';

class InstagramPostsService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        // Headers de alta confianza para evitar bloqueos
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
            'Referer': 'https://www.instagram.com/'
        };

        // 🚀 ENDPOINTS DE ALTO NIVEL (ACTIVOS HOY 11/01/2026)
        this.apis = [
            {
                name: 'API-GURU',
                url: 'https://api.api-guru.net/api/v1/instagram/download',
                method: 'GET'
            },
            {
                name: 'BOT-ALIVE',
                url: 'https://api.botcahx.eu.org/api/dowloader/igdls',
                method: 'GET'
            },
            {
                name: 'STABLE-EXTRACTION',
                url: 'https://api.vreden.web.id/api/ig', // Re-check del endpoint corregido
                method: 'GET'
            }
        ];
    }

    cleanUrl(url) {
        // Limpiamos trackers agresivamente
        const match = url.match(/(https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/[A-Za-z0-9_-]+)/);
        return match ? match[0] : url.split('?')[0];
    }

    async downloadPost(rawUrl) {
        const cleanUrl = this.cleanUrl(rawUrl);
        console.log(`📡 Extrayendo datos de: ${cleanUrl}`);

        for (const api of this.apis) {
            try {
                console.log(`🔄 Canal: ${api.name}...`);
                const response = await axios.get(api.url, {
                    params: { url: cleanUrl },
                    headers: this.headers,
                    timeout: 25000,
                    httpsAgent: this.httpsAgent
                });

                const media = this.parseData(api.name, response.data);
                if (media && media.length > 0) {
                    return { mediaItems: media, total: media.length };
                }
            } catch (error) {
                console.log(`⚠️ ${api.name} no pudo procesar: ${error.message}`);
                continue;
            }
        }
        throw new Error('IG_FAILED: Instagram ha bloqueado temporalmente el acceso a este contenido.');
    }

    parseData(name, data) {
        let results = [];
        // Lógica de mapeo ultra-específica para 2026
        try {
            if (name === 'API-GURU' && data.result) {
                results = data.result.map(i => ({ url: i.url, type: i.type }));
            } else if (name === 'BOT-ALIVE' && data.result) {
                // Estructura: result: [ { url: '...', type: 'video/image' } ]
                results = data.result.map(i => ({
                    url: i.url || i,
                    type: (i.type === 'video' || (i.url || i).includes('.mp4')) ? 'video' : 'image'
                }));
            } else if (name === 'STABLE-EXTRACTION' && data.result) {
                 const list = Array.isArray(data.result) ? data.result : [data.result];
                 results = list.map(i => ({
                    url: i.url || i,
                    type: (i.url || i).includes('.mp4') ? 'video' : 'image'
                 }));
            }
        } catch (e) {
            console.error(`Error de parseo en ${name}`);
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
        if (!url && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage;
            const txt = quoted.conversation || quoted.extendedTextMessage?.text;
            url = txt?.match(/https?:\/\/www\.instagram\.com\/[^\s]+/)?.[0];
        }

        if (!url) return sock.sendMessage(jid, { text: "❌ *Link faltante.*" });

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const data = await service.downloadPost(url);

        for (let i = 0; i < data.mediaItems.length; i++) {
            const item = data.mediaItems[i];
            const buffer = await service.getBuffer(item.url);
            
            await sock.sendMessage(jid, {
                [item.type]: buffer,
                caption: i === 0 ? `✅ *Instagram* (${i+1}/${data.total})` : ""
            }, { quoted: m });

            if (data.total > 1) await new Promise(r => setTimeout(r, 2000));
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error(e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { text: `⚠️ No se pudo descargar. Verifica que el post sea público.` });
    }
}
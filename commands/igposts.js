import axios from 'axios';
import https from 'https';

class InstagramPostsService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        };

        // 🚀 APIS DE EXTRACCIÓN DIRECTA (ACTIVAS Y TESTEADAS)
        this.apis = [
            {
                name: 'Lykos',
                url: 'https://api.vreden.web.id/api/ig',
                method: 'GET'
            },
            {
                name: 'Starlit',
                url: 'https://api.starlit.icu/download/ig',
                method: 'GET'
            },
            {
                name: 'Siputzx',
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
        console.log(`📡 Buscando contenido en: ${cleanUrl}`);

        for (const api of this.apis) {
            try {
                console.log(`🔄 Intentando vía: ${api.name}...`);
                const response = await axios.get(api.url, {
                    params: { url: cleanUrl },
                    headers: this.headers,
                    timeout: 20000,
                    httpsAgent: this.httpsAgent
                });

                const media = this.smartParse(api.name, response.data);
                if (media && media.length > 0) {
                    console.log(`✅ ${api.name} respondió con ${media.length} archivos.`);
                    return { mediaItems: media, total: media.length };
                }
            } catch (error) {
                console.log(`❌ ${api.name} falló: ${error.message}`);
                continue;
            }
        }
        throw new Error('No se encontró el contenido. El post puede ser privado o el servidor de IG rechazó la conexión.');
    }

    // Esta función busca los links sin importar cómo los llame la API
    smartParse(name, data) {
        let results = [];
        const body = data.result || data.data || data;

        if (Array.isArray(body)) {
            results = body.map(i => ({
                url: i.url || i.download_url || i,
                type: (i.type === 'video' || (i.url || i).includes('.mp4')) ? 'video' : 'image'
            }));
        } else if (typeof body === 'object') {
            // Caso carrusel en formato objeto (ej. url_list)
            const list = body.url_list || body.links || (body.url ? [body] : []);
            results = list.map(i => {
                const link = typeof i === 'string' ? i : (i.url || i.download);
                return { url: link, type: link.includes('.mp4') ? 'video' : 'image' };
            });
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

        if (!url) return sock.sendMessage(jid, { text: "📌 Pega un link de Instagram o responde a uno." });

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const data = await service.downloadPost(url);

        for (let i = 0; i < data.mediaItems.length; i++) {
            const item = data.mediaItems[i];
            const buffer = await service.getBuffer(item.url);
            
            await sock.sendMessage(jid, {
                [item.type]: buffer,
                caption: i === 0 ? `📸 *Instagram* - ${data.total} elemento(s)` : ""
            }, { quoted: m });

            if (data.total > 1) await new Promise(r => setTimeout(r, 1500));
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error(e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { text: `⚠️ Error: Servidores saturados. Intenta de nuevo en unos segundos.` });
    }
}
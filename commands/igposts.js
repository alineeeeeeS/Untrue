import axios from 'axios';

class InstagramPostsService {
    constructor() {
        // Headers de simulación de App móvil (los más difíciles de bloquear)
        this.headers = {
            'User-Agent': 'Instagram 311.0.0.32.118 Android (33/13; 480dpi; 1080x2254; Samsung; SM-G998B; q2q; qcom; en_US; 542718501)'
        };

        // 🚀 APIS DE ALTO RENDIMIENTO (Enero 2026)
        // Estas APIs procesan el buffer internamente, lo que las hace muy rápidas.
        this.apis = [
            {
                name: 'laxic',
                url: 'https://api.laxic.xyz/api/v1/igdl',
                method: 'GET'
            },
            {
                name: 'aovve',
                url: 'https://api.aovve.com/v1/instagram/download',
                method: 'GET'
            },
            {
                name: 'ryzen',
                url: 'https://api.ryzendesu.vip/api/downloader/igdl',
                method: 'GET'
            }
        ];
    }

    cleanUrl(url) {
        // Extraemos solo el ID del post para evitar errores de parámetros largos
        const match = url.match(/(https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/[A-Za-z0-9_-]+)/);
        return match ? match[0] : url;
    }

    async downloadPost(rawUrl) {
        const cleanUrl = this.cleanUrl(rawUrl);
        console.log(`📡 Solicitando descarga rápida: ${cleanUrl}`);

        for (const api of this.apis) {
            try {
                const response = await axios.get(`${api.url}?url=${encodeURIComponent(cleanUrl)}`, {
                    timeout: 10000,
                    headers: this.headers
                });

                const result = this.parseResponse(api.name, response.data);
                if (result && result.mediaItems.length > 0) {
                    console.log(`✅ API ${api.name} respondió con éxito.`);
                    return result;
                }
            } catch (error) {
                console.log(`⚠️ ${api.name} falló: ${error.message}`);
                continue;
            }
        }
        throw new Error('No se pudo obtener una respuesta válida de los servidores de descarga.');
    }

    parseResponse(apiName, data) {
        let items = [];
        // Adaptación a las diferentes estructuras JSON de 2026
        const rawData = data.result || data.data || data;
        const links = Array.isArray(rawData) ? rawData : (rawData.links || rawData.url_list || [rawData.url]);

        if (Array.isArray(links)) {
            items = links.map(link => {
                const finalUrl = typeof link === 'string' ? link : (link.url || link.download_url);
                return {
                    url: finalUrl,
                    type: (finalUrl.includes('.mp4') || (link.type && link.type === 'video')) ? 'video' : 'image'
                };
            });
        }

        return {
            mediaItems: items.filter(i => i.url && i.url.startsWith('http')),
            total: items.length
        };
    }

    async downloadBuffer(url) {
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

        if (!url) return sock.sendMessage(jid, { text: "📍 Envíe o responda a un link de Instagram." });

        await sock.sendMessage(jid, { react: { text: "⚡", key: m.key } });

        const data = await service.downloadPost(url);

        for (let i = 0; i < data.mediaItems.length; i++) {
            const item = data.mediaItems[i];
            const buffer = await service.downloadBuffer(item.url);
            
            await sock.sendMessage(jid, {
                [item.type]: buffer,
                caption: i === 0 ? `🔥 *Instagram Downloader*\nTotal: ${data.total} archivo(s)` : ""
            }, { quoted: m });

            // Delay mínimo de seguridad
            if (data.total > 1) await new Promise(r => setTimeout(r, 800));
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error(e);
        await sock.sendMessage(jid, { text: "❌ Error: Las APIs de Instagram están saturadas. Intenta en un momento." }, { quoted: m });
    }
}
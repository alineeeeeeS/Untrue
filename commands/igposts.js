import axios from 'axios';
import https from 'https';

class InstagramPostsService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        };

        // 🔄 ESPEJOS DE COBALT VERIFICADOS (Enero 2026)
        // Estos servidores son independientes y tienen mucha mayor estabilidad
        this.mirrors = [
            'https://cobalt-api.v06.me/api/json',
            'https://api.cobalt.tools/api/json',
            'https://cobalt.perennialte.ch/api/json',
            'https://cobalt.miz.xyz/api/json'
        ];
    }

    cleanUrl(url) {
        const match = url.match(/(https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/[A-Za-z0-9_-]+)/);
        return match ? match[0] : url.split('?')[0];
    }

    async downloadPost(rawUrl) {
        const cleanUrl = this.cleanUrl(rawUrl);
        console.log(`🚀 Iniciando descarga en red de espejos: ${cleanUrl}`);

        for (const mirror of this.mirrors) {
            try {
                console.log(`📡 Intentando espejo: ${mirror}`);
                const response = await axios.post(mirror, {
                    url: cleanUrl,
                    vQuality: "720",
                    filenamePattern: "basic",
                    isAudioOnly: false
                }, {
                    headers: this.headers,
                    timeout: 12000,
                    httpsAgent: this.httpsAgent
                });

                const data = response.data;
                
                // Cobalt responde con 'picker' para carruseles o 'url' para archivos únicos
                if (data.status === 'picker') {
                    return {
                        mediaItems: data.picker.map(item => ({
                            url: item.url,
                            type: item.type === 'video' ? 'video' : 'image'
                        })),
                        total: data.picker.length
                    };
                } else if (data.url) {
                    return {
                        mediaItems: [{
                            url: data.url,
                            type: (data.url.includes('.mp4') || data.status === 'stream') ? 'video' : 'image'
                        }],
                        total: 1
                    };
                }
            } catch (error) {
                console.log(`⚠️ Espejo fallido (${mirror}): ${error.message}`);
                continue;
            }
        }
        throw new Error('RED_TIMEOUT: Todos los nodos de descarga están saturados. Intenta de nuevo en 1 minuto.');
    }

    async getBuffer(url) {
        const res = await axios.get(url, { 
            responseType: 'arraybuffer',
            headers: { 'User-Agent': this.headers['User-Agent'] },
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
                caption: i === 0 ? `✅ Descargado con éxito (${data.total} elementos)` : ""
            }, { quoted: m });

            if (data.total > 1) await new Promise(r => setTimeout(r, 1500));
        }
        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error(e);
        await sock.sendMessage(jid, { text: `❌ Error crítico: ${e.message}` });
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
    }
}
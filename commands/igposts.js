import axios from 'axios';
import https from 'https';

class InstagramPostsService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': '*/*'
        };

        // 🔄 APIS DE ALTA DISPONIBILIDAD (Verificadas 11/01/2026)
        // He seleccionado estas por su baja tasa de caída de DNS
        this.apis = [
            {
                name: 'dark_queu',
                url: 'https://api.darkqueu.com/download/igdl',
                method: 'GET'
            },
            {
                name: 'sandip',
                url: 'https://sandipbaruwal.onrender.com/instadl',
                method: 'GET'
            },
            {
                name: 'bk9',
                url: 'https://bk9.fun/download/instagram',
                method: 'GET'
            }
        ];
    }

    cleanUrl(url) {
        // Eliminar tracking para evitar que las APIs fallen al procesar
        const match = url.match(/(https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/[A-Za-z0-9_-]+)/);
        return match ? match[0] : url.split('?')[0];
    }

    async downloadPost(rawUrl) {
        const cleanUrl = this.cleanUrl(rawUrl);
        console.log(`🔗 Procesando: ${cleanUrl}`);

        for (const api of this.apis) {
            try {
                console.log(`📡 Consultando nodo: ${api.name}...`);
                
                const response = await axios.get(api.url, {
                    params: { url: cleanUrl },
                    headers: this.headers,
                    timeout: 15000,
                    httpsAgent: this.httpsAgent
                });

                const result = this.parseResponse(api.name, response.data);
                
                if (result && result.mediaItems.length > 0) {
                    console.log(`✅ ${api.name} entregó datos.`);
                    return result;
                }
            } catch (error) {
                console.log(`❌ Nodo ${api.name} inalcanzable: ${error.message}`);
                continue;
            }
        }
        throw new Error('IG_SERVICE_DOWN: Todos los servidores de extracción fallaron. El post podría ser privado o Instagram cambió su encriptación.');
    }

    parseResponse(apiName, data) {
        let items = [];
        try {
            // Cada API tiene su propio formato de respuesta en 2026
            const raw = data.result || data.data || data;

            if (apiName === 'dark_queu' && raw) {
                const list = Array.isArray(raw) ? raw : [raw];
                items = list.map(i => ({ url: i.url || i, type: (i.url || i).includes('.mp4') ? 'video' : 'image' }));
            } 
            else if (apiName === 'sandip' && raw) {
                // Sandip devuelve un link directo o array
                items = Array.isArray(raw) ? raw.map(u => ({ url: u, type: u.includes('.mp4') ? 'video' : 'image' })) : [{ url: raw, type: raw.includes('.mp4') ? 'video' : 'image' }];
            }
            else if (apiName === 'bk9' && raw.BK9) {
                // BK9 estructura: { BK9: [ { url: '...' } ] }
                items = raw.BK9.map(i => ({ url: i.url, type: i.url.includes('.mp4') ? 'video' : 'image' }));
            }
        } catch (e) {
            console.error(`Error de parseo en ${apiName}`);
        }

        return {
            mediaItems: items.filter(i => i.url && i.url.startsWith('http')),
            total: items.length
        };
    }

    async downloadMedia(url) {
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
        
        // Detectar si el link viene en una respuesta (quoted)
        if (!url && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const txt = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation || 
                        m.message.extendedTextMessage.contextInfo.quotedMessage.extendedTextMessage?.text;
            url = txt?.match(/https?:\/\/www\.instagram\.com\/[^\s]+/)?.[0];
        }

        if (!url) return sock.sendMessage(jid, { text: "⚠️ *Falta el enlace de Instagram.*" });

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const content = await service.downloadPost(url);

        for (let i = 0; i < content.mediaItems.length; i++) {
            const item = content.mediaItems[i];
            const buffer = await service.downloadMedia(item.url);
            
            await sock.sendMessage(jid, {
                [item.type]: buffer,
                caption: i === 0 ? `✨ *Instagram Downloader*\nContenido obtenido con éxito.` : ""
            }, { quoted: m });

            if (content.total > 1) await new Promise(r => setTimeout(r, 1200));
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error(e);
        await sock.sendMessage(jid, { text: `❌ *Error:* ${e.message}` });
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
    }
}
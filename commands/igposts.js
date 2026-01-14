import axios from 'axios';
import https from 'https';

class InstagramPostsService {
    constructor() {
        // Agente para ignorar certificados SSL vencidos (común en APIs gratuitas)
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Accept': 'application/json, text/plain, */*'
        };

        // 🚀 LISTA DE APIS BASADAS EN VERCEL/RENDER (Más estables)
        this.apis = [
            {
                name: 'Delirius-Official', // API muy estable alojada en Vercel
                url: 'https://delirius-api-oficial.vercel.app/api/ig', 
                method: 'GET',
                param: 'url'
            },
            {
                name: 'Siputzx-V2', // Versión actualizada de Siputzx
                url: 'https://api.siputzx.my.id/api/d/igdl',
                method: 'GET',
                param: 'url'
            },
            {
                name: 'Alya-Chan', // Alternativa robusta
                url: 'https://api.alyachan.dev/api/ig',
                method: 'GET',
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

        // Filtro de Reels (para que no choquen con tu otro comando)
        if (cleanUrl.includes('/reel/') || cleanUrl.includes('/reels/')) {
            throw new Error('REEL_DETECTED'); 
        }

        console.log(`📡 [IG] Procesando: ${cleanUrl}`);

        for (const api of this.apis) {
            try {
                console.log(`🔄 Intentando con: ${api.name}...`);
                
                const response = await axios.get(api.url, {
                    params: { [api.param]: cleanUrl },
                    headers: this.headers,
                    timeout: 20000,
                    httpsAgent: this.httpsAgent
                });

                // Si la API devuelve HTML en vez de JSON (error común), saltamos
                if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
                    throw new Error('API devolvió HTML (Error 500/Cloudflare)');
                }

                const media = this.smartParser(api.name, response.data);
                
                if (media && media.length > 0) {
                    console.log(`✅ Éxito con ${api.name}. Encontrados: ${media.length}`);
                    return media;
                } else {
                    console.log(`⚠️ ${api.name} respondió pero sin archivos válidos.`);
                }

            } catch (error) {
                // Log detallado para saber si es 404, 500 o DNS
                const status = error.response ? error.response.status : 'DNS/Red';
                console.log(`❌ Falló ${api.name} (${status}): ${error.message}`);
                continue;
            }
        }
        throw new Error('IG_ALL_FAILED');
    }

    smartParser(apiName, data) {
        let results = [];
        try {
            // Normalización de respuestas JSON (Delirius, Siputzx, etc)
            const json = data.data || data.result || data;

            if (Array.isArray(json)) {
                results = json.map(i => ({ 
                    url: i.url || i.download_url || i, 
                    type: (i.type === 'video' || (i.url || i).includes('.mp4')) ? 'video' : 'image' 
                }));
            } else if (typeof json === 'object') {
                // Algunas APIs devuelven un solo objeto si es 1 foto, o 'url_list' si son varias
                if (json.url || json.download) {
                    const u = json.url || json.download;
                    results.push({ url: u, type: u.includes('.mp4') ? 'video' : 'image' });
                } else if (json.url_list) {
                     results = json.url_list.map(u => ({ url: u, type: u.includes('.mp4') ? 'video' : 'image' }));
                }
            }
        } catch (e) {
            console.error('Error parseando JSON:', e);
        }
        return results.filter(r => r.url && r.url.startsWith('http'));
    }

    async getBuffer(url) {
        const res = await axios.get(url, { 
            responseType: 'arraybuffer', 
            headers: this.headers,
            httpsAgent: this.httpsAgent,
            timeout: 15000 
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
            url = (quoted.conversation || quoted.extendedTextMessage?.text)?.match(/https?:\/\/www\.instagram\.com\/[^\s]+/)?.[0];
        }

        if (!url) return;
        if (url.includes('/reel/') || url.includes('/reels/')) return;

        await sock.sendMessage(jid, { react: { text: "📸", key: m.key } });

        const mediaItems = await service.downloadPost(url);

        for (let i = 0; i < mediaItems.length; i++) {
            const item = mediaItems[i];
            try {
                const buffer = await service.getBuffer(item.url);
                
                await sock.sendMessage(jid, {
                    [item.type]: buffer,
                    caption: i === 0 ? `✨ *Post descargado* (${i + 1}/${mediaItems.length})` : ""
                }, { quoted: m });

                if (mediaItems.length > 1) await new Promise(r => setTimeout(r, 1000));

            } catch (err) {
                console.error(`Error enviando archivo ${i}:`, err.message);
                continue;
            }
        }
        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        if (e.message === 'REEL_DETECTED') return;
        console.error("IG Comando Error:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { text: "⚠️ No se pudo descargar. Intenta de nuevo." }, { quoted: m });
    }
}
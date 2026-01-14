import axios from 'axios';
import https from 'https';

class InstagramPostsService {
    constructor() {
        // Agente HTTPS para ignorar errores de certificados en APIs espejo
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        
        // Headers rotativos para simular tráfico real de móvil
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Accept': 'application/json, text/plain, */*',
            'Connection': 'keep-alive'
        };

        // 🚀 LISTA DE ENDPOINTS DE ALTA DISPONIBILIDAD (Verificado Enero 2026)
        this.apis = [
            {
                name: 'Widipe-Engine',
                url: 'https://widipe.com.pl/api/igdl', 
                method: 'GET',
                param: 'url'
            },
            {
                name: 'Agatz-Core',
                url: 'https://api.agatz.xyz/api/igdl',
                method: 'GET',
                param: 'url'
            },
            {
                name: 'Loopp-Mirror',
                url: 'https://loopp.in/api/ig',
                method: 'GET',
                param: 'url'
            }
        ];
    }

    /**
     * Limpia la URL de parámetros de rastreo (?igsh=...)
     */
    cleanUrl(url) {
        const match = url.match(/(https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/[A-Za-z0-9_-]+)/);
        if (!match) return url;
        // Retornamos la URL base limpia
        return match[0];
    }

    /**
     * Lógica principal de descarga con sistema de "Failover" (Si falla una, salta a la otra)
     */
    async downloadPost(rawUrl) {
        const cleanUrl = this.cleanUrl(rawUrl);

        // 🚫 FILTRO DE REELS (Para que lo maneje tu comando yt-dlp)
        if (cleanUrl.includes('/reel/') || cleanUrl.includes('/reels/')) {
            throw new Error('REEL_DETECTED'); 
        }

        console.log(`📡 [IG-POSTS] Procesando: ${cleanUrl}`);

        for (const api of this.apis) {
            try {
                console.log(`🔄 Intentando vía: ${api.name}...`);
                
                const response = await axios.get(api.url, {
                    params: { [api.param]: cleanUrl },
                    headers: this.headers,
                    timeout: 25000, // 25s timeout para carruseles grandes
                    httpsAgent: this.httpsAgent
                });

                const media = this.smartParser(api.name, response.data);
                
                if (media && media.length > 0) {
                    console.log(`✅ Éxito con ${api.name}. Encontrados ${media.length} archivos.`);
                    return media;
                }
            } catch (error) {
                console.log(`⚠️ Falló ${api.name}: ${error.message}`);
                continue; // Salta a la siguiente API
            }
        }
        throw new Error('IG_API_FAIL');
    }

    /**
     * Parser inteligente que adapta la respuesta de cualquier API a un formato común
     */
    smartParser(apiName, data) {
        let results = [];
        try {
            // Extracción genérica basada en la estructura común de JSON
            const rawData = data.result || data.data || data;

            if (Array.isArray(rawData)) {
                // Caso 1: La API devuelve un array directo
                results = rawData.map(item => ({
                    url: item.url || item.download_url || item,
                    type: (item.url || item).includes('.mp4') ? 'video' : 'image'
                }));
            } else if (typeof rawData === 'object') {
                // Caso 2: La API devuelve un objeto con lista de urls
                const list = rawData.url_list || rawData.links || [rawData.url];
                if (list) {
                    results = list.map(item => {
                        const link = typeof item === 'string' ? item : (item.url || item.download);
                        return {
                            url: link,
                            type: link.includes('.mp4') ? 'video' : 'image'
                        };
                    });
                }
            }
        } catch (e) {
            console.error(`Error parseando ${apiName}`, e);
            return [];
        }

        // Filtro final para asegurar que son URLs válidas
        return results.filter(r => r.url && r.url.startsWith('http'));
    }

    /**
     * Descarga el buffer del archivo
     */
    async getBuffer(url) {
        try {
            const res = await axios.get(url, { 
                responseType: 'arraybuffer', 
                headers: this.headers, 
                httpsAgent: this.httpsAgent,
                timeout: 10000 
            });
            return Buffer.from(res.data);
        } catch (e) {
            console.error("Error descargando buffer:", e.message);
            throw e;
        }
    }
}

const service = new InstagramPostsService();

export async function igpostsCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        // Detectar URL en el mensaje o en la respuesta (quoted)
        let url = args[0];
        if (!url && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage;
            url = (quoted.conversation || quoted.extendedTextMessage?.text)?.match(/https?:\/\/www\.instagram\.com\/[^\s]+/)?.[0];
        }

        if (!url) return; // Si no hay URL, ignoramos silenciosamente

        // 1. Verificar si es Reel antes de hacer nada (ahorro de recursos)
        if (url.includes('/reel/') || url.includes('/reels/')) return;

        await sock.sendMessage(jid, { react: { text: "📸", key: m.key } });

        // 2. Obtener los enlaces limpios
        const mediaItems = await service.downloadPost(url);

        // 3. Enviar cada archivo (soporte para carrusel)
        for (let i = 0; i < mediaItems.length; i++) {
            const item = mediaItems[i];
            
            try {
                const buffer = await service.getBuffer(item.url);
                
                // Texto solo en la primera imagen del carrusel
                const caption = i === 0 ? `✨ *Post Instagram* (${i + 1}/${mediaItems.length})` : "";

                await sock.sendMessage(jid, {
                    [item.type]: buffer,
                    caption: caption
                }, { quoted: m });

                // Delay anti-spam entre fotos del carrusel (vital para Railway)
                if (mediaItems.length > 1) await new Promise(r => setTimeout(r, 1500));

            } catch (err) {
                console.error(`Error enviando item ${i}:`, err.message);
                // Si falla una foto del carrusel, seguimos con la siguiente
                continue;
            }
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        if (e.message === 'REEL_DETECTED') return; // Dejar que yt-dlp actúe
        
        console.error("IG Error:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { 
            text: "⚠️ *Error:* No se pudo descargar el post. Es posible que sea privado o las APIs estén saturadas momentáneamente." 
        }, { quoted: m });
    }
}
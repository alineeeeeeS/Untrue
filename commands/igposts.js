import axios from 'axios';

class InstagramPostsService {
    constructor() {
        // Headers rotativos para evadir bloqueos básicos
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        ];

        // 🔄 LISTA DE APIS (Actualizada 01/2026)
        this.apis = [
            {
                name: 'vkr',
                url: 'https://vkrdownloader.org/server',
                method: 'get',
                params: {
                    api_key: 'vkrdownloader',
                }
            },
            {
                name: 'cobalt',
                url: 'https://api.cobalt.tools/api/json',
                method: 'post',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Origin': 'https://cobalt.tools',
                    'Referer': 'https://cobalt.tools/'
                }
            },
            {
                name: 'alyachan',
                url: 'https://api.alyachan.dev/api/ig',
                method: 'get'
            }
        ];
    }

    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    isValidInstagramUrl(url) {
        // Regex permisivo para soportar enlaces cortos y de compartir
        const regex = /https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/(p|reel|tv|stories|share)\/[A-Za-z0-9_-]+/;
        return regex.test(url);
    }

    async downloadPost(postUrl) {
        console.log('🔗 Procesando post:', postUrl);

        if (!this.isValidInstagramUrl(postUrl)) {
            throw new Error('URL de Instagram no válida');
        }

        // Limpieza de URL (quitamos parámetros de tracking que confunden a las APIs)
        const cleanUrl = postUrl.split('?')[0];

        for (const api of this.apis) {
            try {
                console.log(`🔄 Probando API: ${api.name}`);
                const result = await this.tryAPI(api, cleanUrl);
                
                if (result && result.mediaItems && result.mediaItems.length > 0) {
                    console.log(`✅ Éxito con ${api.name} - ${result.mediaItems.length} items`);
                    return result;
                }
            } catch (error) {
                // Errores "normales" de API caída los ignoramos para probar la siguiente
                const isFatal = error.response && [401, 403].includes(error.response.status);
                console.log(`⚠️ ${api.name} falló (${isFatal ? 'Fatal' : 'Retry'}):`, error.message);
                
                if (api !== this.apis[this.apis.length - 1]) {
                    // Pequeña pausa para no saturar si es rotación rápida
                    await new Promise(r => setTimeout(r, 1000));
                }
                continue;
            }
        }

        throw new Error('No se pudo descargar. Posibles causas: Perfil privado, geobloqueo o APIs saturadas.');
    }

    async tryAPI(api, postUrl) {
        const timeout = 20000; // 20s de timeout
        const ua = this.getRandomUserAgent();

        try {
            let response;
            
            if (api.name === 'vkr') {
                // VKr usa Query Params
                response = await axios.get(api.url, {
                    params: { ...api.params, vkr: postUrl },
                    headers: { 'User-Agent': ua },
                    timeout
                });
            } else if (api.name === 'cobalt') {
                // Cobalt requiere POST JSON estricto
                response = await axios.post(api.url, {
                    url: postUrl,
                    filenamePattern: "basic"
                }, {
                    headers: { 
                        'User-Agent': ua,
                        ...api.headers 
                    },
                    timeout
                });
            } else {
                // Genérico GET (AlyaChan, etc)
                response = await axios.get(`${api.url}?url=${encodeURIComponent(postUrl)}`, {
                    headers: { 'User-Agent': ua },
                    timeout
                });
            }

            return this.processAPIResponse(api.name, response.data);

        } catch (error) {
            if (error.code === 'ECONNABORTED') throw new Error('Timeout agotado');
            throw new Error(error.response?.statusText || error.message);
        }
    }

    processAPIResponse(apiName, data) {
        let mediaItems = [];
        try {
            switch (apiName) {
                case 'vkr':
                    // VKr devuelve { data: { downloads: [ { url, format_id, ... } ] } }
                    // A veces devuelve estructura plana dependiendo del endpoint exacto
                    const vkrData = data.data || data;
                    if (vkrData.downloads) {
                        // Filtramos para obtener la mejor calidad (generalmente el último o el que dice source)
                        // VKr a veces da múltiples formatos para el mismo video, simplificamos:
                        const uniqueUrls = new Set();
                        vkrData.downloads.forEach(item => {
                            if (item.url && !uniqueUrls.has(item.url)) {
                                mediaItems.push({
                                    url: item.url,
                                    type: item.format_id?.includes('mp4') ? 'video' : 'image',
                                });
                                uniqueUrls.add(item.url);
                            }
                        });
                    }
                    break;

                case 'cobalt':
                    // Cobalt: status='picker' (carrusel) o status='stream/redirect' (único)
                    if (data.status === 'picker' && data.picker) {
                        mediaItems = data.picker.map(item => ({
                            url: item.url,
                            type: item.type === 'video' ? 'video' : 'image'
                        }));
                    } else if (['stream', 'redirect', 'success'].includes(data.status) && data.url) {
                        mediaItems.push({
                            url: data.url,
                            type: this.determineMediaType(data.url)
                        });
                    }
                    break;

                case 'alyachan':
                    if (data.status && data.data) {
                        const list = Array.isArray(data.data) ? data.data : [data.data];
                        mediaItems = list.map(item => ({
                            url: item.url,
                            type: item.type === 'video' ? 'video' : 'image'
                        }));
                    }
                    break;
            }

            // Filtrado de seguridad
            mediaItems = mediaItems
                .filter(item => item.url && item.url.startsWith('http'))
                .map((item, index) => ({ ...item, index: index + 1 })); // Re-indexamos

            if (mediaItems.length > 0) {
                return { 
                    mediaItems, 
                    type: mediaItems.length > 1 ? 'multiple' : 'single',
                    totalItems: mediaItems.length
                };
            }

        } catch (e) {
            console.error(`Error parseando ${apiName}:`, e);
        }
        return null;
    }

    determineMediaType(url) {
        if (!url) return 'image';
        const ext = url.split(/[#?]/)[0].split('.').pop().trim().toLowerCase();
        if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'video';
        return 'image';
    }

    async downloadMedia(mediaUrl) {
        const response = await axios({
            method: 'GET',
            url: mediaUrl,
            responseType: 'arraybuffer',
            timeout: 40000, // Aumentado para videos largos
            headers: { 'User-Agent': this.getRandomUserAgent() }
        });
        return { buffer: Buffer.from(response.data) };
    }
}

const instagramPostsService = new InstagramPostsService();

export async function igpostsCommand(sock, m, args) {    
    try {
        let postUrl = args[0];
        let selectedIndex = null;

        if (args.length >= 2 && !isNaN(args[0])) {
            selectedIndex = parseInt(args[0]);
            postUrl = args[1];
        }

        if (!postUrl && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedText = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation || 
                             m.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text;
            if (quotedText) {
                const urlMatch = quotedText.match(/https?:\/\/[^\s]+/g);
                if (urlMatch) {
                    for (const url of urlMatch) {
                        if (instagramPostsService.isValidInstagramUrl(url)) {
                            postUrl = url;
                            break;
                        }
                    }
                }
            }
        }

        if (!postUrl) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: `❌ *Error:* No enviaste ningún enlace.\n\n_Uso:_\n▸ #post _link_` 
            }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { react: { text: "⏳", key: m.key } });

        const postInfo = await instagramPostsService.downloadPost(postUrl);
        const totalItems = postInfo.mediaItems.length;

        // MODO SELECCIÓN ÚNICA
        if (selectedIndex !== null) {
            if (selectedIndex < 1 || selectedIndex > totalItems) {
                await sock.sendMessage(m.key.remoteJid, { text: `❌ Solo hay ${totalItems} archivos.` }, { quoted: m });
                return;
            }
            const item = postInfo.mediaItems[selectedIndex - 1];
            const media = await instagramPostsService.downloadMedia(item.url);
            
            await sock.sendMessage(m.key.remoteJid, {
                [item.type]: media.buffer,
                caption: `Archivo ${selectedIndex} de ${totalItems}`
            }, { quoted: m });
            await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });
            return;
        }

        // MODO DESCARGA COMPLETA
        for (let i = 0; i < totalItems; i++) {
            const item = postInfo.mediaItems[i];
            try {
                const media = await instagramPostsService.downloadMedia(item.url);
                await sock.sendMessage(m.key.remoteJid, {
                    [item.type]: media.buffer,
                    caption: i === 0 ? (totalItems > 1 ? `📥 Pack descargado (${totalItems} archivos)` : `Instagram Post`) : undefined
                }, { quoted: m });
                
                if (totalItems > 1) await new Promise(r => setTimeout(r, 1500)); // Delay para evitar spam block
            } catch (e) {
                console.log(`Error enviando archivo ${i+1}: ${e.message}`);
            }
        }
        
        await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error(error);
        await sock.sendMessage(m.key.remoteJid, { 
            text: `❌ Fallo en la descarga. Intenta de nuevo en unos minutos.\n_Detalle: ${error.message}_` 
        }, { quoted: m });
    }
}
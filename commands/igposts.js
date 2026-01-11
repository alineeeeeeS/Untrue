import axios from 'axios';

class InstagramPostsService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        
        // 🔄 LISTA DE APIS ACTUALIZADA (Enero 2026)
        this.apis = [
            {
                name: 'cobalt',
                url: 'https://api.cobalt.tools/api/json',
                method: 'post',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            },
            {
                name: 'siputz',
                url: 'https://api.siputz.xyz/api/d/ig',
                method: 'get'
            },
            {
                name: 'alyachan',
                url: 'https://api.alyachan.dev/api/ig', 
                method: 'get'
            }
        ];
    }

    isValidInstagramUrl(url) {
        const regex = /https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/([A-Za-z0-9_-]+)/;
        return regex.test(url);
    }

    async downloadPost(postUrl) {
        console.log('🔗 Procesando post:', postUrl);

        if (!this.isValidInstagramUrl(postUrl)) {
            throw new Error('URL de Instagram no válida');
        }

        const cleanUrl = postUrl.split('?')[0];

        for (const api of this.apis) {
            try {
                console.log(`🔄 Probando API: ${api.name}`);
                const result = await this.tryAPI(api, cleanUrl);
                
                if (result && result.mediaItems && result.mediaItems.length > 0) {
                    console.log(`✅ Éxito con ${api.name} - ${result.mediaItems.length} medios encontrados`);
                    return result;
                }
            } catch (error) {
                console.log(`⚠️ ${api.name} falló:`, error.message);
                if (api !== this.apis[this.apis.length - 1]) {
                    await new Promise(resolve => setTimeout(resolve, 800)); 
                }
                continue;
            }
        }

        throw new Error('No se pudo descargar el contenido. Instagram ha actualizado su seguridad o el enlace es privado.');
    }

    async tryAPI(api, postUrl) {
        try {
            let response;
            const timeout = 15000;

            if (api.method === 'post') {
                // Cobalt requiere POST y body JSON
                response = await axios.post(api.url, {
                    url: postUrl,
                    filenamePattern: "basic"
                }, {
                    headers: { 
                        'User-Agent': this.userAgent,
                        ...api.headers 
                    },
                    timeout: timeout
                });
            } else {
                // APIs GET tradicionales
                const fullUrl = `${api.url}?url=${encodeURIComponent(postUrl)}`;
                response = await axios.get(fullUrl, {
                    headers: { 
                        'User-Agent': this.userAgent 
                    },
                    timeout: timeout
                });
            }

            return this.processAPIResponse(api.name, response.data);

        } catch (error) {
            if (error.code === 'ECONNABORTED') throw new Error('Timeout');
            throw new Error(error.message);
        }
    }

    processAPIResponse(apiName, data) {
        try {
            let mediaItems = [];

            switch (apiName) {
                case 'cobalt':
                    // Cobalt devuelve 'picker' para carruseles o 'url' directa para single
                    if (data.status === 'picker' && data.picker) {
                        mediaItems = data.picker.map((item, index) => ({
                            url: item.url,
                            type: item.type === 'video' ? 'video' : 'image',
                            index: index + 1
                        }));
                    } else if (['stream', 'redirect', 'success'].includes(data.status) && data.url) {
                        mediaItems.push({
                            url: data.url,
                            type: this.determineMediaType(data.url), // Cobalt a veces no dice el tipo explícitamente en singles
                            index: 1
                        });
                    }
                    break;

                case 'siputz':
                    // Estructura: data.data [ { url: '...' } ]
                    if (data.status && data.data) {
                        const items = Array.isArray(data.data) ? data.data : [data.data];
                        mediaItems = items.map((item, index) => ({
                            url: item.url,
                            type: this.determineMediaType(item.url),
                            index: index + 1
                        }));
                    }
                    break;

                case 'alyachan':
                     // Estructura: data.result []
                     if (data.status && data.data) {
                        mediaItems = data.data.map((item, index) => ({
                            url: item.url,
                            type: item.type === 'video' ? 'video' : 'image',
                            index: index + 1
                        }));
                    }
                    break;
            }

            // Limpieza final
            mediaItems = mediaItems.filter(item => item.url && item.url.startsWith('http'));

            if (mediaItems.length > 0) {
                return { 
                    mediaItems, 
                    type: mediaItems.length > 1 ? 'multiple' : 'single',
                    totalItems: mediaItems.length
                };
            }

        } catch (error) {
            console.error(`❌ Error parseando respuesta de ${apiName}:`, error);
        }
        return null;
    }

    determineMediaType(url) {
        if (!url) return 'image';
        const ext = url.split(/[#?]/)[0].split('.').pop().trim().toLowerCase();
        // Detectar extensiones de video comunes
        if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
        // Si no tiene extensión clara, intentamos adivinar por keywords en la URL (común en CDNs de FB/IG)
        if (url.includes('.mp4') || url.includes('video')) return 'video';
        return 'image';
    }

    async downloadMedia(mediaUrl) {
        try {
            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': this.userAgent
                }
            });

            return {
                buffer: Buffer.from(response.data),
                size: response.data.length
            };

        } catch (error) {
            throw new Error(`Error descargando media: ${error.message}`);
        }
    }
}

const instagramPostsService = new InstagramPostsService();

export async function igpostsCommand(sock, m, args) {    
    try {
        let postUrl = args[0];
        let selectedIndex = null;

        // 1. Lógica para detectar si hay un número (selección de carrusel)
        if (args.length >= 2 && !isNaN(args[0])) {
            selectedIndex = parseInt(args[0]);
            postUrl = args[1];
        }

        // 2. Lógica para detectar URL en mensaje citado (reply)
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
                text: `❌ *Uso correcto:*\n\n_Para post único o carrusel entero:_\n▸ #post _link_\n\n_Para post específico de un carrusel:_\n▸ #post *numero* _link_` 
            }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { react: { text: "⏳", key: m.key } });

        const postInfo = await instagramPostsService.downloadPost(postUrl);
        const totalItems = postInfo.mediaItems.length;

        // CASO A: Selección específica
        if (selectedIndex !== null) {
            if (selectedIndex < 1 || selectedIndex > totalItems) {
                await sock.sendMessage(m.key.remoteJid, { 
                    text: `❌ El post solo tiene ${totalItems} elementos.` 
                }, { quoted: m });
                return;
            }
            
            const item = postInfo.mediaItems[selectedIndex - 1];
            const media = await instagramPostsService.downloadMedia(item.url);
            
            const caption = `Carrusel descargado! (${selectedIndex}/${totalItems})`;
            
            await sock.sendMessage(m.key.remoteJid, {
                [item.type]: media.buffer,
                caption: caption
            }, { quoted: m });
            
            await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });
            return;
        }

        // CASO B: Descarga automática
        for (let i = 0; i < totalItems; i++) {
            const item = postInfo.mediaItems[i];
            
            try {
                const media = await instagramPostsService.downloadMedia(item.url);
                
                let caption = "";
                if (i === 0) {
                    if (totalItems === 1) {
                        caption = "Post descargado!";
                    } else {
                        caption = `Carrusel descargado! (${totalItems} posts)`;
                    }
                }

                await sock.sendMessage(m.key.remoteJid, {
                    [item.type]: media.buffer,
                    caption: caption || undefined
                }, { quoted: m });
                
                if (totalItems > 1) await new Promise(r => setTimeout(r, 1000));

            } catch (e) {
                console.log(`Error enviando item ${i+1}: ${e.message}`);
            }
        }
        
        await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error(error);
        await sock.sendMessage(m.key.remoteJid, { 
            text: `❌ Error: ${error.message}` 
        }, { quoted: m });
    }
}
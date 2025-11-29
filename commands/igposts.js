import axios from 'axios';

class InstagramPostsService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        
        // 🔄 LISTA DE APIS ACTUALIZADA (Nov 2025)
        // Estas APIs son públicas y actualmente no requieren API Key estricta
        this.apis = [
            {
                name: 'delirius',
                url: 'https://delirius-apiofc.vercel.app/download/instagram',
                method: 'get'
            },
            {
                name: 'agatz',
                url: 'https://api.agatz.xyz/api/instagram',
                method: 'get'
            },
            {
                name: 'widipe',
                url: 'https://widipe.com.pl/api/igdl',
                method: 'get'
            }
        ];
    }

    isValidInstagramUrl(url) {
        // Regex mejorado para aceptar más variantes de enlaces (share, stories, etc)
        const regex = /https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/([A-Za-z0-9_-]+)/;
        return regex.test(url);
    }

    async downloadPost(postUrl) {
        console.log('🔗 Procesando post:', postUrl);

        if (!this.isValidInstagramUrl(postUrl)) {
            throw new Error('URL de Instagram no válida');
        }

        // Limpieza de URL para evitar errores con parámetros de rastreo (?igshid=...)
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
                console.log(`⚠️ ${api.name} falló o no devolvió datos:`, error.message);
                // Si no es la última API, esperamos un poco antes de probar la siguiente
                if (api !== this.apis[this.apis.length - 1]) {
                    await new Promise(resolve => setTimeout(resolve, 500)); 
                }
                continue;
            }
        }

        throw new Error('Todas las APIs fallaron. Intenta más tarde o verifica el enlace.');
    }

    async tryAPI(api, postUrl) {
        try {
            let response;
            const fullUrl = this.buildAPIUrl(api, postUrl);
            console.log(`📡 Request a: ${api.name}`);

            const timeout = 15000; // Reduje el timeout a 15s para rotar más rápido si falla

            response = await axios.get(fullUrl, {
                headers: { 
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json' 
                },
                timeout: timeout
            });

            return this.processAPIResponse(api.name, response.data);

        } catch (error) {
            if (error.code === 'ECONNABORTED') throw new Error('Timeout');
            throw new Error(error.message);
        }
    }

    buildAPIUrl(api, postUrl) {
        const url = new URL(api.url);
        url.searchParams.append('url', postUrl);
        return url.toString();
    }

    processAPIResponse(apiName, data) {
        try {
            let mediaItems = [];

            switch (apiName) {
                case 'delirius':
                    // Estructura usual: data.data [ { type: 'image', url: '...' } ]
                    if (data.data && Array.isArray(data.data)) {
                        mediaItems = data.data.map((item, index) => ({
                            url: item.url,
                            type: item.type === 'video' ? 'video' : 'image',
                            index: index + 1
                        }));
                    } else if (data.data && data.data.url) {
                         // A veces devuelve un solo objeto
                        mediaItems.push({
                            url: data.data.url,
                            type: data.data.type === 'video' ? 'video' : 'image',
                            index: 1
                        });
                    }
                    break;

                case 'agatz':
                    // Estructura usual: data.data [ { url: '...', mime_type: '...' } ]
                    if (data.data && Array.isArray(data.data)) {
                        mediaItems = data.data.map((item, index) => ({
                            url: item.url,
                            type: item.mime_type && item.mime_type.includes('video') ? 'video' : 'image',
                            index: index + 1
                        }));
                    }
                    break;

                case 'widipe':
                    // Estructura usual: result.url (array o string)
                    if (data.result && data.result.url) {
                        const urls = Array.isArray(data.result.url) ? data.result.url : [data.result.url];
                        mediaItems = urls.map((url, index) => ({
                            url: url,
                            type: this.determineMediaType(url), // Widipe a veces no da el tipo, lo inferimos
                            index: index + 1
                        }));
                    } else if (data.url) {
                         // Formato alternativo de widipe
                         mediaItems.push({
                            url: data.url,
                            type: this.determineMediaType(data.url),
                            index: 1
                         });
                    }
                    break;
            }

            // Filtrado final de seguridad para evitar items vacíos
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
        if (!url) return 'image'; // Default a imagen si falla
        const ext = url.split(/[#?]/)[0].split('.').pop().trim().toLowerCase();
        if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
        return 'image';
    }

    async downloadMedia(mediaUrl) {
        try {
            // console.log('📥 Descargando buffer...'); 
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

    validateMediaBuffer(buffer, expectedType) {
        if (!buffer || buffer.length === 0) throw new Error('Buffer vacío');
        // Validación básica de tamaño (videos suelen ser > 50kb, imagenes > 5kb)
        if (buffer.length < 1000) throw new Error('Archivo demasiado pequeño, posible error');
        return true;
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
                text: `❌ *Uso correcto:*\n#post <link>\n#post <numero> <link>` 
            }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { react: { text: "⏳", key: m.key } });

        // 3. Descargamos la información del post
        const postInfo = await instagramPostsService.downloadPost(postUrl);
        const totalItems = postInfo.mediaItems.length;

        // CASO A: Selección específica (Ej: #post 2 <link>)
        if (selectedIndex !== null) {
            if (selectedIndex < 1 || selectedIndex > totalItems) {
                await sock.sendMessage(m.key.remoteJid, { 
                    text: `❌ El post solo tiene ${totalItems} elementos.` 
                }, { quoted: m });
                return;
            }
            
            const item = postInfo.mediaItems[selectedIndex - 1];
            const media = await instagramPostsService.downloadMedia(item.url);
            
            // MENSAJE PERSONALIZADO 1: Selección específica
            const caption = `Carrusel descargado! (${selectedIndex}/${totalItems})`;
            
            await sock.sendMessage(m.key.remoteJid, {
                [item.type]: media.buffer,
                caption: caption
            }, { quoted: m });
            
            await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });
            return;
        }

        // CASO B: Descarga automática (Todo el post o post único)
        for (let i = 0; i < totalItems; i++) {
            const item = postInfo.mediaItems[i];
            
            try {
                const media = await instagramPostsService.downloadMedia(item.url);
                
                // LÓGICA DE MENSAJES PERSONALIZADOS
                let caption = "";

                // Solo ponemos caption en el primer elemento enviado
                if (i === 0) {
                    if (totalItems === 1) {
                        // MENSAJE PERSONALIZADO 2: Post único
                        caption = "Post descargado!";
                    } else {
                        // MENSAJE PERSONALIZADO 3: Carrusel completo (primera foto)
                        caption = `Carrusel descargado! (${totalItems} posts)`;
                    }
                }

                await sock.sendMessage(m.key.remoteJid, {
                    [item.type]: media.buffer,
                    caption: caption || undefined // undefined hace que no envíe texto en las siguientes fotos
                }, { quoted: m });
                
                // Pausa pequeña para no saturar si son muchas fotos
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
import axios from 'axios';

class InstagramPostsService {
    constructor() {
        // Headers que imitan un navegador real para evitar el 403 Forbidden
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://cobalt.tools',
            'Referer': 'https://cobalt.tools/'
        };

        // 🔄 LISTA DE APIS (Ordenadas por estabilidad Enero 2026)
        this.apis = [
            // 1. Vreden (Scraper muy robusto para carruseles)
            {
                name: 'vreden',
                url: 'https://api.vreden.web.id/api/ig',
                method: 'GET'
            },
            // 2. GuruAPI (Clásico confiable)
            {
                name: 'guru',
                url: 'https://api.guruapi.tech/dl/ig', 
                method: 'GET'
            },
            // 3. Cobalt (Configuración corregida para evitar 403)
            {
                name: 'cobalt',
                url: 'https://api.cobalt.tools/api/json',
                method: 'POST'
            }
        ];
    }

    // Limpia la URL de parámetros de seguimiento que rompen las APIs
    cleanUrl(url) {
        try {
            const urlObj = new URL(url);
            // Mantenemos solo el path base (ej: /p/CODIGO/)
            return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
        } catch (e) {
            return url.split('?')[0];
        }
    }

    isValidInstagramUrl(url) {
        const regex = /https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/(p|reel|tv|stories)\/[A-Za-z0-9_-]+/;
        return regex.test(url);
    }

    async downloadPost(rawUrl) {
        console.log('🔗 URL Original:', rawUrl);
        
        if (!this.isValidInstagramUrl(rawUrl)) {
            throw new Error('URL inválida.');
        }

        const cleanUrl = this.cleanUrl(rawUrl);
        console.log('🧹 URL Limpia:', cleanUrl);

        let lastError = null;

        for (const api of this.apis) {
            try {
                console.log(`🔄 Intentando con: ${api.name}`);
                const result = await this.tryAPI(api, cleanUrl);
                
                if (result && result.mediaItems.length > 0) {
                    console.log(`✅ Éxito con ${api.name}: ${result.mediaItems.length} archivos`);
                    return result;
                }
            } catch (error) {
                console.log(`⚠️ Falló ${api.name}: ${error.message}`);
                lastError = error;
                // Pequeña pausa entre intentos para no saturar red
                await new Promise(r => setTimeout(r, 500));
            }
        }

        throw new Error(`Todas las APIs fallaron. Último error: ${lastError?.message || 'Desconocido'}`);
    }

    async tryAPI(api, url) {
        const timeout = 15000; // 15 segundos máximo por API

        try {
            let response;
            
            if (api.name === 'cobalt') {
                // Cobalt requiere POST con headers específicos
                response = await axios.post(api.url, {
                    url: url,
                    filenamePattern: "basic"
                }, {
                    headers: {
                        ...this.headers,
                        'Content-Type': 'application/json'
                    },
                    timeout
                });
            } else {
                // APIs GET (Vreden/Guru)
                response = await axios.get(api.url, {
                    params: { url: url }, // Axios se encarga de encodear
                    headers: {
                        'User-Agent': this.headers['User-Agent']
                    },
                    timeout
                });
            }

            return this.processResponse(api.name, response.data);

        } catch (error) {
            // Manejo específico de errores HTTP
            if (error.response) {
                throw new Error(`Status ${error.response.status}`);
            } else if (error.request) {
                throw new Error('Sin respuesta del servidor');
            } else {
                throw new Error(error.message);
            }
        }
    }

    processResponse(apiName, data) {
        let mediaItems = [];

        try {
            switch (apiName) {
                case 'vreden':
                    // Estructura: { result: [ { url, _type } ] }
                    if (data.result && Array.isArray(data.result)) {
                        mediaItems = data.result.map(item => ({
                            url: item.url,
                            type: item.url.includes('.mp4') ? 'video' : 'image'
                        }));
                    }
                    break;

                case 'guru':
                    // Estructura: { urls: [ { url, type: 'mp4'/'jpg' } ] }
                    if (data.urls && Array.isArray(data.urls)) {
                        mediaItems = data.urls.map(item => ({
                            url: item.url,
                            type: item.type === 'mp4' ? 'video' : 'image'
                        }));
                    } else if (data.url_list) {
                         mediaItems = data.url_list.map(url => ({
                            url: url,
                            type: url.includes('.mp4') ? 'video' : 'image'
                        }));
                    }
                    break;

                case 'cobalt':
                    // Cobalt v7/v10 Structure
                    if (data.status === 'picker' && data.picker) {
                        mediaItems = data.picker.map(item => ({
                            url: item.url,
                            type: item.type === 'video' ? 'video' : 'image'
                        }));
                    } else if (['stream', 'redirect', 'success'].includes(data.status) && data.url) {
                        mediaItems.push({
                            url: data.url,
                            type: this.guessType(data.url)
                        });
                    }
                    break;
            }

            // Filtrado final de seguridad
            mediaItems = mediaItems.filter(m => m.url && m.url.startsWith('http'));

            if (mediaItems.length > 0) {
                return {
                    mediaItems,
                    total: mediaItems.length,
                    isCarousel: mediaItems.length > 1
                };
            }
        } catch (e) {
            console.error(`Error parseando ${apiName}:`, e);
        }
        throw new Error('Respuesta de API vacía o estructura desconocida');
    }

    guessType(url) {
        return (url.includes('.mp4') || url.includes('video')) ? 'video' : 'image';
    }

    // Descarga el buffer final para enviarlo a WhatsApp
    async downloadMediaBuffer(url) {
        const res = await axios.get(url, { 
            responseType: 'arraybuffer',
            headers: { 'User-Agent': this.headers['User-Agent'] },
            timeout: 30000 
        });
        return Buffer.from(res.data);
    }
}

const service = new InstagramPostsService();

export async function igpostsCommand(sock, m, args) {    
    const remoteJid = m.key.remoteJid;

    try {
        // 1. Obtención de URL (Argumento o Respuesta)
        let postUrl = args[0];
        let indexSelect = null;

        // Soporte para comando: #post 2 <link>
        if (args.length >= 2 && !isNaN(args[0])) {
            indexSelect = parseInt(args[0]);
            postUrl = args[1];
        }

        // Soporte para responder a mensajes
        if (!postUrl && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedText = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation || 
                             m.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text;
            if (quotedText) {
                const match = quotedText.match(/https?:\/\/(www\.)?instagram\.com\/[^\s]+/);
                if (match) postUrl = match[0];
            }
        }

        if (!postUrl) {
            await sock.sendMessage(remoteJid, { text: "❌ *Error:* Faltó el link de Instagram." }, { quoted: m });
            return;
        }

        await sock.sendMessage(remoteJid, { react: { text: "⏳", key: m.key } });

        // 2. Proceso de descarga
        const postData = await service.downloadPost(postUrl);
        const total = postData.total;

        // CASO A: Usuario pidió un número específico (ej: #post 2 link)
        if (indexSelect !== null) {
            if (indexSelect < 1 || indexSelect > total) {
                await sock.sendMessage(remoteJid, { text: `❌ Ese post solo tiene ${total} archivos.` }, { quoted: m });
                return;
            }
            const item = postData.mediaItems[indexSelect - 1];
            const buffer = await service.downloadMediaBuffer(item.url);
            
            await sock.sendMessage(remoteJid, {
                [item.type]: buffer,
                caption: `📄 Archivo ${indexSelect} de ${total}`
            }, { quoted: m });
            
            await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });
            return;
        }

        // CASO B: Descarga automática
        // Si son más de 4, preguntamos (opcional, aquí descargamos todo por defecto)
        
        for (let i = 0; i < total; i++) {
            const item = postData.mediaItems[i];
            
            try {
                const buffer = await service.downloadMediaBuffer(item.url);
                
                // Mensaje solo en el primero
                let caption = "";
                if (i === 0) caption = total > 1 ? `📦 Pack descargado (${total} archivos)` : "Instagram Post";

                await sock.sendMessage(remoteJid, {
                    [item.type]: buffer,
                    caption: caption || undefined
                }, { quoted: m });

                // Anti-Flood: Pausa si hay muchos archivos
                if (total > 1) await new Promise(r => setTimeout(r, 1500));

            } catch (mediaError) {
                console.error(`Error enviando archivo ${i+1}:`, mediaError);
            }
        }

        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error("IG ERROR:", error);
        await sock.sendMessage(remoteJid, { 
            text: `❌ Error al descargar.\nIntenta de nuevo o verifica que el perfil sea público.` 
        }, { quoted: m });
    }
}
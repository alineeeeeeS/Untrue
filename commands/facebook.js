import axios from 'axios';

class FacebookService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        
        // ?? LISTA DE APIS REEMPLAZADA (Actualizada tras ca赤da de Widipe)
        this.apis = [
            {
                name: 'ryzendesu',
                url: 'https://api.ryzendesu.vip/api/downloader/fbdown',
                method: 'get'
            },
            {
                name: 'siputzx',
                url: 'https://api.siputzx.my.id/api/d/facebook',
                method: 'get'
            },
            {
                name: 'vreden',
                url: 'https://api.vreden.my.id/api/fbdown',
                method: 'get'
            }
        ];
    }

    isValidFacebookUrl(url) {
        // Regex mejorado para soportar los nuevos enlaces "share" y "reel"
        const regex = /(https?:\/\/)?(www\.|web\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch|me)\/(?:(?:\w\.)*\/)?(?:(pages\/)?(?:[\w\-\.]*\/)?(?:profile\.php\?id=(?=\d.*))?([\w\-\.]*)|share\/v\/|reel\/)/;
        return regex.test(url);
    }

    async downloadVideo(fbUrl) {
        // Limpiamos la URL de par芍metros de seguimiento basura
        let cleanUrl = fbUrl.trim();
        
        console.log('?? Procesando URL:', cleanUrl);

        if (!this.isValidFacebookUrl(cleanUrl)) {
            throw new Error('URL de Facebook no v芍lida');
        }

        // ?? ROTACI車N DE APIS
        for (const api of this.apis) {
            try {
                console.log(`?? Probando API: ${api.name}`);
                const result = await this.tryAPI(api, cleanUrl);
                
                if (result && result.url) {
                    console.log(`? 谷xito con ${api.name} (${result.quality})`);
                    return result;
                }
            } catch (error) {
                console.log(`?? ${api.name} fall車:`, error.message);
                
                // Peque?a pausa entre intentos para no saturar
                if (api !== this.apis[this.apis.length - 1]) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
                continue;
            }
        }

        throw new Error('Todas las APIs fallaron. El video puede ser privado o el enlace share ha expirado.');
    }

    async tryAPI(api, url) {
        try {
            let response;
            const apiUrl = new URL(api.url);
            apiUrl.searchParams.append('url', url);

            // Timeout de 20s para dar tiempo a procesar videos largos
            const config = {
                headers: { 'User-Agent': this.userAgent },
                timeout: 20000 
            };

            response = await axios.get(apiUrl.toString(), config);
            return this.processAPIResponse(api.name, response.data);

        } catch (error) {
            if (error.code === 'ECONNABORTED') throw new Error('Timeout (La API tard車 demasiado)');
            if (error.response?.status === 403) throw new Error('Acceso denegado (IP Bloqueada)');
            if (error.response?.status === 500) throw new Error('Error interno de la API');
            throw new Error(error.message);
        }
    }

    processAPIResponse(apiName, data) {
        try {
            let videoUrl = null;
            let quality = 'SD';

            switch (apiName) {
                case 'ryzendesu':
                    // Ryzendesu devuelve { success: true, url: [ { resolution: "HD", url: "..." } ] } o similar
                    // Estructura actual: data.url o data.data con resoluciones
                    if (data.url && Array.isArray(data.url)) {
                        const hd = data.url.find(v => v.resolution?.includes('720') || v.type === 'hd');
                        const sd = data.url.find(v => v.resolution?.includes('480') || v.type === 'sd');
                        videoUrl = hd ? hd.url : (sd ? sd.url : data.url[0].url);
                        quality = hd ? 'HD' : 'SD';
                    } else if (data.data) {
                         // Formato alternativo
                         videoUrl = data.data.hd || data.data.sd;
                         quality = data.data.hd ? 'HD' : 'SD';
                    } else if (data.hd || data.sd) {
                         videoUrl = data.hd || data.sd;
                         quality = data.hd ? 'HD' : 'SD';
                    }
                    break;

                case 'siputzx':
                    // Siputzx data.data [ { url: "...", quality: "HD" } ]
                    if (data.data && Array.isArray(data.data)) {
                        const hd = data.data.find(v => v.quality === 'HD');
                        const sd = data.data.find(v => v.quality === 'SD');
                        videoUrl = hd ? hd.url : (sd ? sd.url : data.data[0].url);
                        quality = hd ? 'HD' : 'SD';
                    }
                    break;

                case 'vreden':
                    // Vreden data.result { url: "..." }
                    if (data.result) {
                        videoUrl = data.result.url || data.result.hd || data.result.sd;
                    }
                    break;
            }

            // Validaci車n final: que sea una URL v芍lida
            if (videoUrl && videoUrl.startsWith('http')) {
                return { url: videoUrl, quality };
            }

        } catch (error) {
            console.error(`? Error parseando respuesta de ${apiName}:`, error);
        }
        return null;
    }

    async downloadMedia(mediaUrl) {
        try {
            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'arraybuffer',
                timeout: 60000,
                maxContentLength: 100 * 1024 * 1024, // 100MB L赤mite
                headers: {
                    'User-Agent': this.userAgent,
                    // Referer a veces ayuda a que Facebook no rechace la descarga directa
                    'Referer': 'https://www.facebook.com/'
                }
            });

            return {
                buffer: Buffer.from(response.data),
                size: response.data.length
            };

        } catch (error) {
            if (error.code === 'ERR_Body_Length_>_MaxContentLength') {
                throw new Error('El video es demasiado pesado (>100MB)');
            }
            throw new Error(`Error en descarga directa: ${error.message}`);
        }
    }
}

const facebookService = new FacebookService();

export async function facebookCommand(sock, m, args) {
    try {
        let fbUrl = args[0];

        // Detecci車n de URL en respuesta
        if (!fbUrl && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedText = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation || 
                             m.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text;
            if (quotedText) {
                const urlMatch = quotedText.match(/https?:\/\/[^\s]+/g);
                if (urlMatch) {
                    for (const url of urlMatch) {
                        if (facebookService.isValidFacebookUrl(url)) {
                            fbUrl = url;
                            break;
                        }
                    }
                }
            }
        }

        if (!fbUrl) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: '? *Uso correcto:*\n#fb <enlace del video>' 
            }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { react: { text: "?", key: m.key } });

        // 1. Obtener URL directa del video
        const videoInfo = await facebookService.downloadVideo(fbUrl);
        
        // 2. Descargar el archivo
        const media = await facebookService.downloadMedia(videoInfo.url);

        // 3. Enviar
        await sock.sendMessage(m.key.remoteJid, {
            video: media.buffer,
            caption: `?? Video descargado!`, // Mensaje limpio como pediste
            mimetype: 'video/mp4'
        }, { quoted: m });

        await sock.sendMessage(m.key.remoteJid, { react: { text: "?", key: m.key } });

    } catch (error) {
        console.error(error);
        
        let msg = '? *Error al descargar*';
        if (error.message.includes('pesado')) msg = '? El video pesa m芍s de 100MB.';
        if (error.message.includes('privado')) msg = '? Video privado o enlace caducado.';
        if (error.message.includes('APIs fallaron')) msg = '? No se pudo procesar este enlace espec赤fico.';
        
        await sock.sendMessage(m.key.remoteJid, { text: msg }, { quoted: m });
        await sock.sendMessage(m.key.remoteJid, { react: { text: "?", key: m.key } });
    }
}
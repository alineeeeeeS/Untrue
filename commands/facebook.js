import axios from 'axios';

class FacebookService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        
        // 🔄 LISTA DE APIS ACTUALIZADA (Nov 2025)
        // Estas APIs manejan mejor los cambios recientes de encriptación de FB
        this.apis = [
            {
                name: 'agatz',
                url: 'https://api.agatz.xyz/api/facebook',
                method: 'get'
            },
            {
                name: 'delirius',
                url: 'https://delirius-apiofc.vercel.app/download/facebook',
                method: 'get'
            },
            {
                name: 'widipe',
                url: 'https://widipe.com.pl/api/dl/fb',
                method: 'get'
            }
        ];
    }

    isValidFacebookUrl(url) {
        // Regex robusto para todo tipo de enlaces de FB
        const regex = /(https?:\/\/)?(www\.|web\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch|me)\/(?:(?:\w\.)*\/)?(?:(pages\/)?(?:[\w\-\.]*\/)?(?:profile\.php\?id=(?=\d.*))?([\w\-\.]*))?/;
        return regex.test(url);
    }

    // Función crucial: Facebook a veces da error si le pasas un link corto a las APIs
    // Esta función sigue la redirección para obtener el link final (ej: watch?v=...)
    async resolveFacebookUrl(url) {
        try {
            console.log('🔗 Resolviendo URL original:', url);
            const response = await axios.get(url, {
                maxRedirects: 10,
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Upgrade-Insecure-Requests': '1'
                },
                validateStatus: (status) => status < 400
            });
            // Si hubo redirección, usamos la URL final, si no, la original
            const finalUrl = response.request.res.responseUrl || url;
            return finalUrl;
        } catch (e) {
            // Si falla la resolución, devolvemos la URL original y rezamos para que la API la entienda
            console.log('⚠️ No se pudo resolver la redirección, usando URL original.');
            return url;
        }
    }

    async downloadVideo(fbUrl) {
        if (!this.isValidFacebookUrl(fbUrl)) {
            throw new Error('URL de Facebook no válida');
        }

        // Paso 1: Intentar "limpiar" la URL
        const cleanUrl = await this.resolveFacebookUrl(fbUrl);
        console.log('🔗 URL procesada:', cleanUrl);

        // Paso 2: Probar APIs en orden
        for (const api of this.apis) {
            try {
                console.log(`🔄 Probando API: ${api.name}`);
                const result = await this.tryAPI(api, cleanUrl);
                
                if (result && result.url) {
                    console.log(`✅ Éxito con ${api.name}`);
                    return result;
                }
            } catch (error) {
                console.log(`⚠️ ${api.name} falló:`, error.message);
                if (api !== this.apis[this.apis.length - 1]) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                continue;
            }
        }

        throw new Error('No se pudo descargar el video. Puede ser privado o de un grupo cerrado.');
    }

    async tryAPI(api, url) {
        try {
            const fullUrl = new URL(api.url);
            fullUrl.searchParams.append('url', url);

            const response = await axios.get(fullUrl.toString(), {
                headers: { 'User-Agent': this.userAgent },
                timeout: 15000
            });

            return this.processAPIResponse(api.name, response.data);

        } catch (error) {
            if (error.code === 'ECONNABORTED') throw new Error('Timeout');
            throw new Error(error.message);
        }
    }

    processAPIResponse(apiName, data) {
        try {
            let videoUrl = null;
            let quality = 'SD';

            switch (apiName) {
                case 'agatz':
                    // Agatz devuelve un objeto data con hd y sd
                    if (data.data) {
                        videoUrl = data.data.hd || data.data.sd;
                        quality = data.data.hd ? 'HD' : 'SD';
                    }
                    break;

                case 'delirius':
                    // Delirius suele devolver urls: [ { quality: 'hd', url: '...' } ]
                    if (data.data && Array.isArray(data.data.urls)) {
                        const hdVideo = data.data.urls.find(v => v.quality === 'hd');
                        const sdVideo = data.data.urls.find(v => v.quality === 'sd');
                        videoUrl = hdVideo ? hdVideo.url : (sdVideo ? sdVideo.url : data.data.urls[0].url);
                        quality = hdVideo ? 'HD' : 'SD';
                    } else if (data.data && data.data.url) {
                        // Formato simple alternativo
                        videoUrl = data.data.url.hd || data.data.url.sd || data.data.url;
                    }
                    break;

                case 'widipe':
                    // Widipe suele devolver { result: { url: "..." } }
                    if (data.result && data.result.url) {
                        videoUrl = data.result.url;
                    } else if (data.url) {
                        videoUrl = data.url;
                    }
                    break;
            }

            if (videoUrl) {
                return { url: videoUrl, quality };
            }

        } catch (error) {
            console.error(`❌ Error parseando ${apiName}:`, error);
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
                maxContentLength: 100 * 1024 * 1024, // Limite 100MB
                headers: {
                    'User-Agent': this.userAgent
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
            throw new Error(`Error descargando archivo: ${error.message}`);
        }
    }
}

const facebookService = new FacebookService();

export async function facebookCommand(sock, m, args) {
    try {
        let fbUrl = args[0];

        // Lógica de mensaje citado (igual que antes)
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
                text: '❌ *Uso correcto:*\n#fb <enlace del video>\n\nEjemplo:\n#fb https://www.facebook.com/watch?v=...' 
            }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { react: { text: "⏳", key: m.key } });

        // 1. Obtener Info y URL del video
        const videoInfo = await facebookService.downloadVideo(fbUrl);
        
        // 2. Descargar el buffer del video
        const media = await facebookService.downloadMedia(videoInfo.url);

        // 3. Enviar
        await sock.sendMessage(m.key.remoteJid, {
            video: media.buffer,
            caption: `🎬 Video de Facebook descargado (${videoInfo.quality})`,
            mimetype: 'video/mp4'
        }, { quoted: m });

        await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error(error);
        
        let msg = '❌ *Error al descargar*';
        if (error.message.includes('pesado')) msg = '❌ El video pesa más de 100MB, no puedo enviarlo.';
        if (error.message.includes('privado')) msg = '❌ El video parece ser privado o de un grupo cerrado.';
        
        await sock.sendMessage(m.key.remoteJid, { text: msg }, { quoted: m });
    }
}
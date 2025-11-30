import axios from 'axios';

class FacebookService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
        
        // ?? LISTA DE APIS "ANTIBLOQUEO" (Nov 2025)
        // Seleccionadas especificamente porque NO suelen bloquear IPs de Railway/Hosting
        this.apis = [
            {
                name: 'Jojo (Vercel)', 
                // Esta API esta en Vercel, por lo que suele aceptar peticiones de Railway sin problemas
                url: 'https://jo-jo-api.vercel.app/api/fb',
                method: 'get',
                param: 'url'
            },
            {
                name: 'Dark-Yasiya',
                // API muy robusta para enlaces "share"
                url: 'https://www.dark-yasiya.wzt.cz/api/facebook',
                method: 'get',
                param: 'url'
            },
            {
                name: 'Ario',
                url: 'https://api.ario.my.id/api/downloader/fb',
                method: 'get',
                param: 'url'
            },
            {
                name: 'Publer (Backup)',
                url: 'https://api.siputzx.my.id/api/d/facebook',
                method: 'get',
                param: 'url'
            }
        ];
    }

    isValidFacebookUrl(url) {
        // Regex permisivo para aceptar cualquier variante de FB
        return /(https?:\/\/)?(www\.|web\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch|me)/i.test(url);
    }

    async downloadVideo(fbUrl) {
        // Limpieza basica de URL (quitamos espacios y tracks)
        let targetUrl = fbUrl.trim();
        
        // Truco: Si es un enlace 'share', a veces ayuda pasarlo a mbasic string, 
        // pero NO intentamos resolverlo por red para evitar bloqueo de IP.
        console.log('?? Procesando URL:', targetUrl);

        for (const api of this.apis) {
            try {
                console.log(`?? Probando API: ${api.name}`);
                const result = await this.tryAPI(api, targetUrl);
                
                if (result && result.url) {
                    console.log(`? Exito con ${api.name} (${result.quality})`);
                    return result;
                }
            } catch (error) {
                console.log(`?? ${api.name} fallo: ${error.message}`);
                // Pausa de seguridad de 1 segundo entre intentos
                if (api !== this.apis[this.apis.length - 1]) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                continue;
            }
        }

        throw new Error('Servidores saturados o IP bloqueada temporalmente.');
    }

    async tryAPI(api, url) {
        try {
            const apiUrl = new URL(api.url);
            apiUrl.searchParams.append(api.param, url);

            const response = await axios.get(apiUrl.toString(), {
                headers: { 
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                },
                timeout: 25000 // 25s timeout
            });

            return this.processAPIResponse(api.name, response.data);

        } catch (error) {
            // Filtramos errores comunes para limpiar logs
            if (error.code === 'ECONNABORTED') throw new Error('Timeout');
            if (error.response?.status === 403) throw new Error('IP Bloqueada por la API');
            if (error.response?.status === 530) throw new Error('Error de Servidor (Cloudflare)');
            throw new Error(error.message);
        }
    }

    processAPIResponse(apiName, data) {
        try {
            let videoUrl = null;
            let quality = 'SD';

            switch (apiName) {
                case 'Jojo (Vercel)':
                    // Estructura: { result: { mp4: "...", key: "..." } }
                    if (data.result && data.result.mp4) {
                        videoUrl = data.result.mp4;
                        quality = 'SD'; // Jojo suele dar SD por defecto
                    }
                    break;

                case 'Dark-Yasiya':
                    // Estructura: { result: { sd: "...", hd: "..." } }
                    if (data.result) {
                        videoUrl = data.result.hd || data.result.sd || data.result.url;
                        quality = data.result.hd ? 'HD' : 'SD';
                    }
                    break;

                case 'Ario':
                    // Estructura: { result: { hd: "...", sd: "..." } }
                    if (data.result) {
                        videoUrl = data.result.hd || data.result.sd;
                        quality = data.result.hd ? 'HD' : 'SD';
                    }
                    break;

                case 'Publer (Backup)':
                     if (data.data && Array.isArray(data.data)) {
                        const hd = data.data.find(v => v.quality === 'HD');
                        const sd = data.data.find(v => v.quality === 'SD');
                        videoUrl = hd ? hd.url : (sd ? sd.url : data.data[0].url);
                        quality = hd ? 'HD' : 'SD';
                    }
                    break;
            }

            if (videoUrl && videoUrl.startsWith('http')) {
                return { url: videoUrl, quality };
            }

        } catch (error) {
            console.error(`? Error parseando ${apiName}:`, error.message);
        }
        return null;
    }

    async downloadMedia(mediaUrl) {
        try {
            console.log('?? Descargando archivo final...');
            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'arraybuffer',
                timeout: 60000,
                maxContentLength: 100 * 1024 * 1024, // 100MB
                headers: {
                    'User-Agent': this.userAgent,
                    'Referer': 'https://www.facebook.com/',
                    'Origin': 'https://www.facebook.com',
                    'Sec-Fetch-Dest': 'video',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'cross-site'
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

        // Logica de mensaje citado
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

        // 1. Obtener URL directa
        const videoInfo = await facebookService.downloadVideo(fbUrl);
        
        // 2. Descargar buffer
        const media = await facebookService.downloadMedia(videoInfo.url);

        // 3. Enviar
        await sock.sendMessage(m.key.remoteJid, {
            video: media.buffer,
            caption: `?? Video descargado!`,
            mimetype: 'video/mp4'
        }, { quoted: m });

        await sock.sendMessage(m.key.remoteJid, { react: { text: "?", key: m.key } });

    } catch (error) {
        console.error('? Error FB Command:', error);
        
        let msg = '? *No se pudo descargar*';
        if (error.message.includes('pesado')) msg = '? El video pesa mas de 100MB.';
        if (error.message.includes('saturados')) msg = '? Servicios ocupados, intenta en unos minutos.';
        
        await sock.sendMessage(m.key.remoteJid, { text: msg }, { quoted: m });
        await sock.sendMessage(m.key.remoteJid, { react: { text: "?", key: m.key } });
    }
}
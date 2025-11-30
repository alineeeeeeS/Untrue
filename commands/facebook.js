import axios from 'axios';

class FacebookService {
    constructor() {
        // User-Agent moderno para evitar bloqueos de FB
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
        
        // LISTA DE APIS ACTUALIZADA (Nov 2025)
        // Prioridad 1: BK9 (Según tu recomendación y docs oficiales)
        // Prioridad 2: Agatz (Respaldo sólido)
        this.apis = [
            {
                name: 'BK9 API', 
                url: 'https://bk9.fun/downloader/facebook', // A veces usan .dev o .fun, .fun es la estable actual
                method: 'get',
                param: 'url'
            },
            {
                name: 'Agatz API',
                url: 'https://api.agatz.xyz/api/facebook',
                method: 'get',
                param: 'url'
            },
            {
                name: 'Vreden API',
                url: 'https://api.vreden.web.id/api/fbdown',
                method: 'get',
                param: 'url'
            }
        ];
    }

    isValidFacebookUrl(url) {
        return /(https?:\/\/)?(www\.|web\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch|me)/i.test(url);
    }

    async downloadVideo(fbUrl) {
        let targetUrl = fbUrl.trim();
        console.log('?? Procesando URL:', targetUrl);

        for (const api of this.apis) {
            try {
                console.log(`?? Probando API: ${api.name}`);
                const result = await this.tryAPI(api, targetUrl);
                
                if (result && result.url) {
                    console.log(`? Éxito con ${api.name} (${result.quality})`);
                    return result;
                }
            } catch (error) {
                console.log(`?? ${api.name} falló: ${error.message}`);
                // Si es la última API, lanzamos el error general
                if (api === this.apis[this.apis.length - 1]) {
                     throw new Error('Todas las APIs fallaron. Intenta más tarde.');
                }
                // Pequeña pausa de seguridad
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    async tryAPI(api, url) {
        try {
            // Construcción segura de la URL con parámetros
            const apiUrl = new URL(api.url);
            apiUrl.searchParams.append(api.param, url);

            const response = await axios.get(apiUrl.toString(), {
                headers: { 
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                },
                timeout: 15000 // 15s timeout
            });

            return this.processAPIResponse(api.name, response.data);

        } catch (error) {
            // Manejo de errores específicos para limpiar logs
            if (error.code === 'ECONNABORTED') throw new Error('Tiempo de espera agotado (Timeout)');
            if (error.code === 'ENOTFOUND') throw new Error('Servidor caído o dominio inexistente');
            if (error.response?.status === 404) throw new Error('API ruta no encontrada (404)');
            if (error.response?.status === 500) throw new Error('Error interno de la API');
            throw new Error(error.message);
        }
    }

    processAPIResponse(apiName, data) {
        try {
            let videoUrl = null;
            let quality = 'SD';

            // Parseo específico para cada API
            switch (apiName) {
                case 'BK9 API':
                    // Estructura BK9: { status: true, BK9: { HD: "...", SD: "..." } }
                    if (data.status && data.BK9) {
                        videoUrl = data.BK9.HD || data.BK9.SD;
                        quality = data.BK9.HD ? 'HD' : 'SD';
                    }
                    break;

                case 'Agatz API':
                    // Estructura Agatz: { status: 200, data: { hd: "...", sd: "..." } }
                    if (data.data) {
                        videoUrl = data.data.hd || data.data.sd;
                        quality = data.data.hd ? 'HD' : 'SD';
                    }
                    break;

                case 'Vreden API':
                    // Estructura Vreden: { status: true, result: { url: "..." } }
                    if (data.result) {
                        videoUrl = data.result.url || data.result.hd || data.result.sd;
                        quality = 'SD'; // Vreden suele dar SD
                    }
                    break;
            }

            if (videoUrl && videoUrl.startsWith('http')) {
                return { url: videoUrl, quality };
            }

        } catch (error) {
            console.error(`? Error procesando respuesta de ${apiName}:`, error.message);
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
                maxContentLength: 90 * 1024 * 1024, // Limite seguro de 90MB para WhatsApp
                headers: {
                    'User-Agent': this.userAgent,
                    // IMPORTANTE: No enviar Referer de Facebook si el link viene de una CDN externa
                }
            });

            return {
                buffer: Buffer.from(response.data),
                size: response.data.length
            };

        } catch (error) {
            if (error.code === 'ERR_Body_Length_>_MaxContentLength') {
                throw new Error('El video pesa más de 90MB y WhatsApp no lo permitirá.');
            }
            if (error.response?.status === 403) {
                throw new Error('Enlace de descarga caducado (403). Intenta de nuevo.');
            }
            throw new Error(`Fallo en descarga: ${error.message}`);
        }
    }
}

const facebookService = new FacebookService();

export async function facebookCommand(sock, m, args) {
    try {
        let fbUrl = args[0];

        // Lógica para detectar mensaje citado
        if (!fbUrl && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedMsg = m.message.extendedTextMessage.contextInfo.quotedMessage;
            const quotedText = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
            
            if (quotedText) {
                const urlMatch = quotedText.match(/https?:\/\/(www\.|web\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch|me)[^\s]+/i);
                if (urlMatch) {
                    fbUrl = urlMatch[0];
                }
            }
        }

        if (!fbUrl) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: '? *Uso:* Envía #fb + enlace o responde a un enlace con #fb' 
            }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { react: { text: "?", key: m.key } });

        // 1. Obtener URL
        const videoInfo = await facebookService.downloadVideo(fbUrl);
        
        // 2. Descargar Buffer
        const media = await facebookService.downloadMedia(videoInfo.url);

        // 3. Enviar
        await sock.sendMessage(m.key.remoteJid, {
            video: media.buffer,
            caption: `?? *Descargado* (${videoInfo.quality})\n?? Fuente: Facebook`,
            mimetype: 'video/mp4'
        }, { quoted: m });

        await sock.sendMessage(m.key.remoteJid, { react: { text: "?", key: m.key } });

    } catch (error) {
        console.error('? Error FB Command:', error);
        
        // Mensajes de error amigables para el usuario
        let msg = '? *Error al descargar*';
        if (error.message.includes('pesa más')) msg = '? El video es demasiado largo/pesado para WhatsApp.';
        if (error.message.includes('APIs fallaron')) msg = '? No se pudo procesar el enlace. Verifica que el video sea público.';
        
        await sock.sendMessage(m.key.remoteJid, { text: msg }, { quoted: m });
        await sock.sendMessage(m.key.remoteJid, { react: { text: "?", key: m.key } });
    }
}
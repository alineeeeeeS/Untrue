import axios from 'axios';

class FacebookService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
        
        // ?? LISTA DE APIS BASADA EN TU INVESTIGACIÓN (BK9 Oficial)
        this.apis = [
            {
                name: 'BK9 (Servidor 1)', 
                url: 'https://api.bk9.dev/download/fb',
                method: 'get',
                param: 'url'
            },
            {
                name: 'BK9 (Servidor 2)',
                // Usamos el endpoint alternativo que viste en la web
                url: 'https://api.bk9.dev/download/fb2',
                method: 'get',
                param: 'url'
            },
            {
                // Un backup externo por si BK9 cae completo (Widipe suele ser estable)
                name: 'Widipe (Backup)',
                url: 'https://widipe.com.pl/download/fb',
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
                // Pausa pequeña entre intentos para no saturar red
                if (api !== this.apis[this.apis.length - 1]) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
                continue;
            }
        }

        throw new Error('No se pudo descargar el video. Verifica que el enlace sea público.');
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
                timeout: 10000 // 20s timeout
            });

            // Si la API devuelve HTML en vez de JSON (error común en BK9 cuando falla), lanzamos error
            if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
                throw new Error('La API devolvió HTML (Error 500/502)');
            }

            return this.processAPIResponse(api.name, response.data);

        } catch (error) {
            if (error.code === 'ECONNABORTED') throw new Error('Timeout');
            if (error.response?.status === 404) throw new Error('Recurso no encontrado (404)');
            if (error.response?.status >= 500) throw new Error('Error interno del servidor API');
            throw new Error(error.message);
        }
    }

    processAPIResponse(apiName, data) {
        try {
            let videoUrl = null;
            let quality = 'SD';

            // Lógica unificada para BK9 y sus variantes
            if (apiName.includes('BK9')) {
                // BK9 a veces devuelve la data en 'BK9', 'result' o 'data' dependiendo del endpoint
                const root = data.BK9 || data.result || data.data;

                if (root) {
                    // Caso 1: Objeto con HD/SD
                    if (root.HD || root.SD) {
                        videoUrl = root.HD || root.SD;
                        quality = root.HD ? 'HD' : 'SD';
                    } 
                    // Caso 2: Objeto con propiedad 'url' directa
                    else if (root.url) {
                        videoUrl = root.url;
                        quality = 'SD';
                    }
                    // Caso 3: Array de opciones
                    else if (Array.isArray(root)) {
                         const best = root.find(v => v.quality === 'HD') || root[0];
                         videoUrl = best.url;
                         quality = best.quality || 'SD';
                    }
                }
            } 
            
            else if (apiName.includes('Widipe')) {
                if (data.result && data.result.url) {
                    videoUrl = data.result.url;
                } else if (data.url) {
                    videoUrl = data.url;
                }
            }

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
            console.log('?? Descargando archivo final...');
            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'arraybuffer',
                timeout: 60000,
                maxContentLength: 90 * 1024 * 1024, // 90MB límite seguro
                headers: {
                    'User-Agent': this.userAgent,
                    // IMPORTANTE: NO enviamos Referer para evitar bloqueos de CDN (fbcdn)
                }
            });

            return {
                buffer: Buffer.from(response.data),
                size: response.data.length
            };

        } catch (error) {
            if (error.code === 'ERR_Body_Length_>_MaxContentLength') {
                throw new Error('El video es demasiado pesado (>90MB)');
            }
            if (error.response?.status === 403) {
                 throw new Error('Enlace de video caducado (403 Forbidden).');
            }
            throw new Error(`Error de descarga: ${error.message}`);
        }
    }
}

const facebookService = new FacebookService();

export async function facebookCommand(sock, m, args) {
    try {
        let fbUrl = args[0];

        // Lógica mensaje citado
        if (!fbUrl && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedMsg = m.message.extendedTextMessage.contextInfo.quotedMessage;
            const quotedText = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
            if (quotedText) {
                const urlMatch = quotedText.match(/https?:\/\/(www\.|web\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch|me)[^\s]+/i);
                if (urlMatch) fbUrl = urlMatch[0];
            }
        }

        if (!fbUrl) {
            await sock.sendMessage(m.key.remoteJid, { text: '⚠️ #fb <enlace>' }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { react: { text: "⏳", key: m.key } });

        // 1. Obtener URL directa
        const videoInfo = await facebookService.downloadVideo(fbUrl);
        
        // 2. Descargar
        const media = await facebookService.downloadMedia(videoInfo.url);

        // 3. Enviar
        await sock.sendMessage(m.key.remoteJid, {
            video: media.buffer,
            caption: `✅ Video Descargado (${videoInfo.quality})`,
            mimetype: 'video/mp4'
        }, { quoted: m });

        await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('❌ Error FB Command:', error);
        await sock.sendMessage(m.key.remoteJid, { 
            text: `❌ Error: ${error.message}` 
        }, { quoted: m });
        await sock.sendMessage(m.key.remoteJid, { react: { text: "❌", key: m.key } });
    }
}
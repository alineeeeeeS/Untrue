import axios from 'axios';

class FacebookService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
        
        // LISTA DE APIS ACTUALIZADA (Activas actualmente)
        this.apis = [
            {
                name: 'Bk9 (Stable)', 
                url: 'https://api.bk9.dev/download/fb',
                method: 'get',
                param: 'url'
            },
            {
                name: 'Widipe',
                url: 'https://widipe.com.pl/download/fb',
                method: 'get',
                param: 'url'
            },
            {
                name: 'DavidCyril',
                url: 'https://api.davidcyriltech.my.id/facebook',
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
                    console.log(`? Exito con ${api.name} (${result.quality})`);
                    return result;
                }
            } catch (error) {
                console.log(`?? ${api.name} fallo: ${error.message}`);
                if (api !== this.apis[this.apis.length - 1]) {
                    // Pequeña pausa para no saturar si es muy rápido
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                continue;
            }
        }

        throw new Error('Ninguna API pudo resolver el video. Intenta con otro enlace.');
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
                timeout: 15000 // 15s es suficiente
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
                case 'Bk9 (Stable)':
                    // Return: { status: true, result: { HD: "...", SD: "..." } }
                    if (data.status && data.result) {
                        videoUrl = data.result.HD || data.result.SD;
                        quality = data.result.HD ? 'HD' : 'SD';
                    }
                    break;

                case 'Widipe':
                    // Return: { status: true, result: { url: "..." } }
                    if (data.result && data.result.url) {
                        videoUrl = data.result.url;
                        quality = 'SD'; // Generalmente devuelve una sola url
                    } else if (data.url) {
                        videoUrl = data.url;
                    }
                    break;

                case 'DavidCyril':
                    // Return: { success: true, video: { hd: "...", sd: "..." } }
                    if (data.video) {
                        videoUrl = data.video.hd || data.video.sd;
                        quality = data.video.hd ? 'HD' : 'SD';
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
            // A veces el enlace caduca rápido, lanzamos error específico
            if (error.response && error.response.status === 403) {
                 throw new Error('El enlace de descarga caducó o fue rechazado por FB.');
            }
            throw new Error(`Error descargando archivo: ${error.message}`);
        }
    }
}

const facebookService = new FacebookService();

export async function facebookCommand(sock, m, args) {
    try {
        let fbUrl = args[0];

        // Lógica de mensaje citado (quoted)
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
                text: '⚠️ *Uso correcto:*\n#fb <enlace del video>' 
            }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { react: { text: "⏳", key: m.key } });

        // 1. Obtener URL directa
        const videoInfo = await facebookService.downloadVideo(fbUrl);
        
        // 2. Descargar buffer
        const media = await facebookService.downloadMedia(videoInfo.url);

        // 3. Enviar
        await sock.sendMessage(m.key.remoteJid, {
            video: media.buffer,
            caption: `✅ *Facebook Video* (${videoInfo.quality})`,
            mimetype: 'video/mp4'
        }, { quoted: m });

        await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('❌ Error FB Command:', error);
        
        let msg = '❌ *No se pudo descargar*';
        if (error.message.includes('pesado')) msg = '⚠️ El video pesa más de 100MB.';
        if (error.message.includes('Intenta con otro')) msg = '⚠️ No se pudo extraer el video. Asegúrate de que es público.';
        
        await sock.sendMessage(m.key.remoteJid, { text: msg }, { quoted: m });
        await sock.sendMessage(m.key.remoteJid, { react: { text: "❌", key: m.key } });
    }
}
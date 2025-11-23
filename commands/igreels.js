import axios from 'axios';

class InstagramService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        this.apis = [
            {
                name: 'siputzx',
                url: 'https://api.siputzx.my.id/api/d/igdl',
                method: 'get'
            },
            {
                name: 'betabotz', 
                url: 'https://api.betabotz.org/api/download/igdowloader',
                method: 'get',
                params: { apikey: 'bot-secx3' }
            },
            {
                name: 'lolhuman',
                url: 'https://api.lolhuman.xyz/api/instagram',
                method: 'get',
                params: { apikey: 'Gata_Dios' }
            }
        ];
    }

    isValidInstagramUrl(url) {
        const regex = /https?:\/\/(www\.)?instagram\.com\/(reel|p|stories)\/([A-Za-z0-9_-]+)/;
        return regex.test(url);
    }

    async downloadReel(reelUrl) {
        console.log('🔗 Procesando URL:', reelUrl);

        if (!this.isValidInstagramUrl(reelUrl)) {
            throw new Error('URL de Instagram no válida');
        }

        // Probar cada API en secuencia
        for (const api of this.apis) {
            try {
                console.log(`🔄 Probando API: ${api.name}`);
                const result = await this.tryAPI(api, reelUrl);
                if (result) {
                    console.log(`✅ Éxito con ${api.name}`);
                    return result;
                }
            } catch (error) {
                console.log(`❌ ${api.name} falló:`, error.message);
                continue;
            }
        }

        throw new Error('Todas las APIs fallaron. Intenta más tarde.');
    }

    async tryAPI(api, reelUrl) {
        try {
            let response;
            const fullUrl = this.buildAPIUrl(api, reelUrl);

            if (api.method === 'get') {
                response = await axios.get(fullUrl, {
                    headers: { 'User-Agent': this.userAgent },
                    timeout: 15000
                });
            }

            return this.processAPIResponse(api.name, response.data);

        } catch (error) {
            throw new Error(`API ${api.name}: ${error.message}`);
        }
    }

    buildAPIUrl(api, reelUrl) {
        const url = new URL(api.url);

        if (api.name === 'siputzx' || api.name === 'betabotz' || api.name === 'lolhuman') {
            url.searchParams.append('url', reelUrl);
        }

        if (api.params) {
            Object.entries(api.params).forEach(([key, value]) => {
                url.searchParams.append(key, value);
            });
        }

        return url.toString();
    }

    processAPIResponse(apiName, data) {
        try {
            switch (apiName) {
                case 'siputzx':
                    if (data.data && data.data[0] && data.data[0].url) {
                        return {
                            url: data.data[0].url,
                            type: data.data[0].url.includes('.webp') ? 'image' : 'video'
                        };
                    }
                    break;

                case 'betabotz':
                    if (data.message && data.message[0] && data.message[0]._url) {
                        return {
                            url: data.message[0]._url,
                            type: 'video'
                        };
                    }
                    break;

                case 'lolhuman':
                    if (data.result) {
                        return {
                            url: data.result,
                            type: 'video'
                        };
                    }
                    break;
            }
        } catch (error) {
            throw new Error(`Error procesando respuesta de ${apiName}`);
        }

        return null;
    }

    async downloadMedia(mediaUrl) {
        try {
            console.log('📥 Descargando:', mediaUrl);

            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'video/mp4,image/*,*/*;q=0.8'
                }
            });

            return {
                buffer: Buffer.from(response.data),
                contentType: response.headers['content-type']
            };

        } catch (error) {
            throw new Error(`Error descargando media: ${error.message}`);
        }
    }
}

const instagramService = new InstagramService();

export async function igreelsCommand(sock, m, args) {
    try {
        let reelUrl = args[0];

        // Obtener URL de mensaje citado
        if (!reelUrl && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedText = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation || 
                             m.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text;
            if (quotedText) {
                const urlMatch = quotedText.match(/https?:\/\/[^\s]+/g);
                if (urlMatch) {
                    for (const url of urlMatch) {
                        if (instagramService.isValidInstagramUrl(url)) {
                            reelUrl = url;
                            break;
                        }
                    }
                }
            }
        }

        if (!reelUrl) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: '❌ *Uso:* !reel <url_instagram>\n*Ejemplo:* !reel https://instagram.com/reel/ABC123...' 
            }, { quoted: m });
            return;
        }

        if (!instagramService.isValidInstagramUrl(reelUrl)) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: '❌ URL de Instagram no válida. Debe ser un Reel, Post o Story pública.' 
            }, { quoted: m });
            return;
        }

        // NO enviar mensajes de proceso - solo procesar en silencio

        try {
            // Obtener información del media
            const mediaInfo = await instagramService.downloadReel(reelUrl);

            // Descargar el media
            const mediaData = await instagramService.downloadMedia(mediaInfo.url);

            // Enviar según el tipo con caption minimalista
            if (mediaInfo.type === 'image') {
                await sock.sendMessage(m.key.remoteJid, {
                    image: mediaData.buffer,
                    caption: '✅ *Reel descargado!*'
                }, { quoted: m });
            } else {
                await sock.sendMessage(m.key.remoteJid, {
                    video: mediaData.buffer,
                    caption: '✅ *Reel descargado!*',
                    fileName: 'instagram_reel.mp4'
                }, { quoted: m });
            }

            console.log('✅ Reel enviado correctamente');

        } catch (error) {
            console.error('Error al descargar:', error);

            let errorMessage = '❌ *Error al descargar el contenido*\n\n';

            if (error.message.includes('APIs fallaron')) {
                errorMessage += '🔧 *Todas las APIs están temporalmente no disponibles*\n\n';
                errorMessage += '🔄 Intenta en 5-10 minutos o con otro contenido.';
            } else if (error.message.includes('no válida')) {
                errorMessage += '📱 *URL no válida o contenido privado*\n';
                errorMessage += 'Solo funciona con contenido público.';
            } else {
                errorMessage += `⚠️ *Error:* ${error.message}\n`;
                errorMessage += '🔄 Intenta con otro enlace.';
            }

            await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
        }

    } catch (error) {
        console.error('Error general:', error);
        await sock.sendMessage(m.key.remoteJid, { 
            text: '❌ Error inesperado. Por favor intenta nuevamente.' 
        }, { quoted: m });
    }
}
import axios from 'axios';

class InstagramService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        this.apis = [
            {
                name: 'yudamods',
                url: 'https://api.yudamods.my.id/api/download/instagram',
                method: 'get',
                params: { url: '' }
            },
            {
                name: 'skizoapi', 
                url: 'https://skizo.tech/api/instagram',
                method: 'get',
                params: { url: '', apikey: 'skizo-2qj8H' }
            },
            {
                name: 'shizoco',
                url: 'https://shizoco.cyclic.app/download/ig',
                method: 'get',
                params: { url: '' }
            },
            {
                name: 'api-sip',
                url: 'https://api-sip.cyclic.app/api/ig',
                method: 'get',
                params: { url: '' }
            },
            {
                name: 'shizoco-single',
                url: 'https://shizoco.cyclic.app/ig',
                method: 'get',
                params: { url: '' }
            },
            {
                name: 'shizoco-dl',
                url: 'https://shizoco.cyclic.app/igdl',
                method: 'get',
                params: { url: '' }
            },
            {
                name: 'shizoco-api1',
                url: 'https://shizoco.cyclic.app/api/igdl',
                method: 'get',
                params: { url: '' }
            },
            {
                name: 'shizoco-api2', 
                url: 'https://shizoco.cyclic.app/api/download/ig',
                method: 'get',
                params: { url: '' }
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
                    console.log(`🎯 ${api.name} FUNCIONÓ - Tipo: ${result.type}`);
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

            console.log(`📡 Llamando a: ${api.name}`);

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
        
        // Todas las nuevas APIs usan parámetro 'url'
        url.searchParams.append('url', reelUrl);

        if (api.params) {
            Object.entries(api.params).forEach(([key, value]) => {
                if (value !== '') { // Solo agregar si no está vacío
                    url.searchParams.append(key, value);
                }
            });
        }

        return url.toString();
    }

    processAPIResponse(apiName, data) {
        try {
            console.log(`🔍 Procesando respuesta de ${apiName}:`, JSON.stringify(data).substring(0, 200) + '...');

            switch (apiName) {
                case 'yudamods':
                    if (data.result && Array.isArray(data.result) && data.result[0] && data.result[0].url) {
                        return {
                            url: data.result[0].url,
                            type: this.determineMediaType(data.result[0].url)
                        };
                    }
                    break;

                case 'skizoapi':
                    if (data.media && Array.isArray(data.media) && data.media[0] && data.media[0].url) {
                        return {
                            url: data.media[0].url,
                            type: this.determineMediaType(data.media[0].url)
                        };
                    }
                    // Estructura alternativa de Skizo
                    if (data.result && data.result.url) {
                        return {
                            url: data.result.url,
                            type: this.determineMediaType(data.result.url)
                        };
                    }
                    break;

                case 'shizoco':
                case 'shizoco-single':
                case 'shizoco-dl':
                case 'shizoco-api1':
                case 'shizoco-api2':
                    // Shizoco tiene múltiples endpoints con estructura similar
                    if (data.data && Array.isArray(data.data) && data.data[0] && data.data[0].url) {
                        return {
                            url: data.data[0].url,
                            type: this.determineMediaType(data.data[0].url)
                        };
                    }
                    // Alternativa para algunos endpoints de Shizoco
                    if (data.result && Array.isArray(data.result) && data.result[0] && data.result[0].url) {
                        return {
                            url: data.result[0].url,
                            type: this.determineMediaType(data.result[0].url)
                        };
                    }
                    // Estructura simple de Shizoco
                    if (data.data && data.data.url) {
                        return {
                            url: data.data.url,
                            type: this.determineMediaType(data.data.url)
                        };
                    }
                    break;

                case 'api-sip':
                    if (data.data && data.data.url) {
                        return {
                            url: data.data.url,
                            type: this.determineMediaType(data.data.url)
                        };
                    }
                    if (data.data && Array.isArray(data.data) && data.data[0] && data.data[0].url) {
                        return {
                            url: data.data[0].url,
                            type: this.determineMediaType(data.data[0].url)
                        };
                    }
                    break;
            }
        } catch (error) {
            console.error(`❌ Error procesando ${apiName}:`, error);
        }
        return null;
    }

    determineMediaType(url) {
        if (!url) return 'video';
        return url.includes('.mp4') ? 'video' : 'image';
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
                text: '❌ *Uso:* #reel <url_instagram>\n*Ejemplo:* #reel https://instagram.com/reel/ABC123...' 
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

import axios from 'axios';

class InstagramService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        this.apis = [
            {
                name: 'cobalt',
                url: 'https://co.wuk.sh/api/json',
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                data: {
                    url: '',
                    aFormat: 'mp4',
                    vQuality: 'max',
                    isAudioOnly: false,
                    isNoTTWatermark: true,
                    dubLang: false
                }
            },
            {
                name: 'snapinsta',
                url: 'https://snapinsta.app/action.php',
                method: 'post',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': 'https://snapinsta.app',
                    'Referer': 'https://snapinsta.app/'
                },
                data: {
                    url: '',
                    action: 'post'
                }
            },
            {
                name: 'igram',
                url: 'https://www.igram.io/api/ajaxSearch',
                method: 'post',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': 'https://www.igram.io',
                    'Referer': 'https://www.igram.io/'
                },
                data: {
                    q: '',
                    t: 'media',
                    lang: 'en'
                }
            },
            {
                name: 'instasupersave',
                url: 'https://instasupersave.com/api/convert',
                method: 'post',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': 'https://instasupersave.com',
                    'Referer': 'https://instasupersave.com/'
                },
                data: {
                    url: ''
                }
            },
            {
                name: 'savefrom',
                url: 'https://api.savefrom.net/api/convert',
                method: 'post',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: {
                    url: ''
                }
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
            console.log(`📡 Llamando a: ${api.name}`);

            let response;
            const config = {
                timeout: 30000,
                headers: {
                    'User-Agent': this.userAgent,
                    ...api.headers
                }
            };

            if (api.method === 'post') {
                const data = { ...api.data };
                
                // Preparar datos según la API
                if (api.name === 'cobalt') {
                    data.url = reelUrl;
                } else if (api.name === 'snapinsta' || api.name === 'instasupersave' || api.name === 'savefrom') {
                    data.url = reelUrl;
                } else if (api.name === 'igram') {
                    data.q = reelUrl;
                }

                if (api.headers['Content-Type'] === 'application/json') {
                    config.data = data;
                    response = await axios.post(api.url, data, config);
                } else {
                    // Form data
                    const formData = new URLSearchParams();
                    for (const [key, value] of Object.entries(data)) {
                        formData.append(key, value);
                    }
                    config.data = formData;
                    response = await axios.post(api.url, formData, config);
                }
            } else {
                response = await axios.get(api.url, config);
            }

            return this.processAPIResponse(api.name, response.data);

        } catch (error) {
            throw new Error(`API ${api.name}: ${error.message}`);
        }
    }

    processAPIResponse(apiName, data) {
        try {
            console.log(`🔍 Procesando respuesta de ${apiName}`);

            switch (apiName) {
                case 'cobalt':
                    if (data.status === 'stream' && data.url) {
                        return {
                            url: data.url,
                            type: 'video'
                        };
                    }
                    break;

                case 'snapinsta':
                    if (data.data && data.data[0] && data.data[0].url) {
                        return {
                            url: data.data[0].url,
                            type: 'video'
                        };
                    }
                    if (data.url) {
                        return {
                            url: data.url,
                            type: 'video'
                        };
                    }
                    break;

                case 'igram':
                    if (data.data && data.data[0] && data.data[0].src) {
                        return {
                            url: data.data[0].src,
                            type: this.determineMediaType(data.data[0].src)
                        };
                    }
                    break;

                case 'instasupersave':
                    if (data.url) {
                        return {
                            url: data.url,
                            type: 'video'
                        };
                    }
                    if (data.medias && data.medias[0] && data.medias[0].url) {
                        return {
                            url: data.medias[0].url,
                            type: 'video'
                        };
                    }
                    break;

                case 'savefrom':
                    if (data.url) {
                        return {
                            url: data.url,
                            type: 'video'
                        };
                    }
                    if (data.result && data.result.url) {
                        return {
                            url: data.result.url,
                            type: 'video'
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
                timeout: 45000,
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'video/mp4,image/*,*/*;q=0.8',
                    'Referer': 'https://www.instagram.com/'
                }
            });

            console.log(`✅ Media descargado - Tamaño: ${(response.data.length / 1024 / 1024).toFixed(2)} MB`);

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

        // Enviar mensaje de procesamiento
        const processingMsg = await sock.sendMessage(m.key.remoteJid, { 
            text: '🔄 *Descargando reel...*\n⏳ Esto puede tomar unos segundos.' 
        }, { quoted: m });

        try {
            // Obtener información del media
            const mediaInfo = await instagramService.downloadReel(reelUrl);

            // Descargar el media
            const mediaData = await instagramService.downloadMedia(mediaInfo.url);

            // Eliminar mensaje de procesamiento
            try {
                await sock.sendMessage(m.key.remoteJid, { delete: processingMsg.key });
            } catch (e) {}

            // Enviar según el tipo
            if (mediaInfo.type === 'image') {
                await sock.sendMessage(m.key.remoteJid, {
                    image: mediaData.buffer,
                    caption: '✅ *Instagram Reel descargado!*'
                }, { quoted: m });
            } else {
                await sock.sendMessage(m.key.remoteJid, {
                    video: mediaData.buffer,
                    caption: '✅ *Instagram Reel descargado!*',
                    fileName: 'instagram_reel.mp4'
                }, { quoted: m });
            }

            console.log('✅ Reel enviado correctamente');

        } catch (error) {
            console.error('Error al descargar:', error);

            // Eliminar mensaje de procesamiento
            try {
                await sock.sendMessage(m.key.remoteJid, { delete: processingMsg.key });
            } catch (e) {}

            let errorMessage = '❌ *Error al descargar el reel*\n\n';

            if (error.message.includes('APIs fallaron')) {
                errorMessage += '🔧 *Servicios temporalmente no disponibles*\n\n';
                errorMessage += '🔄 Intenta en 5-10 minutos.';
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

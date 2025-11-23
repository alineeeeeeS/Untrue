import axios from 'axios';
import * as cheerio from 'cheerio';

class TwitterService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    isValidTwitterUrl(url) {
        const regex = /(https?:\/\/)?(www\.|mobile\.)?(twitter|x)\.com\/([a-zA-Z0-9_]{1,15}\/status\/\d+|i\/communities\/\d+\/status\/\d+)/;
        return regex.test(url);
    }

    async downloadContent(twitterUrl) {
        console.log('🔗 Procesando Twitter URL:', twitterUrl);

        if (!this.isValidTwitterUrl(twitterUrl)) {
            throw new Error('URL de Twitter no válida');
        }

        console.log('✅ URL válida, iniciando métodos...');

        // Métodos alternativos más confiables
        const methods = [
            { name: 'twikit', method: this.tryTwikit.bind(this) },
            { name: 'fxtwitter', method: this.tryFxTwitter.bind(this) },
            { name: 'vxtwitter', method: this.tryVxTwitter.bind(this) },
            { name: 'direct-scraping', method: this.tryDirectScraping.bind(this) }
        ];

        for (const method of methods) {
            try {
                console.log(`🔄 Probando método: ${method.name}`);
                const result = await method.method(twitterUrl);
                if (result && result.url) {
                    console.log(`✅ Éxito con ${method.name}`);
                    return result;
                }
            } catch (error) {
                console.log(`❌ ${method.name} falló:`, error.message);
                continue;
            }
        }

        throw new Error('No se pudo descargar el contenido. El tweet puede ser privado o no tener medios.');
    }

    async tryTwikit(url) {
        try {
            console.log('📡 Usando Twikit...');

            // Twikit es una API más estable
            const apiUrl = `https://twikit.api.0x0.st/api/v1/media?url=${encodeURIComponent(url)}`;
            console.log(`📡 Llamando a: ${apiUrl}`);

            const response = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                },
                timeout: 30000
            });

            console.log('📊 Respuesta Twikit recibida');

            if (response.data && response.data.media) {
                const media = response.data.media;

                // Priorizar video sobre imágenes
                if (media.video && media.video.url) {
                    return {
                        url: media.video.url,
                        type: 'video',
                        quality: media.video.quality || 'HD'
                    };
                }

                if (media.photo && media.photo.url) {
                    return {
                        url: media.photo.url,
                        type: 'image',
                        quality: 'Original'
                    };
                }

                if (media.gif && media.gif.url) {
                    return {
                        url: media.gif.url,
                        type: 'video', // Los GIFs se envían como video
                        quality: 'Original'
                    };
                }
            }

            throw new Error('No se encontraron medios en la respuesta');

        } catch (error) {
            throw new Error(`Twikit: ${error.message}`);
        }
    }

    async tryFxTwitter(url) {
        try {
            console.log('📡 Usando FxTwitter...');

            // FxTwitter es muy confiable para extraer medios
            const apiUrl = `https://api.fxtwitter.com/status/${this.extractTweetId(url)}`;
            console.log(`📡 Llamando a: ${apiUrl}`);

            const response = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                },
                timeout: 30000
            });

            console.log('📊 Respuesta FxTwitter recibida');

            if (response.data && response.data.tweet) {
                const tweet = response.data.tweet;

                // Buscar videos primero
                if (tweet.media && tweet.media.videos) {
                    const videos = tweet.media.videos;
                    // Tomar el video de mayor calidad
                    const bestVideo = videos.sort((a, b) => {
                        const bitrateA = a.bitrate || 0;
                        const bitrateB = b.bitrate || 0;
                        return bitrateB - bitrateA;
                    })[0];

                    if (bestVideo && bestVideo.url) {
                        return {
                            url: bestVideo.url,
                            type: 'video',
                            quality: `${bestVideo.bitrate ? Math.round(bestVideo.bitrate / 1000) + 'kbps' : 'HD'}`
                        };
                    }
                }

                // Buscar GIFs
                if (tweet.media && tweet.media.videos) {
                    const gif = tweet.media.videos.find(v => v.type === 'gif');
                    if (gif && gif.url) {
                        return {
                            url: gif.url,
                            type: 'video',
                            quality: 'GIF'
                        };
                    }
                }

                // Buscar imágenes
                if (tweet.media && tweet.media.photos && tweet.media.photos.length > 0) {
                    return {
                        url: tweet.media.photos[0].url,
                        type: 'image',
                        quality: 'Original'
                    };
                }
            }

            throw new Error('No se encontraron medios en el tweet');

        } catch (error) {
            throw new Error(`FxTwitter: ${error.message}`);
        }
    }

    async tryVxTwitter(url) {
        try {
            console.log('📡 Usando VxTwitter...');

            // VxTwitter es otra alternativa confiable
            const apiUrl = `https://api.vxtwitter.com/status/${this.extractTweetId(url)}`;
            console.log(`📡 Llamando a: ${apiUrl}`);

            const response = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                },
                timeout: 30000
            });

            console.log('📊 Respuesta VxTwitter recibida');

            if (response.data) {
                const data = response.data;

                // Buscar video
                if (data.mediaURLs && data.mediaURLs.length > 0) {
                    const videoUrl = data.mediaURLs.find(url => 
                        url.includes('.mp4') || url.includes('.m3u8')
                    );

                    if (videoUrl) {
                        return {
                            url: videoUrl,
                            type: 'video',
                            quality: 'HD'
                        };
                    }

                    // Si no hay video, tomar la primera imagen
                    const imageUrl = data.mediaURLs[0];
                    if (imageUrl && (imageUrl.includes('.jpg') || imageUrl.includes('.png'))) {
                        return {
                            url: imageUrl,
                            type: 'image',
                            quality: 'Original'
                        };
                    }
                }

                // Buscar en media_extended
                if (data.media_extended && data.media_extended.length > 0) {
                    const media = data.media_extended[0];
                    if (media.type === 'video') {
                        // Buscar la variante de mayor calidad
                        if (media.video_info && media.video_info.variants) {
                            const bestVariant = media.video_info.variants
                                .filter(v => v.content_type === 'video/mp4')
                                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

                            if (bestVariant && bestVariant.url) {
                                return {
                                    url: bestVariant.url,
                                    type: 'video',
                                    quality: `${bestVariant.bitrate ? Math.round(bestVariant.bitrate / 1000) + 'kbps' : 'HD'}`
                                };
                            }
                        }
                    } else if (media.type === 'photo' && media.media_url_https) {
                        return {
                            url: media.media_url_https,
                            type: 'image',
                            quality: 'Original'
                        };
                    }
                }
            }

            throw new Error('No se encontraron medios en el tweet');

        } catch (error) {
            throw new Error(`VxTwitter: ${error.message}`);
        }
    }

    async tryDirectScraping(url) {
        try {
            console.log('📡 Intentando scraping directo...');

            // Usar un servicio de proxy para evitar bloqueos
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;

            const response = await axios.get(proxyUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                },
                timeout: 30000
            });

            const html = response.data;
            console.log('📄 HTML obtenido, buscando medios...');

            // Buscar URLs de video en el HTML
            const videoRegex = /(https:\/\/video\.twimg\.com[^"']*\.mp4[^"']*)/gi;
            const videoMatches = html.match(videoRegex);

            if (videoMatches && videoMatches.length > 0) {
                console.log(`🎬 Videos encontrados: ${videoMatches.length}`);
                // Tomar el primer video (generalmente es el principal)
                return {
                    url: videoMatches[0],
                    type: 'video',
                    quality: 'HD'
                };
            }

            // Buscar imágenes
            const imageRegex = /(https:\/\/pbs\.twimg\.com\/media\/[^"']+\.(jpg|png|webp)[^"']*)/gi;
            const imageMatches = html.match(imageRegex);

            if (imageMatches && imageMatches.length > 0) {
                console.log(`🖼️ Imágenes encontradas: ${imageMatches.length}`);
                // Tomar la primera imagen
                return {
                    url: imageMatches[0],
                    type: 'image',
                    quality: 'Original'
                };
            }

            // Buscar en datos JSON embebidos
            const jsonRegex = /"video_url":"([^"]+)"/g;
            let jsonMatch;
            while ((jsonMatch = jsonRegex.exec(html)) !== null) {
                if (jsonMatch[1].includes('.mp4')) {
                    const videoUrl = jsonMatch[1].replace(/\\u0025/g, '%').replace(/\\\//g, '/');
                    console.log(`🎬 URL de video encontrada en JSON: ${videoUrl}`);
                    return {
                        url: videoUrl,
                        type: 'video',
                        quality: 'HD'
                    };
                }
            }

            throw new Error('No se encontraron medios en el HTML');

        } catch (error) {
            throw new Error(`scraping directo: ${error.message}`);
        }
    }

    extractTweetId(url) {
        const match = url.match(/\/(\d+)(?:\?|$)/);
        return match ? match[1] : null;
    }

    async downloadMedia(mediaUrl) {
        try {
            console.log('📥 Descargando media:', mediaUrl);

            if (!mediaUrl || !mediaUrl.startsWith('http')) {
                throw new Error('URL de media no válida');
            }

            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'arraybuffer',
                timeout: 60000,
                maxContentLength: 500 * 1024 * 1024,
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'video/mp4,video/*,image/*,*/*;q=0.8',
                    'Referer': 'https://twitter.com/'
                }
            });

            if (!response.data || response.data.length === 0) {
                throw new Error('El contenido descargado está vacío');
            }

            console.log(`✅ Media descargado - Tamaño: ${(response.data.length / 1024 / 1024).toFixed(2)} MB`);

            return {
                buffer: Buffer.from(response.data),
                contentType: response.headers['content-type'],
                size: response.data.length
            };

        } catch (error) {
            console.error('❌ Error descargando media:', error.message);
            throw new Error(`Error descargando media: ${error.message}`);
        }
    }
}

const twitterService = new TwitterService();

export async function twitterCommand(sock, m, args) {
    try {
        let twitterUrl = args[0];

        // Obtener URL de mensaje citado
        if (!twitterUrl && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedText = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation || 
                             m.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text;
            if (quotedText) {
                const urlMatch = quotedText.match(/https?:\/\/[^\s]+/g);
                if (urlMatch) {
                    for (const url of urlMatch) {
                        if (twitterService.isValidTwitterUrl(url)) {
                            twitterUrl = url;
                            break;
                        }
                    }
                }
            }
        }

        if (!twitterUrl) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: `❌ *Uso del comando:*

🐦 *Descargar de Twitter/X:*
#tw <url_twitter>

*Ejemplos:*
#tw https://twitter.com/user/status/123456789
#tw https://x.com/user/status/123456789` 
            }, { quoted: m });
            return;
        }

        console.log(`🔍 Validando URL: ${twitterUrl}`);

        if (!twitterService.isValidTwitterUrl(twitterUrl)) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: '❌ URL de Twitter no válida.' 
            }, { quoted: m });
            return;
        }

        console.log('🚀 Iniciando descarga de Twitter...');

        try {
            // Obtener información del contenido
            const contentInfo = await twitterService.downloadContent(twitterUrl);

            if (!contentInfo || !contentInfo.url) {
                throw new Error('No se pudo obtener el enlace de descarga');
            }

            console.log(`📦 Procesando contenido: ${contentInfo.url}`);

            // Descargar el media
            const mediaData = await twitterService.downloadMedia(contentInfo.url);

            // Determinar el mensaje según el tipo de contenido
            const caption = contentInfo.type === 'video' ? '🎥 Video de Twitter descargado!' : '🖼️ Imagen de Twitter descargada!';

            // Enviar directamente el contenido
            if (contentInfo.type === 'video') {
                await sock.sendMessage(m.key.remoteJid, {
                    video: mediaData.buffer,
                    caption: caption,
                    fileName: 'twitter_video.mp4'
                }, { quoted: m });
            } else {
                await sock.sendMessage(m.key.remoteJid, {
                    image: mediaData.buffer,
                    caption: caption
                }, { quoted: m });
            }

            console.log('✅ Contenido de Twitter enviado correctamente');

        } catch (error) {
            console.error('❌ Error al procesar contenido:', error);

            let errorMessage = '❌ *Error al descargar de Twitter*\n\n';

            if (error.message.includes('No se pudo descargar')) {
                errorMessage += '🔒 *No se pudo descargar el contenido*\n\n';
                errorMessage += '🔄 *Posibles causas:*\n';
                errorMessage += '• El tweet es privado\n';
                errorMessage += '• El tweet no contiene medios descargables\n';
                errorMessage += '• El tweet fue eliminado\n\n';
                errorMessage += '💡 *Solución:* Intenta con:\n';
                errorMessage += '• Un tweet público con video/imágenes\n';
                errorMessage += '• Verifica que el tweet exista\n';
                errorMessage += '• Otro enlace de Twitter';
            } else if (error.message.includes('No se pudo obtener')) {
                errorMessage += '🔧 *No se pudo extraer el contenido*\n\n';
                errorMessage += '🔄 Intenta con otro tweet.';
            } else if (error.message.includes('timeout')) {
                errorMessage += '⏰ *Tiempo de espera agotado*\n';
                errorMessage += '🔄 El contenido puede ser muy pesado.';
            } else {
                errorMessage += `⚠️ *Error:* ${error.message}\n`;
                errorMessage += '🔄 Intenta con otro enlace.';
            }

            await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
        }

    } catch (error) {
        console.error('💥 Error general:', error);
        await sock.sendMessage(m.key.remoteJid, { 
            text: '❌ Error inesperado. Por favor intenta nuevamente.' 
        }, { quoted: m });
    }
}
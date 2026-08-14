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
        console.log('Procesando Twitter URL:', twitterUrl);

        if (!this.isValidTwitterUrl(twitterUrl)) {
            throw new Error('URL de Twitter no válida');
        }

        const methods = [
            { name: 'twikit', method: this.tryTwikit.bind(this) },
            { name: 'fxtwitter', method: this.tryFxTwitter.bind(this) },
            { name: 'vxtwitter', method: this.tryVxTwitter.bind(this) },
            { name: 'direct-scraping', method: this.tryDirectScraping.bind(this) }
        ];

        for (const method of methods) {
            try {
                console.log(`Probando método: ${method.name}`);
                const result = await method.method(twitterUrl);
                if (result && result.url) {
                    console.log(`Éxito con ${method.name}`);
                    return result;
                }
            } catch (error) {
                console.log(`${method.name} falló:`, error.message);
                continue;
            }
        }

        throw new Error('No se pudo descargar el contenido.');
    }

    async tryTwikit(url) {
        try {
            const apiUrl = `https://twikit.api.0x0.st/api/v1/media?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl, {
                headers: { 'User-Agent': this.userAgent, 'Accept': 'application/json' },
                timeout: 30000
            });

            if (response.data && response.data.media) {
                const media = response.data.media;
                if (media.video && media.video.url) {
                    return { url: media.video.url, type: 'video', quality: media.video.quality || 'HD' };
                }
                if (media.photo && media.photo.url) {
                    return { url: media.photo.url, type: 'image', quality: 'Original' };
                }
                if (media.gif && media.gif.url) {
                    return { url: media.gif.url, type: 'video', quality: 'Original' };
                }
            }
            throw new Error('No se encontraron medios en la respuesta');
        } catch (error) {
            throw new Error(`Twikit: ${error.message}`);
        }
    }

    async tryFxTwitter(url) {
        try {
            const apiUrl = `https://api.fxtwitter.com/status/${this.extractTweetId(url)}`;
            const response = await axios.get(apiUrl, {
                headers: { 'User-Agent': this.userAgent, 'Accept': 'application/json' },
                timeout: 30000
            });

            if (response.data && response.data.tweet) {
                const tweet = response.data.tweet;
                if (tweet.media && tweet.media.videos) {
                    const bestVideo = tweet.media.videos.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                    if (bestVideo && bestVideo.url) {
                        return { url: bestVideo.url, type: 'video', quality: `${bestVideo.bitrate ? Math.round(bestVideo.bitrate / 1000) + 'kbps' : 'HD'}` };
                    }
                    const gif = tweet.media.videos.find(v => v.type === 'gif');
                    if (gif && gif.url) {
                        return { url: gif.url, type: 'video', quality: 'GIF' };
                    }
                }
                if (tweet.media && tweet.media.photos && tweet.media.photos.length > 0) {
                    return { url: tweet.media.photos[0].url, type: 'image', quality: 'Original' };
                }
            }
            throw new Error('No se encontraron medios en el tweet');
        } catch (error) {
            throw new Error(`FxTwitter: ${error.message}`);
        }
    }

    async tryVxTwitter(url) {
        try {
            const apiUrl = `https://api.vxtwitter.com/status/${this.extractTweetId(url)}`;
            const response = await axios.get(apiUrl, {
                headers: { 'User-Agent': this.userAgent, 'Accept': 'application/json' },
                timeout: 30000
            });

            if (response.data) {
                const data = response.data;
                if (data.mediaURLs && data.mediaURLs.length > 0) {
                    const videoUrl = data.mediaURLs.find(url => url.includes('.mp4') || url.includes('.m3u8'));
                    if (videoUrl) {
                        return { url: videoUrl, type: 'video', quality: 'HD' };
                    }
                    const imageUrl = data.mediaURLs[0];
                    if (imageUrl && (imageUrl.includes('.jpg') || imageUrl.includes('.png'))) {
                        return { url: imageUrl, type: 'image', quality: 'Original' };
                    }
                }
                if (data.media_extended && data.media_extended.length > 0) {
                    const media = data.media_extended[0];
                    if (media.type === 'video' && media.video_info && media.video_info.variants) {
                        const bestVariant = media.video_info.variants
                            .filter(v => v.content_type === 'video/mp4')
                            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                        if (bestVariant && bestVariant.url) {
                            return { url: bestVariant.url, type: 'video', quality: `${bestVariant.bitrate ? Math.round(bestVariant.bitrate / 1000) + 'kbps' : 'HD'}` };
                        }
                    } else if (media.type === 'photo' && media.media_url_https) {
                        return { url: media.media_url_https, type: 'image', quality: 'Original' };
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
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            const response = await axios.get(proxyUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                },
                timeout: 30000
            });

            const html = response.data;
            const videoRegex = /(https:\/\/video\.twimg\.com[^"']*\.mp4[^"']*)/gi;
            const videoMatches = html.match(videoRegex);

            if (videoMatches && videoMatches.length > 0) {
                return { url: videoMatches[0], type: 'video', quality: 'HD' };
            }

            const imageRegex = /(https:\/\/pbs\.twimg\.com\/media\/[^"']+\.(jpg|png|webp)[^"']*)/gi;
            const imageMatches = html.match(imageRegex);

            if (imageMatches && imageMatches.length > 0) {
                return { url: imageMatches[0], type: 'image', quality: 'Original' };
            }

            const jsonRegex = /"video_url":"([^"]+)"/g;
            let jsonMatch;
            while ((jsonMatch = jsonRegex.exec(html)) !== null) {
                if (jsonMatch[1].includes('.mp4')) {
                    const videoUrl = jsonMatch[1].replace(/\\u0025/g, '%').replace(/\\\//g, '/');
                    return { url: videoUrl, type: 'video', quality: 'HD' };
                }
            }

            throw new Error('No se encontraron medios en el HTML');
        } catch (error) {
            throw new Error(`Scraping directo: ${error.message}`);
        }
    }

    extractTweetId(url) {
        const match = url.match(/\/(\d+)(?:\?|$)/);
        return match ? match[1] : null;
    }

    async downloadMedia(mediaUrl) {
        try {
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

            return {
                buffer: Buffer.from(response.data),
                contentType: response.headers['content-type'],
                size: response.data.length
            };
        } catch (error) {
            throw new Error(`Error descargando media: ${error.message}`);
        }
    }
}

const twitterService = new TwitterService();

export async function twitterCommand(sock, m, args) {
    try {
        let twitterUrl = args[0];

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
            await sock.sendMessage(m.key.remoteJid, { text: 'Uso correcto: #tw [link]' }, { quoted: m });
            return;
        }

        if (!twitterService.isValidTwitterUrl(twitterUrl)) {
            await sock.sendMessage(m.key.remoteJid, { text: 'URL de Twitter no válida. Asegúrate de que contenga /status/.' }, { quoted: m });
            return;
        }

        try {
            const contentInfo = await twitterService.downloadContent(twitterUrl);
            if (!contentInfo || !contentInfo.url) {
                throw new Error('No se pudo obtener el enlace de descarga');
            }

            const mediaData = await twitterService.downloadMedia(contentInfo.url);
            const caption = contentInfo.type === 'video' ? 'Video descargado' : 'Imagen descargada';

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

        } catch (error) {
            let errorMessage = 'Error al procesar el enlace de Twitter.\n\n';
            errorMessage += `Detalle: ${error.message}`;
            await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
        }

    } catch (error) {
        await sock.sendMessage(m.key.remoteJid, { text: 'Error inesperado. Por favor intenta nuevamente.' }, { quoted: m });
    }
}

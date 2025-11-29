import axios from 'axios';

class FacebookService {
    constructor() {
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Android 14; Mobile; rv:109.0) Gecko/109.0 Firefox/121.0'
        ];
    }

    get userAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    isValidFacebookUrl(url) {
        const regex = /(https?:\/\/)?(www\.|m\.|mbasic\.|web\.)?(facebook|fb)\.(com|watch)\/([^\s]+)/;
        return regex.test(url);
    }

    async resolveFacebookUrl(shortUrl) {
        try {
            if (shortUrl.includes('/videos/') || shortUrl.includes('/reel/')) {
                return shortUrl;
            }
            const response = await axios.get(shortUrl, {
                headers: { 'User-Agent': this.userAgent },
                maxRedirects: 10,
                validateStatus: (status) => status < 400
            });
            return response.request?.res?.responseUrl || response.config.url;
        } catch (error) {
            return shortUrl;
        }
    }

    async downloadContent(fbUrl) {
        if (!this.isValidFacebookUrl(fbUrl)) throw new Error('URL inválida');
        
        const resolvedUrl = await this.resolveFacebookUrl(fbUrl);

        // Lista de APIs en orden de prioridad
        const apis = [
            { name: 'Ryzendesu', method: this.tryRyzendesu.bind(this) },
            { name: 'Widipe', method: this.tryWidipe.bind(this) },
            { name: 'Siputz', method: this.trySiputz.bind(this) }
        ];

        for (const api of apis) {
            try {
                console.log(`🔄 Probando API: ${api.name}`);
                const result = await api.method(resolvedUrl);
                if (result && result.url) return result;
            } catch (error) {
                console.log(`❌ ${api.name} falló.`);
                continue;
            }
        }
        throw new Error('No se pudo descargar el video (Privado o eliminado).');
    }

    // --- APIs (Solo Axios) ---

    async tryRyzendesu(url) {
        const { data } = await axios.get(`https://api.ryzendesu.vip/api/downloader/fbdown?url=${encodeURIComponent(url)}`, { timeout: 10000 });
        if (data?.success && data?.metadata) {
            return {
                url: data.metadata.hd || data.metadata.sd,
                type: 'video'
            };
        }
        throw new Error('Fail Ryzendesu');
    }

    async tryWidipe(url) {
        const { data } = await axios.get(`https://widipe.com/facebook?url=${encodeURIComponent(url)}`, { timeout: 10000 });
        const result = data?.result;
        if (result && (result.hd || result.sd || result.url)) {
            return {
                url: result.hd || result.sd || result.url,
                type: 'video'
            };
        }
        throw new Error('Fail Widipe');
    }

    async trySiputz(url) {
        const { data } = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`, { timeout: 10000 });
        const video = data?.data?.find(v => v.quality === 'HD') || data?.data?.[0];
        if (video?.url) {
            return {
                url: video.url,
                type: 'video'
            };
        }
        throw new Error('Fail Siputz');
    }

    async downloadMedia(mediaUrl) {
        try {
            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'arraybuffer',
                timeout: 40000,
                maxContentLength: 95 * 1024 * 1024,
                headers: {
                    'User-Agent': this.userAgent,
                    'Referer': 'https://www.facebook.com/'
                }
            });
            return { buffer: Buffer.from(response.data) };
        } catch (error) {
            if (error.code === 'ERR_Body_Length_>_MaxContentLength') {
                throw new Error('El video es muy pesado (>95MB).');
            }
            throw new Error('Error de conexión al descargar archivo.');
        }
    }
}

const facebookService = new FacebookService();

export async function facebookCommand(sock, m, args) {
    try {
        let fbUrl = args[0];

        // Lógica para detectar URL en mensaje citado
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
            // Mensaje de ayuda minimalista
            await sock.sendMessage(m.key.remoteJid, { text: '⚠️ Usa: #fb <enlace>' }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { react: { text: "⏳", key: m.key } });

        try {
            const contentInfo = await facebookService.downloadContent(fbUrl);
            const mediaData = await facebookService.downloadMedia(contentInfo.url);

            // Mensajes limpios solicitados
            const cleanCaption = contentInfo.type === 'video' ? '🎥 Video descargado!' : '🖼️ Imagen descargada!';

            if (contentInfo.type === 'video') {
                await sock.sendMessage(m.key.remoteJid, {
                    video: mediaData.buffer,
                    caption: cleanCaption,
                    mimetype: 'video/mp4'
                }, { quoted: m });
            } else {
                await sock.sendMessage(m.key.remoteJid, {
                    image: mediaData.buffer,
                    caption: cleanCaption
                }, { quoted: m });
            }

            await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error('❌ Error FB:', error.message);
            // Error limpio para el usuario
            const errorMsg = error.message.includes('pesado') 
                ? '⚠️ El video es demasiado pesado.' 
                : '⚠️ No se pudo descargar el video.';
            
            await sock.sendMessage(m.key.remoteJid, { text: errorMsg }, { quoted: m });
            await sock.sendMessage(m.key.remoteJid, { react: { text: "❌", key: m.key } });
        }

    } catch (error) {
        console.error('💥 Error Fatal:', error);
    }
}
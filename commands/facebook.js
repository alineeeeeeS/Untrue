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

    /**
     * ¡CORRECCIÓN CLAVE! Ahora incluye el patrón /share/
     * para aceptar enlaces de compartir y Reels.
     */
    isValidFacebookUrl(url) {
        // Acepta: /videos/, /reel/, /watch/, /share/ y /posts/
        const regex = /(https?:\/\/)?(www\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch)\/(share|videos|reel|posts)\/([^\\s]+)/;
        return regex.test(url);
    }
    
    // CONVERSIÓN CRÍTICA: Convierte a mbasic.facebook.com para las APIs
    toMbasicUrl(url) {
        if (!url) return url;
        try {
            // Reemplaza cualquier subdominio por 'mbasic' si es un enlace de Facebook.
            const u = new URL(url);
            if (u.hostname.includes('facebook.com') || u.hostname.includes('fb.watch')) {
                u.hostname = 'mbasic.facebook.com';
            }
            return u.toString();
        } catch (e) {
            // Si falla al parsear la URL, intenta al menos un reemplazo simple.
            return url.replace(/www\.|m\./g, 'mbasic.').replace('fb.watch', 'mbasic.facebook.com/watch');
        }
    }

    async resolveFacebookUrl(shortUrl) {
        try {
            // Este paso es CRUCIAL para URLs /share/ y /fb.watch/.
            // Forzamos una petición GET para que el servidor de Facebook nos redirija
            // a la URL canónica del video que contiene el ID.
            const response = await axios.get(shortUrl, {
                headers: { 
                    'User-Agent': this.userAgent,
                    // Pedimos un HTML básico, no el de la app pesada
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' 
                },
                maxRedirects: 15, // Permitir más redirecciones para enlaces /share/
                validateStatus: (status) => status < 400
            });
            
            // La URL final es la que necesitamos (el ID de video).
            return response.request?.res?.responseUrl || response.config.url;
        } catch (error) {
            console.log(`⚠️ No se pudo resolver la redirección: ${error.message}`);
            return shortUrl;
        }
    }

    async downloadContent(fbUrl) {
        if (!this.isValidFacebookUrl(fbUrl)) {
            throw new Error('URL inválida');
        }

        // 1. Resolver la URL a su versión canónica (Ej: de /share/ a /videos/ID)
        const resolvedUrl = await this.resolveFacebookUrl(fbUrl);
        
        // 2. Convertir la URL resuelta al formato mbasic para las APIs scraper
        const mbasicUrl = this.toMbasicUrl(resolvedUrl);

        // --- LISTA DE APIS (Sin cambios, ya son las más estables) ---
        const apis = [
            { name: 'Isuru FDown', method: this.tryIsuruFDown.bind(this) },
            { name: 'Xtreme APIs', method: this.tryXtreme.bind(this) }
        ];

        for (const api of apis) {
            try {
                console.log(`🔄 Probando API: ${api.name}`);
                const result = await api.method(mbasicUrl); // Pasamos la URL mbasic
                if (result && result.url) return result;
            } catch (error) {
                console.log(`❌ ${api.name} falló:`, error.message);
                continue;
            }
        }
        throw new Error('No se pudo descargar el video (Privado, caído o APIs saturadas).');
    }

    // --- APIs (Solo Axios) ---

    async tryIsuruFDown(url) {
        const apiUrl = `https://fdown.isuru.eu.org/api/v1/download?url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl, { timeout: 15000 });
        
        if (data?.success && data?.data) {
            const bestQuality = data.data.find(v => v.quality.includes('1080p')) || 
                                data.data.find(v => v.quality.includes('720p')) ||
                                data.data[0];

            if (bestQuality?.url) {
                return { url: bestQuality.url, type: 'video' };
            }
        }
        throw new Error('Fail Isuru FDown');
    }

    async tryXtreme(url) {
        const apiUrl = `https://xxtreme-apis.vercel.app/api/downloader/fbdown?url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl, { timeout: 15000 });
        
        if (data?.result?.url) {
            return { url: data.result.url, type: 'video' };
        }
        throw new Error('Fail Xtreme');
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
    // ... (El Command Handler sigue igual para mensajes limpios) ...
    try {
        let fbUrl = args[0];

        // Lógica para detectar URL en mensaje citado (sin cambios)
        if (!fbUrl && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedText = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation || 
                             m.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text;
            if (quotedText) {
                const urlMatch = quotedText.match(/https?:\/\/[^\\s]+/g);
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
            await sock.sendMessage(m.key.remoteJid, { text: '⚠️ Usa: #fb <enlace>' }, { quoted: m });
            return;
        }

        await sock.sendMessage(m.key.remoteJid, { react: { text: "⏳", key: m.key } });

        try {
            // 1. Obtener URL directa del video con la cascada de APIs
            const contentInfo = await facebookService.downloadContent(fbUrl);
            
            // 2. Descargar el archivo (Buffer)
            const mediaData = await facebookService.downloadMedia(contentInfo.url);

            // Mensaje final limpio y minimalista
            const cleanCaption = '🎥 Video descargado!';

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
            console.error('❌ Error FB Command:', error.message);
            
            // Mensaje de error limpio para el usuario
            let errorMsg = '⚠️ No se pudo descargar el video.';
            if (error.message.includes('pesado')) {
                errorMsg = '⚠️ El video es demasiado pesado (>95MB).';
            } else if (error.message.includes('No se pudo descargar')) {
                errorMsg = '⚠️ No se pudo descargar (video privado o enlace expirado).';
            }
            
            await sock.sendMessage(m.key.remoteJid, { text: errorMsg }, { quoted: m });
            await sock.sendMessage(m.key.remoteJid, { react: { text: "❌", key: m.key } });
        }

    } catch (error) {
        console.error('💥 Error Fatal:', error);
    }
}
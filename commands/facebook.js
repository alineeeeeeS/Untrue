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
        const regex = /(https?:\/\/)?(www\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch)\/([^\\s]+)/;
        return regex.test(url);
    }
    
    /**
     * CONVERSIÓN CRÍTICA: Convierte cualquier URL de Facebook a mbasic.facebook.com
     * Esto mejora la compatibilidad con muchas APIs scraper.
     */
    toMbasicUrl(url) {
        if (!url) return url;
        try {
            const u = new URL(url.replace('m.facebook.com', 'facebook.com')); // Normaliza m.
            if (u.hostname.includes('facebook.com')) {
                u.hostname = 'mbasic.facebook.com';
            }
            return u.toString();
        } catch (e) {
            return url;
        }
    }

    async downloadContent(fbUrl) {
        if (!this.isValidFacebookUrl(fbUrl)) throw new Error('URL inválida');
        
        // 1. Pre-procesamiento de URL
        const mbasicUrl = this.toMbasicUrl(fbUrl);

        // --- LISTA DE APIS ACTUALIZADA (Más Estables) ---
        const apis = [
            // 1. API Basada en yt-dlp (Lógica robusta para streams DASH)
            { name: 'Isuru FDown', method: this.tryIsuruFDown.bind(this) },
            // 2. API de Respaldo Comunitario (Nueva Opción)
            { name: 'Xtreme APIs', method: this.tryXtreme.bind(this) }
        ];

        for (const api of apis) {
            try {
                console.log(`🔄 Probando API: ${api.name}`);
                // Le pasamos la URL en formato mbasic
                const result = await api.method(mbasicUrl); 
                
                if (result && result.url) return result;
            } catch (error) {
                console.log(`❌ ${api.name} falló:`, error.message);
                continue;
            }
        }
        throw new Error('No se pudo descargar el video (Privado, caído o APIs saturadas).');
    }

    // --- APIs (Solo Axios) ---

    // API 1: Isuru FDown (Basada en yt-dlp/FFmpeg - Ideal para streams complejos)
    async tryIsuruFDown(url) {
        const apiUrl = `https://fdown.isuru.eu.org/api/v1/download?url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl, { timeout: 15000 });
        
        if (data?.success && data?.data) {
            // Prioriza la opción que tenga la mejor calidad, o la primera
            const bestQuality = data.data.find(v => v.quality.includes('1080p')) || 
                                data.data.find(v => v.quality.includes('720p')) ||
                                data.data[0];

            if (bestQuality?.url) {
                return {
                    url: bestQuality.url,
                    type: 'video'
                };
            }
        }
        throw new Error('Fail Isuru FDown');
    }

    // API 2: Xtreme APIs (Respaldo Comunitario)
    async tryXtreme(url) {
        // Nota: Las APIs Vercel pueden cambiar o tener límites de tasa.
        const apiUrl = `https://xxtreme-apis.vercel.app/api/downloader/fbdown?url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl, { timeout: 15000 });
        
        if (data?.result?.url) {
            return {
                url: data.result.url,
                type: 'video'
            };
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
                    // Header CRÍTICO para evitar 403 Forbidden en la descarga
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
import axios from 'axios';

class FacebookService {
    constructor() {
        // Lista de User Agents más robusta para rotar
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Android 14; Mobile; rv:109.0) Gecko/109.0 Firefox/121.0',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        ];
    }

    get userAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    isValidFacebookUrl(url) {
        // Incluye /share/, /reel/, /watch/ y /posts/
        const regex = /(https?:\/\/)?(www\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch)\/(share|videos|reel|posts)\/([^\\s]+)/;
        return regex.test(url);
    }
    
    toMbasicUrl(url) {
        if (!url) return url;
        try {
            const u = new URL(url);
            if (u.hostname.includes('facebook.com') || u.hostname.includes('fb.watch')) {
                u.hostname = 'mbasic.facebook.com';
            }
            return u.toString();
        } catch (e) {
            return url.replace(/www\.|m\./g, 'mbasic.').replace('fb.watch', 'mbasic.facebook.com/watch');
        }
    }

    /**
     * MEJORA CRÍTICA: Simula un navegador real para evitar el error 400 en redirecciones.
     */
    async resolveFacebookUrl(shortUrl) {
        try {
            console.log('🔗 Resolviendo URL de Facebook...');

            const response = await axios.get(shortUrl, {
                headers: {
                    'User-Agent': this.userAgent, // User-Agent rotativo
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'es-ES,es;q=0.8,en;q=0.5,en-US;q=0.3',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'DNT': '1'
                },
                maxRedirects: 15,
                // Aumentamos el timeout para la resolución
                timeout: 20000, 
                // Permitir estados 4xx para que podamos manejar el error sin romper el flujo
                validateStatus: (status) => status < 500 
            });
            
            if (response.status >= 400) {
                 throw new Error(`Facebook rechazó la solicitud de redirección con código ${response.status}`);
            }

            const finalUrl = response.request?.res?.responseUrl || response.config.url;
            console.log(`✅ URL resuelta: ${finalUrl}`);
            return finalUrl;

        } catch (error) {
            // Si falla la resolución (incluyendo 400), devolvemos la URL original y probamos las APIs
            console.log(`⚠️ No se pudo resolver la redirección: ${error.message}`);
            return shortUrl; 
        }
    }

    async downloadContent(fbUrl) {
        if (!this.isValidFacebookUrl(fbUrl)) {
            throw new Error('URL inválida');
        }

        const resolvedUrl = await this.resolveFacebookUrl(fbUrl);
        const mbasicUrl = this.toMbasicUrl(resolvedUrl);

        // --- LISTA DE APIS (Máxima Estabilidad) ---
        const apis = [
            // 1. Ryzendesu (Históricamente una de las más confiables)
            { name: 'Ryzendesu', method: this.tryRyzendesu.bind(this) },
            // 2. Isuru FDown (Basada en tecnología yt-dlp)
            { name: 'Isuru FDown', method: this.tryIsuruFDown.bind(this) },
            // 3. Siputz (Respaldo final)
            { name: 'Siputz', method: this.trySiputz.bind(this) }
        ];

        for (const api of apis) {
            try {
                console.log(`🔄 Probando API: ${api.name}`);
                const result = await api.method(mbasicUrl); 
                if (result && result.url) return result;
            } catch (error) {
                console.log(`❌ ${api.name} falló:`, error.message);
                continue;
            }
        }
        throw new Error('No se pudo descargar el video (Privado, caído o APIs saturadas).');
    }

    // --- MÉTODOS DE API ACTUALIZADOS CON TIMEOUT A 20s ---

    async tryRyzendesu(url) {
        const apiUrl = `https://api.ryzendesu.vip/api/downloader/fbdown?url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl, { timeout: 20000 }); 

        if (data?.success && data?.metadata) {
            const videoUrl = data.metadata.hd || data.metadata.sd;
            if (videoUrl) return { url: videoUrl, type: 'video' };
        }
        throw new Error('Fail Ryzendesu');
    }

    async tryIsuruFDown(url) {
        const apiUrl = `https://fdown.isuru.eu.org/api/v1/download?url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl, { timeout: 20000 }); 
        
        if (data?.success && data?.data) {
            const bestQuality = data.data.find(v => v.quality.includes('1080p')) || 
                                data.data.find(v => v.quality.includes('720p')) ||
                                data.data[0];

            if (bestQuality?.url) return { url: bestQuality.url, type: 'video' };
        }
        throw new Error('Fail Isuru FDown');
    }

    async trySiputz(url) {
        const apiUrl = `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl, { timeout: 20000 }); 

        if (data?.status && data?.data) {
            const videoData = data.data.find(v => v.quality === 'HD') || data.data.find(v => v.quality === 'SD') || data.data[0];
            if (videoData?.url) return { url: videoData.url, type: 'video' };
        }
        throw new Error('Fail Siputz');
    }

    async downloadMedia(mediaUrl) {
        try {
            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'arraybuffer',
                timeout: 60000, // 60 segundos para la descarga final del archivo
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
            const contentInfo = await facebookService.downloadContent(fbUrl);
            const mediaData = await facebookService.downloadMedia(contentInfo.url);

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
            
            let errorMsg = '⚠️ No se pudo descargar el video.';
            if (error.message.includes('pesado')) {
                errorMsg = '⚠️ El video es demasiado pesado (>95MB).';
            } else if (error.message.includes('Facebook rechazó')) {
                 errorMsg = '⚠️ Error en el enlace. Intenta copiar la URL desde la barra de direcciones o usa otro video.';
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
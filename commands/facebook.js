import axios from 'axios';

class FacebookService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    isValidFacebookUrl(url) {
        const regex = /(https?:\/\/)?(www\.|m\.|mbasic\.)?(facebook|fb)\.(com|watch)\/([^\s]+)/;
        return regex.test(url);
    }

    async resolveFacebookUrl(shortUrl) {
        try {
            console.log('🔗 Resolviendo URL de Facebook...');

            const response = await axios.get(shortUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'es-ES,es;q=0.8,en;q=0.5,en-US;q=0.3',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                maxRedirects: 10,
                timeout: 30000,
                validateStatus: null
            });

            const finalUrl = response.request?.res?.responseUrl || response.config.url;
            console.log(`✅ URL resuelta: ${finalUrl}`);

            return finalUrl;

        } catch (error) {
            console.log('❌ Error resolviendo URL:', error.message);
            return shortUrl;
        }
    }

    async downloadContent(fbUrl) {
        console.log('🔗 Procesando Facebook URL:', fbUrl);

        if (!this.isValidFacebookUrl(fbUrl)) {
            throw new Error('URL de Facebook no válida');
        }

        console.log('✅ URL válida, resolviendo redirección...');

        const resolvedUrl = await this.resolveFacebookUrl(fbUrl);
        console.log(`🔄 URL resuelta: ${resolvedUrl}`);

        // Usar las APIs confiables
        const apis = [
            { name: 'dorratz', method: this.tryDorratz.bind(this) },
            { name: 'agatz', method: this.tryAgatz.bind(this) },
            { name: 'fallback', method: this.tryFallback.bind(this) }
        ];

        for (const api of apis) {
            try {
                console.log(`🔄 Probando API: ${api.name}`);
                const result = await api.method(resolvedUrl);
                if (result && result.url) {
                    console.log(`✅ Éxito con ${api.name}`);
                    return result;
                }
            } catch (error) {
                console.log(`❌ ${api.name} falló:`, error.message);
                continue;
            }
        }

        throw new Error('Todas las APIs fallaron. El video puede ser privado.');
    }

    async tryDorratz(url) {
        try {
            console.log('📡 Usando Dorratz API...');

            const apiUrl = `https://api.dorratz.com/fbvideo?url=${encodeURIComponent(url)}`;
            console.log(`📡 Llamando a: ${apiUrl}`);

            const response = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                },
                timeout: 30000
            });

            console.log('📊 Respuesta Dorratz recibida');

            if (response.data && Array.isArray(response.data)) {
                // Filtrar solo elementos con URLs válidas
                const videosConUrl = response.data.filter((v) => 
                    typeof v.url === 'string' && v.url.startsWith('http')
                );

                if (videosConUrl.length === 0) {
                    throw new Error('No hay URLs válidas en la respuesta');
                }

                // Orden de preferencia: 1080p primero, luego 720p
                const prioridades = ['1080p', '720p (HD)', '720p', '360p (SD)', '360p'];
                let videoSeleccionado = null;

                for (const resolucion of prioridades) {
                    videoSeleccionado = videosConUrl.find((v) => 
                        v.resolution && v.resolution.includes(resolucion)
                    );
                    if (videoSeleccionado) break;
                }

                // Si no se encuentra resolución preferida, usar el primero válido
                if (!videoSeleccionado) {
                    videoSeleccionado = videosConUrl[0];
                }

                console.log(`🎬 Video seleccionado: ${videoSeleccionado.resolution}`);

                return {
                    url: videoSeleccionado.url,
                    type: 'video',
                    quality: videoSeleccionado.resolution || 'Unknown'
                };
            }

            throw new Error('Formato de respuesta inválido');

        } catch (error) {
            throw new Error(`Dorratz: ${error.message}`);
        }
    }

    async tryAgatz(url) {
        try {
            console.log('📡 Usando Agatz API...');

            const apiUrl = `https://api.agatz.xyz/api/facebook?url=${encodeURIComponent(url)}`;
            console.log(`📡 Llamando a: ${apiUrl}`);

            const response = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                },
                timeout: 30000
            });

            console.log('📊 Respuesta Agatz recibida');

            if (response.data && response.data.data) {
                const videoUrl = response.data.data.hd || response.data.data.sd;

                if (videoUrl && (videoUrl.endsWith('.mp4') || videoUrl.includes('.mp4'))) {
                    return {
                        url: videoUrl,
                        type: 'video',
                        quality: response.data.data.hd ? 'HD' : 'SD'
                    };
                }
            }

            throw new Error('No se pudo extraer video');

        } catch (error) {
            throw new Error(`Agatz: ${error.message}`);
        }
    }

    async tryFallback(url) {
        try {
            console.log('📡 Usando API alternativa...');

            // Otra API confiable
            const apiUrl = `https://apis-savior.com/api/download/facebook?url=${encodeURIComponent(url)}`;
            console.log(`📡 Llamando a: ${apiUrl}`);

            const response = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                },
                timeout: 30000
            });

            console.log('📊 Respuesta alternativa recibida');

            if (response.data && response.data.urls && response.data.urls.length > 0) {
                const downloadUrl = response.data.urls[0].hd || response.data.urls[0].sd;

                if (downloadUrl) {
                    return {
                        url: downloadUrl,
                        type: 'video',
                        quality: response.data.urls[0].hd ? 'HD' : 'SD'
                    };
                }
            }

            throw new Error('No se pudo extraer video');

        } catch (error) {
            throw new Error(`Alternativa: ${error.message}`);
        }
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
                    'Referer': 'https://www.facebook.com/'
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

const facebookService = new FacebookService();

export async function facebookCommand(sock, m, args) {
    try {
        let fbUrl = args[0];

        // Obtener URL de mensaje citado
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
            await sock.sendMessage(m.key.remoteJid, { 
                text: `❌ *Uso del comando:*

📹 *Descargar video de Facebook:*
#fb <url_facebook>

*Formatos soportados:*
• facebook.com/watch/?v=...
• fb.watch/...
• facebook.com/share/r/...
• facebook.com/.../videos/...` 
            }, { quoted: m });
            return;
        }

        console.log(`🔍 Validando URL: ${fbUrl}`);

        if (!facebookService.isValidFacebookUrl(fbUrl)) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: '❌ URL de Facebook no válida.' 
            }, { quoted: m });
            return;
        }

        console.log('🚀 Iniciando descarga de Facebook...');

        try {
            // Obtener información del contenido
            const contentInfo = await facebookService.downloadContent(fbUrl);

            if (!contentInfo || !contentInfo.url) {
                throw new Error('No se pudo obtener el enlace de descarga');
            }

            console.log(`📦 Procesando contenido: ${contentInfo.url}`);

            // Descargar el media
            const mediaData = await facebookService.downloadMedia(contentInfo.url);

            // Determinar el mensaje según el tipo de contenido
            const caption = contentInfo.type === 'video' ? '🎥 *Video descargado!*' : '🖼️ *Imagen descargada!*';

            // Enviar directamente el contenido sin mensajes intermedios
            if (contentInfo.type === 'video') {
                await sock.sendMessage(m.key.remoteJid, {
                    video: mediaData.buffer,
                    caption: caption,
                    fileName: 'facebook_video.mp4'
                }, { quoted: m });
            } else {
                await sock.sendMessage(m.key.remoteJid, {
                    image: mediaData.buffer,
                    caption: caption
                }, { quoted: m });
            }

            console.log('✅ Contenido de Facebook enviado correctamente');

        } catch (error) {
            console.error('❌ Error al procesar contenido:', error);

            let errorMessage = '❌ *Error al descargar de Facebook*\n\n';

            if (error.message.includes('Todas las APIs fallaron') || error.message.includes('privado')) {
                errorMessage += '🔒 *No se pudo descargar el video*\n\n';
                errorMessage += '🔄 *Posibles causas:*\n';
                errorMessage += '• El video es privado\n';
                errorMessage += '• El formato de URL no es compatible\n';
                errorMessage += '• Las APIs están temporalmente saturadas\n\n';
                errorMessage += '💡 *Solución:* Intenta con:\n';
                errorMessage += '• Un video público diferente\n';
                errorMessage += '• Otra URL de formato directo\n';
                errorMessage += '• Más tarde';
            } else if (error.message.includes('No se pudo obtener')) {
                errorMessage += '🔧 *No se pudo extraer el video*\n\n';
                errorMessage += '🔄 Intenta con otro video público.';
            } else if (error.message.includes('timeout')) {
                errorMessage += '⏰ *Tiempo de espera agotado*\n';
                errorMessage += '🔄 El video puede ser muy largo.';
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
import axios from 'axios';

class InstagramPostsService {
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
        const regex = /https?:\/\/(www\.)?instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)/;
        return regex.test(url);
    }

    extractPostCode(url) {
        const match = url.match(/instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)/);
        return match ? match[2] : null;
    }

    async downloadPost(postUrl) {
        console.log('🔗 Procesando post:', postUrl);

        if (!this.isValidInstagramUrl(postUrl)) {
            throw new Error('URL de Instagram no válida');
        }

        for (const api of this.apis) {
            try {
                console.log(`🔄 Probando API: ${api.name}`);
                const result = await this.tryAPI(api, postUrl);
                if (result && result.mediaItems && result.mediaItems.length > 0) {
                    console.log(`✅ Éxito con ${api.name} - ${result.mediaItems.length} medios encontrados`);
                    return result;
                }
            } catch (error) {
                console.log(`❌ ${api.name} falló:`, error.message);
                if (api !== this.apis[this.apis.length - 1]) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                continue;
            }
        }

        throw new Error('No se pudo descargar el post. Intenta más tarde.');
    }

    async tryAPI(api, postUrl) {
        try {
            let response;
            const fullUrl = this.buildAPIUrl(api, postUrl);

            console.log(`📡 Llamando a: ${api.name}`);

            const timeout = 25000;

            if (api.method === 'get') {
                response = await axios.get(fullUrl, {
                    headers: { 'User-Agent': this.userAgent },
                    timeout: timeout
                });
            }

            return this.processAPIResponse(api.name, response.data);

        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw new Error(`API ${api.name}: Timeout después de 25s`);
            } else if (error.response?.status === 429) {
                throw new Error(`API ${api.name}: Límite de tasa alcanzado`);
            } else {
                throw new Error(`API ${api.name}: ${error.message}`);
            }
        }
    }

    buildAPIUrl(api, postUrl) {
        const url = new URL(api.url);

        if (api.name === 'siputzx' || api.name === 'betabotz' || api.name === 'lolhuman') {
            url.searchParams.append('url', postUrl);
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
                    if (data.data && Array.isArray(data.data)) {
                        console.log(`📸 siputzx - ${data.data.length} items encontrados`);

                        const mediaItems = data.data
                            .filter(item => item && item.url)
                            .map((item, index) => {
                                const url = item.url;
                                const type = this.determineMediaType(url);
                                console.log(`📦 Item ${index + 1}: ${type} - ${url.substring(0, 50)}...`);
                                return { 
                                    url, 
                                    type,
                                    index: index + 1
                                };
                            });

                        return { 
                            mediaItems, 
                            type: mediaItems.length > 1 ? 'multiple' : 'single',
                            totalItems: mediaItems.length
                        };
                    }
                    break;

                case 'betabotz':
                    if (data.message && Array.isArray(data.message)) {
                        console.log(`📸 betabotz - ${data.message.length} items encontrados`);

                        const mediaItems = data.message
                            .filter(item => item && item._url)
                            .map((item, index) => {
                                const url = item._url;
                                const type = this.determineMediaType(url);
                                console.log(`📦 Item ${index + 1}: ${type} - ${url.substring(0, 50)}...`);
                                return { 
                                    url, 
                                    type,
                                    index: index + 1
                                };
                            });

                        return { 
                            mediaItems, 
                            type: mediaItems.length > 1 ? 'multiple' : 'single',
                            totalItems: mediaItems.length
                        };
                    }
                    break;

                case 'lolhuman':
                    if (data.result) {
                        console.log(`📸 lolhuman - 1 item encontrado`);
                        
                        let url = data.result;
                        if (Array.isArray(data.result) && data.result[0] && data.result[0].url) {
                            url = data.result[0].url;
                        }
                        
                        const type = this.determineMediaType(url);
                        console.log(`📦 Item 1: ${type} - ${url.substring(0, 50)}...`);
                        
                        return { 
                            mediaItems: [{ 
                                url, 
                                type,
                                index: 1 
                            }], 
                            type: 'single',
                            totalItems: 1
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
        if (!url) return 'unknown';

        if (url.includes('.mp4') || url.includes('.mov') || url.includes('.avi')) {
            return 'video';
        } else if (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.webp')) {
            return 'image';
        } else {
            return 'video';
        }
    }

    async downloadMedia(mediaUrl) {
        try {
            console.log('📥 Descargando media:', mediaUrl.substring(0, 80) + '...');

            if (!mediaUrl || !mediaUrl.startsWith('http')) {
                throw new Error('URL de media no válida');
            }

            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'arraybuffer',
                timeout: 45000,
                maxContentLength: 100 * 1024 * 1024,
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'video/mp4,video/*,image/*,*/*;q=0.8',
                    'Referer': 'https://www.instagram.com/'
                }
            });

            if (!response.data || response.data.length === 0) {
                throw new Error('El contenido descargado está vacío');
            }

            const fileSizeMB = (response.data.length / 1024 / 1024).toFixed(2);
            console.log(`✅ Media descargado - Tamaño: ${fileSizeMB} MB`);

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

    validateMediaBuffer(buffer, expectedType) {
        if (!buffer || buffer.length === 0) {
            throw new Error('Buffer de media vacío');
        }

        const minSize = expectedType === 'video' ? 50000 : 10000;
        if (buffer.length < minSize) {
            throw new Error(`Media demasiado pequeño (${buffer.length} bytes), probablemente corrupto`);
        }

        return true;
    }
}

const instagramPostsService = new InstagramPostsService();

export async function igpostsCommand(sock, m, args) {    
    try {
        let postUrl = args[0];
        let selectedIndex = null;

        // Verificar si el primer argumento es un número (selección de carrusel)
        if (args.length >= 2 && !isNaN(args[0])) {
            selectedIndex = parseInt(args[0]);
            postUrl = args[1];
            console.log(`🎯 Usuario seleccionó carrusel: ${selectedIndex}`);
        }

        // Obtener URL de mensaje citado
        if (!postUrl && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedText = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation || 
                             m.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text;
            if (quotedText) {
                const urlMatch = quotedText.match(/https?:\/\/[^\s]+/g);
                if (urlMatch) {
                    for (const url of urlMatch) {
                        if (instagramPostsService.isValidInstagramUrl(url)) {
                            postUrl = url;
                            break;
                        }
                    }
                }
            }
        }

        if (!postUrl) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: `❌ *Uso del comando:*

📸 *Descargar todo el post:*
#post <url_instagram>

🎯 *Descargar carrusel específico:*
#post <número> <url_instagram>

*Ejemplos:*
#post https://instagram.com/p/ABC123...
#post 3 https://instagram.com/p/ABC123...` 
            }, { quoted: m });
            return;
        }

        if (!instagramPostsService.isValidInstagramUrl(postUrl)) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: '❌ URL de Instagram no válida. Debe ser un Post o Reel público.' 
            }, { quoted: m });
            return;
        }

        console.log('🚀 Iniciando descarga de post...');

        // Obtener información del post
        const postInfo = await instagramPostsService.downloadPost(postUrl);

        if (!postInfo || !postInfo.mediaItems || postInfo.mediaItems.length === 0) {
            throw new Error('No se encontraron medios en el post');
        }

        console.log(`📦 Procesando ${postInfo.mediaItems.length} medios`);

        // Validar selección de carrusel si se especificó
        if (selectedIndex !== null) {
            if (selectedIndex < 1 || selectedIndex > postInfo.mediaItems.length) {
                await sock.sendMessage(m.key.remoteJid, { 
                    text: `❌ *Número de carrusel inválido*\n\nEste post tiene ${postInfo.mediaItems.length} elementos.\nUsa un número entre 1 y ${postInfo.mediaItems.length}.` 
                }, { quoted: m });
                return;
            }

            // Descargar solo el carrusel seleccionado
            const selectedMedia = postInfo.mediaItems[selectedIndex - 1];
            console.log(`🎯 Descargando carrusel ${selectedIndex}`);

            const mediaData = await instagramPostsService.downloadMedia(selectedMedia.url);
            instagramPostsService.validateMediaBuffer(mediaData.buffer, selectedMedia.type);

            const caption = `Post descargado! (${selectedIndex}/${postInfo.mediaItems.length})`;

            if (selectedMedia.type === 'image') {
                await sock.sendMessage(m.key.remoteJid, {
                    image: mediaData.buffer,
                    caption: caption
                }, { quoted: m });
            } else {
                await sock.sendMessage(m.key.remoteJid, {
                    video: mediaData.buffer,
                    caption: caption,
                    fileName: `instagram_carrusel_${selectedIndex}.mp4`
                }, { quoted: m });
            }

            console.log(`✅ Carrusel ${selectedIndex} enviado correctamente`);
            return;
        }

        // Descargar todo el post
        if (postInfo.mediaItems.length === 1) {
            // POST SIMPLE - 1 medio
            const mediaItem = postInfo.mediaItems[0];
            const mediaData = await instagramPostsService.downloadMedia(mediaItem.url);
            instagramPostsService.validateMediaBuffer(mediaData.buffer, mediaItem.type);

            await sock.sendMessage(m.key.remoteJid, {
                [mediaItem.type === 'image' ? 'image' : 'video']: mediaData.buffer,
                caption: 'Post descargado!',
                ...(mediaItem.type === 'video' && { fileName: 'instagram_post.mp4' })
            }, { quoted: m });

            console.log('✅ Post único enviado correctamente');
        } else {
            // CARRUSEL COMPLETO - Múltiples medios
            console.log(`📤 Enviando carrusel completo: ${postInfo.mediaItems.length} medios`);

            for (let i = 0; i < postInfo.mediaItems.length; i++) {
                const mediaItem = postInfo.mediaItems[i];
                console.log(`📤 Enviando medio ${i + 1}/${postInfo.mediaItems.length}`);

                try {
                    const mediaData = await instagramPostsService.downloadMedia(mediaItem.url);
                    instagramPostsService.validateMediaBuffer(mediaData.buffer, mediaItem.type);

                    // Solo el primer medio lleva caption
                    const caption = i === 0 ? 'Carrusel descargado!' : undefined;

                    await sock.sendMessage(m.key.remoteJid, {
                        [mediaItem.type === 'image' ? 'image' : 'video']: mediaData.buffer,
                        caption: caption,
                        ...(mediaItem.type === 'video' && { fileName: `instagram_post_${i + 1}.mp4` })
                    }, i === 0 ? { quoted: m } : undefined);

                    console.log(`✅ Medio ${i + 1} enviado`);

                    // Pequeña pausa entre envíos
                    if (i < postInfo.mediaItems.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }

                } catch (mediaError) {
                    console.error(`❌ Error enviando medio ${i + 1}:`, mediaError.message);
                    continue;
                }
            }
        }

        console.log('🎉 Post procesado correctamente');

    } catch (error) {
        console.error('Error general:', error);

        let errorMessage = '❌ *Error al descargar el post*\n\n';

        if (error.message.includes('No se pudo descargar')) {
            errorMessage += '🔧 *Servicios temporalmente no disponibles*\n\n';
            errorMessage += '💡 *Sugerencias:*\n';
            errorMessage += '• Intenta en 5-10 minutos\n';
            errorMessage += '• Prueba con otro post\n';
            errorMessage += '• Usa #reel para Reels (más confiable)';
        } else if (error.message.includes('vacío') || error.message.includes('corrupto')) {
            errorMessage += '📱 *El contenido descargado está corrupto*\n';
            errorMessage += '🔄 Intenta con otro post.';
        } else if (error.message.includes('Timeout')) {
            errorMessage += '⏰ *Tiempo de espera agotado*\n';
            errorMessage += 'Los servicios están lentos. Intenta más tarde.';
        } else if (error.message.includes('Límite de tasa')) {
            errorMessage += '🚫 *Límite de uso alcanzado*\n';
            errorMessage += 'Espera unos minutos antes de intentar nuevamente.';
        } else {
            errorMessage += `⚠️ *Error:* ${error.message}\n`;
            errorMessage += '🔄 Intenta con otro enlace.';
        }

        await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
    }
}

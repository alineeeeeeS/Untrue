import axios from 'axios';

class InstagramPostsService {
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

        // Probar cada API en secuencia
        for (const api of this.apis) {
            try {
                console.log(`🔄 Probando API: ${api.name}`);
                const result = await this.tryAPI(api, postUrl);
                if (result && result.mediaItems && result.mediaItems.length > 0) {
                    console.log(`🎯 ${api.name} FUNCIONÓ - ${result.mediaItems.length} medios encontrados`);
                    return result;
                }
            } catch (error) {
                console.log(`❌ ${api.name} falló:`, error.message);
                continue;
            }
        }

        throw new Error('No se pudo descargar el post. Intenta más tarde.');
    }

    async tryAPI(api, postUrl) {
        try {
            const fullUrl = this.buildAPIUrl(api, postUrl);
            console.log(`📡 Llamando a: ${api.name}`);

            const response = await axios.get(fullUrl, {
                headers: { 'User-Agent': this.userAgent },
                timeout: 20000
            });

            return this.processAPIResponse(api.name, response.data);

        } catch (error) {
            throw new Error(`API ${api.name}: ${error.message}`);
        }
    }

    buildAPIUrl(api, postUrl) {
        const url = new URL(api.url);
        
        // Todas las nuevas APIs usan parámetro 'url'
        url.searchParams.append('url', postUrl);

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
                    if (data.result && Array.isArray(data.result)) {
                        console.log(`📸 yudamods - ${data.result.length} items encontrados`);

                        const mediaItems = data.result
                            .filter(item => item && item.url)
                            .map((item, index) => {
                                const url = item.url;
                                const type = this.determineMediaType(url);
                                console.log(`📦 Item ${index + 1}: ${url} - Tipo: ${type}`);
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

                case 'skizoapi':
                    if (data.media && Array.isArray(data.media)) {
                        console.log(`📸 skizoapi - ${data.media.length} items encontrados`);

                        const mediaItems = data.media
                            .filter(item => item && item.url)
                            .map((item, index) => {
                                const url = item.url;
                                const type = this.determineMediaType(url);
                                console.log(`📦 Item ${index + 1}: ${url} - Tipo: ${type}`);
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

                case 'shizoco':
                case 'shizoco-single':
                case 'shizoco-dl':
                case 'shizoco-api1':
                case 'shizoco-api2':
                    // Shizoco tiene múltiples endpoints con estructura similar
                    if (data.data && Array.isArray(data.data)) {
                        console.log(`📸 ${apiName} - ${data.data.length} items encontrados`);

                        const mediaItems = data.data
                            .filter(item => item && item.url)
                            .map((item, index) => {
                                const url = item.url;
                                const type = this.determineMediaType(url);
                                console.log(`📦 Item ${index + 1}: ${url} - Tipo: ${type}`);
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
                    // Alternativa para algunos endpoints de Shizoco
                    if (data.result && Array.isArray(data.result)) {
                        console.log(`📸 ${apiName} - ${data.result.length} items encontrados`);

                        const mediaItems = data.result
                            .filter(item => item && item.url)
                            .map((item, index) => {
                                const url = item.url;
                                const type = this.determineMediaType(url);
                                console.log(`📦 Item ${index + 1}: ${url} - Tipo: ${type}`);
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

                case 'api-sip':
                    if (data.data && Array.isArray(data.data)) {
                        console.log(`📸 api-sip - ${data.data.length} items encontrados`);

                        const mediaItems = data.data
                            .filter(item => item && item.url)
                            .map((item, index) => {
                                const url = item.url;
                                const type = this.determineMediaType(url);
                                console.log(`📦 Item ${index + 1}: ${url} - Tipo: ${type}`);
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
            console.log('📥 Descargando media:', mediaUrl);

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

    validateMediaBuffer(buffer, expectedType) {
        if (!buffer || buffer.length === 0) {
            throw new Error('Buffer de media vacío');
        }

        if (expectedType === 'image') {
            const header = buffer.slice(0, 8);
            if (header.includes('JFIF') || header.includes('Exif') || header.includes('PNG') || header.includes('WEBP')) {
                return true;
            }
        } else if (expectedType === 'video') {
            if (buffer.length < 1000) {
                throw new Error('Video demasiado pequeño, probablemente corrupto');
            }
        }

        return true;
    }

    // Nueva función para obtener información del post sin descargar
    async getPostInfo(postUrl) {
        try {
            const postInfo = await this.downloadPost(postUrl);
            return {
                totalItems: postInfo.totalItems,
                mediaItems: postInfo.mediaItems.map(item => ({
                    index: item.index,
                    type: item.type
                }))
            };
        } catch (error) {
            throw new Error(`Error obteniendo información del post: ${error.message}`);
        }
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

        try {
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
                console.log(`🎯 Descargando carrusel ${selectedIndex}: ${selectedMedia.url}`);

                const mediaData = await instagramPostsService.downloadMedia(selectedMedia.url);
                instagramPostsService.validateMediaBuffer(mediaData.buffer, selectedMedia.type);

                const caption = `✅ Carrusel ${selectedIndex}/${postInfo.mediaItems.length} descargado!`;

                if (selectedMedia.type === 'image') {
                    await sock.sendMessage(m.key.remoteJid, {
                        image: mediaData.buffer,
                        caption: caption
                    }, { quoted: m });
                    console.log(`✅ Carrusel ${selectedIndex} enviado correctamente`);
                } else {
                    await sock.sendMessage(m.key.remoteJid, {
                        video: mediaData.buffer,
                        caption: caption,
                        fileName: `instagram_carrusel_${selectedIndex}.mp4`
                    }, { quoted: m });
                    console.log(`✅ Carrusel ${selectedIndex} enviado correctamente`);
                }

                return;
            }

            // Si no se especificó carrusel, descargar todo el post
            // Para posts con un solo medio
            if (postInfo.mediaItems.length === 1) {
                const mediaItem = postInfo.mediaItems[0];
                console.log(`📤 Enviando medio único: ${mediaItem.url}`);

                const mediaData = await instagramPostsService.downloadMedia(mediaItem.url);
                instagramPostsService.validateMediaBuffer(mediaData.buffer, mediaItem.type);

                await sock.sendMessage(m.key.remoteJid, {
                    [mediaItem.type === 'image' ? 'image' : 'video']: mediaData.buffer,
                    caption: '✅ Post descargado!',
                    ...(mediaItem.type === 'video' && { fileName: 'instagram_post.mp4' })
                }, { quoted: m });

                console.log('✅ Post único enviado correctamente');
            }
            // Para posts con múltiples medios
            else {
                console.log(`📤 Enviando ${postInfo.mediaItems.length} medios múltiples`);

                // Primero enviar mensaje informativo
                await sock.sendMessage(m.key.remoteJid, { 
                    text: `📦 *Post con ${postInfo.mediaItems.length} elementos*\n\n💡 *Tip:* Puedes descargar un carrusel específico usando:\n#post <número> <url>\n*Ejemplo:* #post 3 ${postUrl}` 
                }, { quoted: m });

                // Luego enviar todos los medios
                for (let i = 0; i < postInfo.mediaItems.length; i++) {
                    const mediaItem = postInfo.mediaItems[i];
                    console.log(`📤 Enviando medio ${i + 1}/${postInfo.mediaItems.length}: ${mediaItem.url}`);

                    try {
                        const mediaData = await instagramPostsService.downloadMedia(mediaItem.url);
                        instagramPostsService.validateMediaBuffer(mediaData.buffer, mediaItem.type);

                        const caption = i === 0 
                            ? `✅ Post descargado! (${i + 1}/${postInfo.mediaItems.length})`
                            : `(${i + 1}/${postInfo.mediaItems.length})`;

                        await sock.sendMessage(m.key.remoteJid, {
                            [mediaItem.type === 'image' ? 'image' : 'video']: mediaData.buffer,
                            caption: i === 0 ? caption : undefined,
                            ...(mediaItem.type === 'video' && { fileName: `instagram_post_${i + 1}.mp4` })
                        }, i === 0 ? { quoted: m } : undefined);

                        console.log(`✅ Medio ${i + 1} enviado`);

                        // Pequeña pausa entre envíos
                        if (i < postInfo.mediaItems.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }

                    } catch (mediaError) {
                        console.error(`❌ Error enviando medio ${i + 1}:`, mediaError.message);
                        continue;
                    }
                }
            }

            console.log('🎉 Todos los medios enviados correctamente');

        } catch (error) {
            console.error('❌ Error al procesar post:', error);

            let errorMessage = '❌ *Error al descargar el post*\n\n';

            if (error.message.includes('No se pudo descargar')) {
                errorMessage += '🔧 *El post no está disponible o es privado*\n\n';
                errorMessage += '🔄 Intenta con otro post.';
            } else if (error.message.includes('vacío') || error.message.includes('corrupto')) {
                errorMessage += '📱 *El contenido descargado está corrupto*\n';
                errorMessage += '🔄 Intenta con otro post o más tarde.';
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

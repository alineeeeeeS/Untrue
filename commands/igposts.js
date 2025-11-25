import axios from 'axios';

class InstagramPostsService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        this.apis = [
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
        const regex = /https?:\/\/(www\.)?instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)/;
        return regex.test(url);
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
                
                if (api.name === 'snapinsta' || api.name === 'instasupersave' || api.name === 'savefrom') {
                    data.url = postUrl;
                } else if (api.name === 'igram') {
                    data.q = postUrl;
                }

                const formData = new URLSearchParams();
                for (const [key, value] of Object.entries(data)) {
                    formData.append(key, value);
                }
                config.data = formData;
                
                response = await axios.post(api.url, formData, config);
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
                case 'snapinsta':
                    if (data.data && Array.isArray(data.data)) {
                        const mediaItems = data.data
                            .filter(item => item && item.url)
                            .map((item, index) => ({
                                url: item.url,
                                type: this.determineMediaType(item.url),
                                index: index + 1
                            }));

                        return { 
                            mediaItems, 
                            type: mediaItems.length > 1 ? 'multiple' : 'single',
                            totalItems: mediaItems.length
                        };
                    }
                    break;

                case 'igram':
                    if (data.data && Array.isArray(data.data)) {
                        const mediaItems = data.data
                            .filter(item => item && item.src)
                            .map((item, index) => ({
                                url: item.src,
                                type: this.determineMediaType(item.src),
                                index: index + 1
                            }));

                        return { 
                            mediaItems, 
                            type: mediaItems.length > 1 ? 'multiple' : 'single',
                            totalItems: mediaItems.length
                        };
                    }
                    break;

                case 'instasupersave':
                    if (data.medias && Array.isArray(data.medias)) {
                        const mediaItems = data.medias
                            .filter(item => item && item.url)
                            .map((item, index) => ({
                                url: item.url,
                                type: this.determineMediaType(item.url),
                                index: index + 1
                            }));

                        return { 
                            mediaItems, 
                            type: mediaItems.length > 1 ? 'multiple' : 'single',
                            totalItems: mediaItems.length
                        };
                    }
                    break;

                case 'savefrom':
                    if (data.result && Array.isArray(data.result)) {
                        const mediaItems = data.result
                            .filter(item => item && item.url)
                            .map((item, index) => ({
                                url: item.url,
                                type: this.determineMediaType(item.url),
                                index: index + 1
                            }));

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
        return url.includes('.mp4') ? 'video' : 'image';
    }

    async downloadMedia(mediaUrl) {
        try {
            console.log('📥 Descargando media:', mediaUrl);

            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'arraybuffer',
                timeout: 45000,
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'video/mp4,video/*,image/*,*/*;q=0.8',
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

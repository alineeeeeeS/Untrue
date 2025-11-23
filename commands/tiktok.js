import { downloadTiktokVideo, downloadTiktokImages, cleanUpFile, getTiktokVideoInfo } from '../services/tiktokDownloader.js';
import { join } from 'path';
import { readdirSync, readFileSync } from 'fs';

/**
 * Comando unificado para descargar y enviar contenido de TikTok (Video o Carrusel de Fotos).
 * Comandos: #tt [enlace] o #tiktok [enlace]
 */
export async function tiktokCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const url = args[0];

    // 1. Validar el enlace
    if (!url || !url.includes('tiktok.com')) {
        await sock.sendMessage(remoteJid, { 
            text: `❌ *ENLACE INVÁLIDO*\n\nPor favor, proporciona un enlace de TikTok válido.\n\nEjemplo: *#tiktok https://vm.tiktok.com/...*` 
        }, { quoted: m });
        return;
    }

    let tempPath = null;
    let isCarousel = false;
    let info = null;
    let downloadResult = null;

    try {
        await sock.sendPresenceUpdate('composing', remoteJid); // Feedback sutil

        // 2. Obtener información primero para determinar el tipo
        info = await getTiktokVideoInfo(url);
        isCarousel = info.isCarousel;

        // --- DETECCIÓN ROBUSTA / FALLBACK PARA CARRUSELES PROBLEMATICOS ---
        // Si la obtención de info falla (Autor desconocido) Y no lo detectó como carrusel,
        // intentamos forzar la descarga de carrusel (usando la librería robusta).
        if (info.author === 'Autor desconocido' && !isCarousel) {
            console.log('⚠️ Info fallida, intentando descarga directa de carrusel como fallback...');

            // NO enviamos mensaje de progreso.
            downloadResult = await downloadTiktokImages(url);

            if (downloadResult && downloadResult.filePaths) {
                isCarousel = true; // Se descargó con éxito, lo marcamos como carrusel
                info = downloadResult.videoInfo; // Usamos la info obtenida durante el proceso
            }
        }

        // 3. Lógica de Branching
        if (isCarousel) {
            // --- LÓGICA DE CARRUSEL DE IMÁGENES ---

            // Si downloadResult NO se estableció en el fallback, lo descargamos aquí
            if (!downloadResult) {
                // NO enviamos mensaje de progreso.
                downloadResult = await downloadTiktokImages(url);

                if (!downloadResult || !downloadResult.filePaths) {
                    await sock.sendMessage(remoteJid, { 
                        text: `⚠️ *ERROR AL DESCARGAR CARRUSEL.*\n\nEl enlace es un Photo Post, pero falló la descarga.` 
                    }, { quoted: m });
                    return;
                }
                info = downloadResult.videoInfo;
            }

            tempPath = downloadResult.filePaths; // tempPath es la ruta del directorio

            // Enviar imágenes (Lógica de Carrusel)
            const files = readdirSync(tempPath).filter(name => name.match(/\.(jpe?g|png)$/i));

            if (files.length === 0) {
                await sock.sendMessage(remoteJid, { 
                    text: '❌ *No se encontraron imágenes* en la descarga del carrusel.' 
                }, { quoted: m });
                return;
            }

            // Preparar el caption
            const caption = buildImageCarouselCaption(info);

            // Enviar todas las imágenes
            for (let i = 0; i < files.length; i++) {
                const filePath = join(tempPath, files[i]);
                const imageBuffer = readFileSync(filePath);

                await sock.sendMessage(remoteJid, { 
                    image: imageBuffer,
                    caption: i === 0 ? caption : undefined // Solo la primera lleva la descripción
                }, { quoted: m });
            }
            // NO enviamos mensaje de "Todas las imágenes enviadas correctamente".
            console.log(`✅ Carrusel de ${files.length} imágenes de TikTok enviado.`);


        } else if (!isCarousel) {
            // --- LÓGICA DE VIDEO (Original) ---
            // NO enviamos mensaje de progreso.
            downloadResult = await downloadTiktokVideo(url);

            if (!downloadResult || !downloadResult.filePath) {
                await sock.sendMessage(remoteJid, { 
                    text: `⚠️ *ERROR EN LA DESCARGA*\n\nNo se pudo descargar el contenido. El enlace podría ser privado o haber sido eliminado.` 
                }, { quoted: m });
                return;
            }

            tempPath = downloadResult.filePath; // tempPath es la ruta del archivo
            const videoInfo = downloadResult.videoInfo;
            const caption = buildVideoCaption(videoInfo);

            // 4. Enviar el video
            await sock.sendMessage(remoteJid, { 
                video: { url: tempPath },
                caption: caption,
                mimetype: 'video/mp4',
                gifPlayback: false 
            }, { quoted: m });

            console.log('✅ Video de TikTok enviado exitosamente');
        }

    } catch (error) {
        console.error('❌ Error general en tiktokCommand:', error);
        await sock.sendMessage(remoteJid, { 
            text: '💥 Error inesperado al procesar el contenido de TikTok. Revisa el log.' 
        }, { quoted: m });
    } finally {
        // 5. Limpieza
        cleanUpFile(tempPath);
        await sock.sendPresenceUpdate('available', remoteJid);
    }
}

// ----------------------------------------------------------------------
// --- FUNCIONES DE CAPTION OPTIMIZADAS (Recorte a 15 palabras) ---
// ----------------------------------------------------------------------

/**
 * Construye el caption con la información esencial del carrusel
 */
function buildImageCarouselCaption(info) {
    const author = info.author || 'N/A';
    const description = info.description || info.title || '';

    // Recortar la descripción a un máximo de 15 palabras
    const contentText = truncateWords(description, 15);

    return `👤 *Autor:* ${author}\n` +
           `📝 ${contentText}`
}

/**
 * Construye el caption con la información esencial del video
 */
function buildVideoCaption(videoInfo) {
    const author = videoInfo.author || 'N/A';
    const description = videoInfo.description || '';
    const title = videoInfo.title || '';

    // Si la descripción y el título son diferentes, usamos la descripción; si no, el título.
    let sourceText = description;
    if (!description || description === title) {
        sourceText = title;
    }

    // Recortar el texto a un máximo de 15 palabras
    const contentText = truncateWords(sourceText, 15);

    return `👤 *Autor:* ${author}\n` +
           `📝 ${contentText}`
}

/**
 * Recorta texto basado en un límite de palabras, no de caracteres.
 * @param {string} text Texto a recortar
 * @param {number} maxWords Longitud máxima en palabras
 * @returns {string} Texto recortado
 */
function truncateWords(text, maxWords) {
    if (!text) return 'Sin descripción';

    const words = text.split(/\s+/).filter(word => word.length > 0);

    if (words.length <= maxWords) {
        return text;
    }

    // Unir las primeras 'maxWords' palabras y añadir puntos suspensivos
    return words.slice(0, maxWords).join(' ') + '...';
}
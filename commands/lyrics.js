import fetch from 'node-fetch';
import * as cheerio from 'cheerio'; 

const BASE_URL = 'https://www.letras.com';

/**
 * Función auxiliar para intentar el scrape con una división Artista/Título dada.
 */
async function attemptScrape(artistParts, titleParts) {
    if (artistParts.length === 0 || titleParts.length === 0) {
        return { lyrics: null, title: null, artist: null, url: null };
    }

    const artistSlug = artistParts.join('-');
    const titleSlug = titleParts.join('-');

    // Construir la URL estricta: /artista/cancion/
    const directUrl = `${BASE_URL}/${encodeURIComponent(artistSlug)}/${encodeURIComponent(titleSlug)}/`;

    console.log(`Intentando URL Estricta: ${directUrl}`);

    try {
        const response = await fetch(directUrl, {
             headers: {
                // User-agent robusto
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
             console.log(`URL Estricta falló con estado: ${response.status}`);
             return { lyrics: null, title: null, artist: null, url: null };
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // EXTRAER METADATOS PRECISOS
        const titleText = $('h1.textStyle-primary').text().trim();
        const artistText = $('h2.textStyle-secondary').text().trim();
        const lyricsHTML = $('div.lyric-original').html(); 

        // --- INICIO DE DOBLE VALIDACIÓN ESTRICTA ---
        if (!lyricsHTML || titleText.length < 3 || artistText.length < 3) {
             return { lyrics: null, title: null, artist: null, url: directUrl };
        }

        // Normalizar textos para una comparación estricta (eliminar espacios y puntuación)
        const scrapedArtistNormalized = artistText.toLowerCase().replace(/[^\w]/g, '');
        const expectedArtistNormalized = artistParts.join('').toLowerCase().replace(/[^\w]/g, '');

        const scrapedTitleNormalized = titleText.toLowerCase().replace(/[^\w]/g, '');
        const expectedTitleNormalized = titleParts.join('').toLowerCase().replace(/[^\w]/g, '');

        // Validar que el artista y el título extraídos de la página contengan las palabras intentadas.
        const artistMatch = scrapedArtistNormalized.includes(expectedArtistNormalized);
        const titleMatch = scrapedTitleNormalized.includes(expectedTitleNormalized);

        if (!artistMatch || !titleMatch) {
             console.log(`❌ Doble Validación fallida. Artista extraído: ${artistText}. Título extraído: ${titleText}.`);
             // Si falla la validación, retorna null para que la iteración continúe con la siguiente división.
             return { lyrics: null, title: null, artist: null, url: null };
        }
        // --- FIN DE DOBLE VALIDACIÓN ESTRICTA ---

        // El formato de la letra sigue igual, ya que eso estaba bien
        let lyricsContent = lyricsHTML
            .replace(/<br\s*\/?>/gi, '\n')     
            .replace(/<\/p>/gi, '\n\n')        
            .replace(/<[^>]*>/g, '')          
            .trim();

        if (lyricsContent.length > 150) {
            // Éxito: devolvemos todos los datos
            return { lyrics: lyricsContent, title: titleText, artist: artistText, url: directUrl };
        }

        return { lyrics: null, title: null, artist: null, url: null };

    } catch (error) {
        console.error('❌ Error en attemptScrape:', error);
    }
    return { lyrics: null, title: null, artist: null, url: null };
}


/**
 * Función que prueba múltiples separaciones Artista/Título.
 * @param {string} query Artista y Título
 * @returns {{lyrics: string|null, url: string|null}} Resultado con letra y URL
 */
async function scrapeLyricsByDirectUrl(query) {
    const parts = query.toLowerCase().trim().split(/\s+/).filter(p => p);

    if (parts.length < 2) {
        return { lyrics: null, title: null, artist: null, url: null };
    }

    // Intentaremos de 1 a 4 palabras para el artista.
    const maxArtistWords = Math.min(parts.length - 1, 4); 

    for (let i = 1; i <= maxArtistWords; i++) {
        const artistParts = parts.slice(0, i);
        const titleParts = parts.slice(i);

        const result = await attemptScrape(artistParts, titleParts);

        if (result.lyrics) {
            // El resultado pasa la doble validación estricta y tiene letra > 150
            console.log(`✅ Éxito con ${i} palabra(s) para el artista.`);
            return result; 
        }
    }

    return { lyrics: null, title: null, artist: null, url: null };
}


/**
 * Comando para buscar y enviar la letra completa de una canción usando el scraper directo.
 * Comandos: #letra [artista] [canción]
 */
export async function lyricsCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const query = args.join(' ');

    if (!query) {
        await sock.sendMessage(remoteJid, { 
            text: `❌ *Faltan datos de la canción*\n\n▸ *Uso correcto:* #letra radiohead airbag` 
        }, { quoted: m });
        return;
    }

    try {
        await sock.sendPresenceUpdate('composing', remoteJid);

        console.log(`🎵 Scraper Directo (Letras.com). Query: "${query}"`);

        // 1. Intentar construir y scrapear la URL Directa
        const { lyrics, title, artist, url } = await scrapeLyricsByDirectUrl(query);

        if (!lyrics) {
            await sock.sendMessage(remoteJid, { 
                text: `⚠️ *Letra no encontrada*\n\n▸ Asegúrate de escribir el artista y el título correctamente.\n▸ Si está todo bien y sigue sin encontrarse, los servidores de _letras.com_ no la tienen registrada.` 
            }, { quoted: m });
            return;
        }

        console.log(`✅ URL Scrapeada con éxito: ${url}`);

        // 2. Formato del mensaje
        const responseText = `
*Título:* ${title || 'N/A'}
*Artista:* ${artist || 'N/A'}

${lyrics}

---------------------------------
✨ Fuente: _letras.com_
`.trim();

        await sock.sendMessage(remoteJid, { text: responseText }, { quoted: m });
        console.log(`✅ Letra de "${query}" enviada.`);

    } catch (error) {
        console.error('❌ Error en el comando #letra (Scraper Directo):', error);

        await sock.sendMessage(remoteJid, { 
            text: '💥 Error crítico al ejecutar el Scraper. Intenta de nuevo.' 
        }, { quoted: m });
    } finally {
        await sock.sendPresenceUpdate('available', remoteJid);
    }
}
import fetch from 'node-fetch';

export async function coverCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    // 1. Mensaje de uso (Siguiendo tu estilo minimalista)
    if (!args || args.length === 0) {
        return sock.sendMessage(remoteJid, { 
            text: "❌ *Uso correcto:*\n▸ #cover _artista_, _álbum/sencillo_" 
        }, { quoted: m });
    }

    // 2. Procesar la consulta
    const fullQuery = args.join(' ');
    // Intentamos separar por coma, si no hay coma, usamos todo el texto
    const [artist, album] = fullQuery.includes(',') 
        ? fullQuery.split(',').map(item => item.trim()) 
        : [null, fullQuery.trim()];

    const searchTerm = artist ? `${artist} ${album}` : album;

    try {
        // Reacción de búsqueda
        await sock.sendMessage(remoteJid, { react: { text: "🖼️", key: m.key } });

        // 3. Llamada a la API de iTunes
        // entity=album busca discos, entity=song busca sencillos. Usamos musicArtist/album para mejor precisión.
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=album&limit=1`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            throw new Error("No se encontró la portada.");
        }

        const result = data.results[0];
        
        // 4. Obtener imagen en alta resolución
        // Por defecto iTunes da 100x100. Cambiamos la URL para pedir 1000x1000.
        const hiResUrl = result.artworkUrl100.replace('100x100bb', '1000x1000bb');

        // 5. Formatear información
        const caption = `
🖼️ *PORTADA ENCONTRADA*

💿 *Álbum:* ${result.collectionName}
👤 *Artista:* ${result.artistName}
📅 *Lanzamiento:* ${new Date(result.releaseDate).getFullYear()}
🎸 *Género:* ${result.primaryGenreName}
`.trim();

        // 6. Enviar Imagen
        await sock.sendMessage(remoteJid, {
            image: { url: hiResUrl },
            caption: caption
        }, { quoted: m });

        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('[COVER ERROR]:', error);
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(remoteJid, { 
            text: "❌ No se pudo encontrar la portada. Intenta especificando: _artista, álbum_." 
        }, { quoted: m });
    }
}
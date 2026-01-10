import fetch from 'node-fetch';

export async function coverCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!args || args.length === 0) {
        return sock.sendMessage(remoteJid, { 
            text: "❌ *Uso correcto:*\n▸ #cover _artista álbum_" 
        }, { quoted: m });
    }

    const query = args.join(' ').toLowerCase().trim();
    // Dividimos la búsqueda en palabras clave (tokens)
    const queryTokens = query.split(/\s+/);

    try {
        await sock.sendMessage(remoteJid, { react: { text: "🔍", key: m.key } });

        // 1. OBTENCIÓN MASIVA
        // Pedimos 50 resultados para asegurar que el álbum original esté en la lista
        // aunque iTunes quiera mostrar primero los "Greatest Hits" o "Remasters".
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=album&limit=50&country=us`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            throw new Error("No encontrado");
        }

        // 2. SISTEMA DE RANKING (PUNTUACIÓN)
        const scoredResults = data.results.map(item => {
            let score = 0;
            const artist = (item.artistName || "").toLowerCase();
            const album = (item.collectionName || "").toLowerCase();
            const combinedText = `${artist} ${album}`;

            // A. PUNTOS POR COINCIDENCIA DE PALABRAS
            // Por cada palabra tuya que aparezca en el Artista o el Álbum, sumamos puntos.
            queryTokens.forEach(token => {
                if (combinedText.includes(token)) {
                    score += 10;
                }
            });

            // B. PUNTOS EXTRA POR COINCIDENCIA EXACTA EN EL TÍTULO
            // Si el nombre del álbum es casi idéntico a una parte de tu búsqueda, damos prioridad.
            if (query.includes(album)) score += 5;

            return { item, score, albumLength: album.length };
        });

        // 3. ORDENAMIENTO FINAL (EL FILTRO DE CALIDAD)
        scoredResults.sort((a, b) => {
            // Criterio 1: Mayor Puntuación (Más palabras coincidentes)
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            // Criterio 2: Desempate por Longitud (El título más corto gana)
            // Esto hace que "Animals" (7 letras) le gane a "Animals Reimagined" (18 letras)
            // y que "Epistolares" le gane a "Epistolares+"
            return a.albumLength - b.albumLength;
        });

        // El ganador es el primero de la lista ordenada
        const bestMatch = scoredResults[0].item;

        // 4. EXTRACCIÓN ALTA CALIDAD
        const imgUrl = bestMatch.artworkUrl100 || bestMatch.artworkUrl60;
        const hiResUrl = imgUrl.replace(/100x100bb|60x60bb/, '1500x1500bb');

        const caption = `
💿 *Álbum:* ${bestMatch.collectionName}
👤 *Artista:* ${bestMatch.artistName}
📅 *Año:* ${bestMatch.releaseDate ? new Date(bestMatch.releaseDate).getFullYear() : 'N/A'}
`.trim();

        await sock.sendMessage(remoteJid, {
            image: { url: hiResUrl },
            caption: caption
        }, { quoted: m });

        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('[COVER ERROR]:', error);
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(remoteJid, { 
            text: "❌ No se encontró ningún álbum con esos términos." 
        }, { quoted: m });
    }
}
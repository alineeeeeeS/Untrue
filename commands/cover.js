import fetch from 'node-fetch';

export async function coverCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!args || args.length === 0) {
        return sock.sendMessage(remoteJid, { 
            text: "❌ *Uso correcto:*\n▸ #cover _artista álbum_" 
        }, { quoted: m });
    }

    const query = args.join(' ').toLowerCase().trim();
    // Separamos la búsqueda en palabras clave (tokens)
    const queryTerms = query.split(/\s+/);

    try {
        await sock.sendMessage(remoteJid, { react: { text: "🔍", key: m.key } });

        // 1. SOLICITUD AMPLIA
        // Pedimos 50 resultados. No confiamos en el #1 de iTunes.
        // Usamos 'music' general para asegurar que traiga todo y luego filtramos nosotros.
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=album&limit=50&country=us`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
             // Fallback: Si no hay álbumes, intentamos con canciones (para sencillos)
             const songUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=50&country=us`;
             const songRes = await fetch(songUrl);
             const songData = await songRes.json();
             data.results = songData.results || [];
        }

        if (data.results.length === 0) {
            throw new Error("No encontrado");
        }

        // 2. ALGORITMO DE FILTRADO Y PUNTUACIÓN
        // Vamos a encontrar el "Candidato Perfecto"
        const candidates = data.results.filter(item => {
            const artist = (item.artistName || "").toLowerCase();
            const album = (item.collectionName || item.trackName || "").toLowerCase();
            const fullText = `${artist} ${album}`;

            // CONDICIÓN 1: Todas las palabras buscadas deben estar presentes
            // (Ej: Si buscas "Pink Floyd Animals", el resultado debe tener "Pink", "Floyd" y "Animals")
            return queryTerms.every(term => fullText.includes(term));
        });

        let bestMatch;

        if (candidates.length > 0) {
            // CONDICIÓN 2: Prioridad por longitud exacta (Exactitud)
            // Ordenamos los candidatos: el que tenga el título más corto suele ser el álbum original
            // Esto soluciona "Epistolares" vs "Epistolares+" (El más corto gana)
            // Esto soluciona "Animals" vs "Animals (2018 Remix)" (El más corto gana)
            candidates.sort((a, b) => {
                const lenA = (a.collectionName || a.trackName).length;
                const lenB = (b.collectionName || b.trackName).length;
                return lenA - lenB;
            });
            bestMatch = candidates[0];
        } else {
            // Si ninguno cumple con TODAS las palabras, usamos el primero que nos dio iTunes (Fallback)
            bestMatch = data.results[0];
        }

        // 3. EXTRACCIÓN DE ALTA CALIDAD
        const imgUrl = bestMatch.artworkUrl100 || bestMatch.artworkUrl60;
        // Reemplazo seguro usando Regex para capturar cualquier dimensión
        const hiResUrl = imgUrl.replace(/\/\d+x\d+bb/, '/1500x1500bb');

        const caption = `
💿 *Título:* ${bestMatch.collectionName || bestMatch.trackName}
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
            text: "❌ No se encontró nada con esos términos exactos." 
        }, { quoted: m });
    }
}
import fetch from 'node-fetch';

export async function coverCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!args || args.length === 0) {
        return sock.sendMessage(remoteJid, { 
            text: "❌ *Uso correcto:*\n▸ #cover _artista álbum_" 
        }, { quoted: m });
    }

    const query = args.join(' ').toLowerCase().trim();
    const queryTerms = query.split(/\s+/);

    try {
        await sock.sendMessage(remoteJid, { react: { text: "🔍", key: m.key } });

        // 1. OBTENCIÓN DE CANDIDATOS
        // Pedimos hasta 100 resultados. Para bandas legendarias como Pink Floyd, 
        // los álbumes originales a veces están enterrados bajo 50 remasters y tributos.
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=album&limit=100&country=us`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            throw new Error("No encontrado");
        }

        // 2. PRIMER FILTRO: COINCIDENCIA DE PALABRAS
        // Solo aceptamos resultados que contengan TODAS las palabras buscadas
        // (ya sea en el título del disco o en el nombre del artista)
        let candidates = data.results.filter(item => {
            const artist = (item.artistName || "").toLowerCase();
            const album = (item.collectionName || item.trackName || "").toLowerCase();
            const fullText = `${artist} ${album}`;
            return queryTerms.every(term => fullText.includes(term));
        });

        // Fallback: Si el filtro estricto elimina todo (ej: errores tipográficos), usamos los resultados crudos
        if (candidates.length === 0) candidates = data.results;

        // 3. ORDENAMIENTO INTELIGENTE (LA SOLUCIÓN FINAL)
        candidates.sort((a, b) => {
            const artistA = (a.artistName || "").toLowerCase();
            const artistB = (b.artistName || "").toLowerCase();

            // CRITERIO A: Prioridad de Artista
            // Verificamos si el artista del resultado está escrito literalmente en la búsqueda.
            // Si tú escribiste "Pink Floyd", un disco de "Pink Floyd" recibe puntaje 1, uno de "Tribute Band" recibe 0.
            const artistMatchA = query.includes(artistA) ? 1 : 0;
            const artistMatchB = query.includes(artistB) ? 1 : 0;

            if (artistMatchA > artistMatchB) return -1; // Gana A
            if (artistMatchA < artistMatchB) return 1;  // Gana B

            // CRITERIO B: Título más corto (Navaja de Ockham)
            // Si los artistas son igual de relevantes, preferimos "Animals" (7 letras) sobre "Animals Reimagined..." (30 letras)
            const lenA = (a.collectionName || a.trackName).length;
            const lenB = (b.collectionName || b.trackName).length;
            
            return lenA - lenB;
        });

        const bestMatch = candidates[0];

        // 4. EXTRACCIÓN Y ENVÍO
        const imgUrl = bestMatch.artworkUrl100 || bestMatch.artworkUrl60;
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
            text: "❌ No se encontró nada con esos términos." 
        }, { quoted: m });
    }
}
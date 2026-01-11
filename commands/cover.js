import fetch from 'node-fetch';

export async function coverCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!args || args.length === 0) {
        return sock.sendMessage(remoteJid, { 
            text: "❌ *Uso correcto:*\n▸ #cover *artista* _álbum_\n▸ #cover _álbum_ *artista*\n▸ #cover *artista* _sencillo_\n▸ #cover _sencillo_ *artista*" 
        }, { quoted: m });
    }

    const query = args.join(' ').toLowerCase().trim();
    // Separamos la búsqueda en palabras individuales
    const searchTerms = query.split(/\s+/);

    try {
        await sock.sendMessage(remoteJid, { react: { text: "🔍", key: m.key } });

        // 1. BUSQUEDA TIPO WEB
        // No restringimos a 'entity=album' en la URL para que el motor de iTunes sea más flexible,
        // pero usamos 'media=music' para no traer películas.
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=20&country=us`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (!data.results || data.results.length === 0) throw new Error("No encontrado");

        // 2. FILTRADO DE INTERSECCIÓN (ROBUSTEZ TOTAL)
        // Buscamos el resultado donde el nombre del artista Y el álbum 
        // contengan la mayor cantidad de palabras de la búsqueda.
        let bestMatch = null;
        let maxMatchCount = -1;
        let shortestNameLength = Infinity;

        for (const item of data.results) {
            const albumName = (item.collectionName || "").toLowerCase();
            const artistName = (item.artistName || "").toLowerCase();
            const combined = `${albumName} ${artistName}`;

            // Contamos cuántas de las palabras que escribió el usuario están en este resultado
            const matchCount = searchTerms.filter(term => combined.includes(term)).length;

            // Lógica de desempate:
            // 1. El que tenga más palabras coincidentes.
            // 2. Si empatan en palabras, el que tenga el nombre de álbum más corto (evita Deluxes/Tributos).
            if (matchCount > maxMatchCount) {
                maxMatchCount = matchCount;
                shortestNameLength = albumName.length;
                bestMatch = item;
            } else if (matchCount === maxMatchCount) {
                if (albumName.length < shortestNameLength) {
                    shortestNameLength = albumName.length;
                    bestMatch = item;
                }
            }
        }

        if (!bestMatch || maxMatchCount === 0) throw new Error("Sin coincidencias reales");

        // 3. CALIDAD MÁXIMA
        const imgUrl = bestMatch.artworkUrl100.replace('100x100bb', '1500x1500bb');

        const caption = `
💿 *Álbum:* ${bestMatch.collectionName}
👤 *Artista:* ${bestMatch.artistName}
📅 *Año:* ${new Date(bestMatch.releaseDate).getFullYear()}
`.trim();

        await sock.sendMessage(remoteJid, {
            image: { url: imgUrl },
            caption: caption
        }, { quoted: m });

        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('[COVER ERROR]:', error);
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(remoteJid, { text: "❌ No se encontró la portada exacta." }, { quoted: m });
    }
}
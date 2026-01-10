import fetch from 'node-fetch';

export async function coverCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!args || args.length === 0) {
        return sock.sendMessage(remoteJid, { 
            text: "❌ *Uso correcto:*\n▸ #cover _artista álbum_" 
        }, { quoted: m });
    }

    const query = args.join(' ');

    try {
        await sock.sendMessage(remoteJid, { react: { text: "🖼️", key: m.key } });

        // 1. URL Optimizada: Forzamos la entidad ALBUM y el país US.
        // Añadimos 'explicit=yes' para evitar que filtros de contenido oculten resultados.
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&country=us&limit=10&explicit=yes`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            // SEGUNDO INTENTO: Búsqueda general si falla la de álbum
            const fallbackUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=5&country=us`;
            const fbRes = await fetch(fallbackUrl);
            const fbData = await fbRes.json();
            data.results = fbData.results;
        }

        if (!data.results || data.results.length === 0) {
            throw new Error("No encontrado");
        }

        // 2. FILTRADO DE PRECISIÓN (ESTILO BEN DODSON)
        // Buscamos el resultado que mejor encaje con las palabras enviadas.
        let result = data.results[0];
        const queryLower = query.toLowerCase();

        // Buscamos un álbum que contenga el nombre del artista Y el álbum en el título/artista.
        const exactMatch = data.results.find(res => {
            const collection = (res.collectionName || "").toLowerCase();
            const artist = (res.artistName || "").toLowerCase();
            
            // Si el usuario puso Pink Floyd y Animals, buscamos que AMBOS estén presentes.
            const terms = queryLower.split(' ');
            return terms.every(t => collection.includes(t) || artist.includes(t));
        });

        if (exactMatch) result = exactMatch;

        // 3. CALIDAD MÁXIMA (1500x1500bb)
        // iTunes almacena las imágenes originales en esta resolución.
        const imgUrl = result.artworkUrl100 || result.artworkUrl60;
        const hiResUrl = imgUrl.replace(/100x100bb|60x60bb/, '1500x1500bb');

        const caption = `
💿 *Álbum:* ${result.collectionName || 'N/A'}
👤 *Artista:* ${result.artistName}
📅 *Año:* ${result.releaseDate ? new Date(result.releaseDate).getFullYear() : 'N/A'}
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
            text: "❌ No se encontró la portada exacta. Intenta ser más específico con el nombre del álbum." 
        }, { quoted: m });
    }
}
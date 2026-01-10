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

        // Función interna para consultar la API
        const searchiTunes = async (term) => {
            const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&country=us&limit=5`;
            const response = await fetch(url);
            const data = await response.json();
            return data.results;
        };

        // INTENTO 1: Búsqueda tal cual envió el usuario
        let results = await searchiTunes(query);

        // INTENTO 2: Si no hay resultados o es Pink Floyd (que suele fallar), 
        // invertimos el orden o probamos solo con el álbum
        if (!results || results.length === 0 || query.toLowerCase().includes('pink floyd')) {
            const words = args;
            if (words.length > 1) {
                // Probamos invirtiendo el orden (ej: "animals pink floyd" -> "pink floyd animals")
                const reversedQuery = [...words].reverse().join(' ');
                const secondResults = await searchiTunes(reversedQuery);
                if (secondResults && secondResults.length > 0) {
                    results = secondResults;
                }
            }
        }

        if (!results || results.length === 0) {
            throw new Error("No encontrado");
        }

        // SELECCIÓN CRÍTICA: 
        // En lugar de agarrar el [0] a ciegas, buscamos el que tenga el nombre del artista 
        // si el usuario lo mencionó en su búsqueda.
        let result = results[0];
        const lowerQuery = query.toLowerCase();
        
        const betterMatch = results.find(r => 
            lowerQuery.includes(r.artistName.toLowerCase()) || 
            lowerQuery.includes(r.collectionName.toLowerCase())
        );
        
        if (betterMatch) result = betterMatch;

        // Calidad máxima: 1500x1500bb
        const hiResUrl = result.artworkUrl100.replace('100x100bb', '1500x1500bb');

        const caption = `
💿 *Álbum:* ${result.collectionName}
👤 *Artista:* ${result.artistName}
📅 *Año:* ${new Date(result.releaseDate).getFullYear()}
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
            text: "❌ No se encontró la portada exacta." 
        }, { quoted: m });
    }
}
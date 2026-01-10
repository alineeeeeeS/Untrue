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

        /**
         * SECRETO DE PRECISIÓN:
         * La web de Ben Dodson usa 'entity=album' pero lo combina con 'attribute=albumTerm'.
         * Al añadir 'attribute=albumTerm', obligamos a la API a que busque las palabras 
         * del usuario DENTRO de los títulos de los discos, ignorando la "fama" de otros álbumes.
         */
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&attribute=albumTerm&country=us&limit=1`;
        
        const response = await fetch(url);
        const data = await response.json();

        // Si el filtro estricto de álbum falla (como puede pasar con artistas nuevos como Akriila),
        // hacemos un fallback a búsqueda general de álbum sin el atributo estricto.
        let result = data.results[0];

        if (!result) {
            const fallbackUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&country=us&limit=1`;
            const fbRes = await fetch(fallbackUrl);
            const fbData = await fbRes.json();
            result = fbData.results[0];
        }

        if (!result) throw new Error("No encontrado");
        
        // Calidad máxima original de iTunes
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
            text: "❌ No se encontró la portada. Intenta escribir el nombre del álbum." 
        }, { quoted: m });
    }
}
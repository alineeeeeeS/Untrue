import fetch from 'node-fetch';

export async function coverCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!args || args.length === 0) {
        return sock.sendMessage(remoteJid, { 
            text: "❌ *Uso correcto:*\n▸ #cover _artista_ _álbum_\n▸ #cover _álbum_" 
        }, { quoted: m });
    }

    const fullQuery = args.join(' ');
    // Limpiamos la búsqueda de caracteres especiales que rompen la API
    const cleanQuery = fullQuery.replace(/[#!@]/g, '');

    try {
        await sock.sendMessage(remoteJid, { react: { text: "🖼️", key: m.key } });

        // Intentamos la búsqueda con parámetros más precisos (similar a artwork finder)
        // Usamos country=US para mayor catálogo y limit=5 para filtrar manualmente el mejor resultado
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&entity=album&limit=5&country=US`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            // Si no encuentra nada como álbum, intentamos una búsqueda general (fallback)
            const fallbackUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&limit=1&country=US`;
            const fbRes = await fetch(fallbackUrl);
            const fbData = await fbRes.json();
            
            if (!fbData.results || fbData.results.length === 0) {
                throw new Error("No encontrado");
            }
            data.results = fbData.results;
        }

        // Filtramos el mejor resultado:
        // Priorizamos el que tenga el nombre del artista si se incluyó en la búsqueda
        const result = data.results[0];
        
        // Mejoramos la calidad: 1500x1500bb es el estándar máximo de iTunes para archivos originales
        const hiResUrl = result.artworkUrl100.replace('100x100bb', '1500x1500bb');

        const caption = `
🖼️ *PORTADA ENCONTRADA*

💿 *Proyecto:* ${result.collectionName || result.trackName}
👤 *Artista:* ${result.artistName}
📅 *Lanzamiento:* ${new Date(result.releaseDate).getFullYear()}
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
            text: "❌ No se pudo encontrar la portada exacta. Intenta variar el orden (Ej: _Pink Floyd Animals_)." 
        }, { quoted: m });
    }
}
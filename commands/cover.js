// import fetch from 'node-fetch';

export async function coverCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!args || args.length === 0) {
        return sock.sendMessage(remoteJid, { 
            text: "❌ *Uso correcto:*\n▸ #cover _artista álbum_" 
        }, { quoted: m });
    }

    const query = args.join(' ').toLowerCase();

    try {
        await sock.sendMessage(remoteJid, { react: { text: "🖼️", key: m.key } });

        // Pedimos 25 resultados para tener un margen amplio de búsqueda, igual que haría un motor de búsqueda web
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&country=us&limit=25`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            throw new Error("No encontrado");
        }

        // --- LÓGICA DE SELECCIÓN INTELIGENTE ---
        // Buscamos entre los 25 resultados aquel donde el título del álbum esté contenido en la búsqueda del usuario
        // Esto evita que si buscas 'Animals' te mande 'Meddle' solo por ser del mismo artista.
        let result = data.results.find(res => {
            const albumName = res.collectionName.toLowerCase();
            const artistName = res.artistName.toLowerCase();
            // Verificamos si las palabras clave están en el resultado
            return query.includes(albumName) || albumName.includes(query.replace(artistName, '').trim());
        });

        // Si el filtro inteligente no encuentra nada exacto, usamos el primer resultado por defecto
        if (!result) result = data.results[0];
        
        // Calidad máxima 1500x1500bb
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
            text: "❌ No se encontró la portada. Intenta escribir el nombre del álbum y el artista claramente." 
        }, { quoted: m });
    }
}
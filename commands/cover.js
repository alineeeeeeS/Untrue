import fetch from 'node-fetch';

export async function coverCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;

    if (!args || args.length === 0) {
        return sock.sendMessage(remoteJid, { 
            text: "❌ *Uso correcto:*\n▸ #cover _artista álbum_ o _álbum artista_" 
        }, { quoted: m });
    }

    const query = args.join(' ');

    try {
        await sock.sendMessage(remoteJid, { react: { text: "🖼️", key: m.key } });

        // Configuración exacta según la imagen del Artwork Finder:
        // entity=album (según el primer selector de la imagen)
        // country=us (según el selector de país de la imagen)
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&country=us&limit=1`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            throw new Error("No encontrado");
        }

        const result = data.results[0];
        
        // Calidad 1500x1500bb para que sea "Uncompressed High Resolution" como en la web
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
            text: "❌ No se encontró la portada. Intenta escribir el nombre tal cual aparece en iTunes." 
        }, { quoted: m });
    }
}
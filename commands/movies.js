import axios from 'axios';

// Función auxiliar para calcular la similitud (Puntuación de coincidencia)
function calculateSimilarity(str1, str2) {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    let matches = 0;
    
    words1.forEach(word => {
        if (words2.includes(word)) matches++;
    });
    
    return matches / Math.max(words1.length, words2.length);
}

export async function movieCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    const query = args.join(" ");

    if (!query) {
        return await sock.sendMessage(jid, { text: "🎬 *Escribe el nombre de la película.*" }, { quoted: m });
    }

    try {
        await sock.sendMessage(jid, { react: { text: "🔍", key: m.key } });

        const response = await axios.get(`https://api.dorratz.com/v2/pelis-search`, {
            params: { q: query },
            timeout: 15000
        });

        const results = response.data;

        if (!results || results.length === 0) {
            await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
            return await sock.sendMessage(jid, { text: "🚫 No encontré resultados." }, { quoted: m });
        }

        // --- LÓGICA DE EXACTITUD ---
        // Ordenamos los resultados por puntuación de similitud
        const bestMatches = results.map(item => ({
            ...item,
            score: calculateSimilarity(query, item.title)
        })).sort((a, b) => b.score - a.score);

        // Tomamos el que tenga mayor puntuación
        const movie = bestMatches[0];

        // Opcional: Si el score es muy bajo (0), significa que no se parece nada
        if (movie.score === 0 && results.length > 0) {
            // Si no hay coincidencia exacta de palabras, nos quedamos con el primer resultado de la API
            // pero avisamos que podría no ser exacto.
        }

        const movieMsg = `*▸ PELÍCULA ENCONTRADA ◂*\n\n` +
                         `📌 *Título:* ${movie.title}\n` +
                         `🔗 *Link:* ${movie.link}\n\n`;

        await sock.sendMessage(jid, {
            image: { url: movie.image },
            caption: movieMsg
        }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { text: "⚠️ Error al conectar con la API." }, { quoted: m });
    }
}
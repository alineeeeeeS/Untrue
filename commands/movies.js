import axios from 'axios';

// Algoritmo de similitud mejorado (Levenshtein simplificado)
function getSimilarity(s1, s2) {
    let longer = s1.toLowerCase();
    let shorter = s2.toLowerCase();
    if (s1.length < s2.length) {
        longer = s2;
        shorter = s1;
    }
    let longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function editDistance(s1, s2) {
    let costs = new Array();
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i == 0) costs[j] = j;
            else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) != s2.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

export async function movieCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    const query = args.join(" ");

    if (!query) {
        return await sock.sendMessage(jid, { text: "🎬 *Escribe el nombre de la película para buscar.*" }, { quoted: m });
    }

    try {
        await sock.sendMessage(jid, { react: { text: "🔍", key: m.key } });

        const response = await axios.get(`https://api.dorratz.com/v2/pelis-search`, {
            params: { q: query },
            timeout: 10000
        });

        // Verificamos si la respuesta es un array o si los datos están en .results / .data
        const rawResults = Array.isArray(response.data) ? response.data : (response.data.results || response.data.data || []);

        if (rawResults.length === 0) {
            await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
            return await sock.sendMessage(jid, { text: "🚫 No encontré resultados para tu búsqueda." }, { quoted: m });
        }

        // --- FILTRO DE EXACTITUD ---
        // Calculamos la similitud de cada título con lo que escribió el usuario
        const scoredResults = rawResults.map(item => ({
            ...item,
            similarity: getSimilarity(query, item.title)
        }));

        // Ordenamos: Mayor similitud primero
        scoredResults.sort((a, b) => b.similarity - a.similarity);

        const movie = scoredResults[0];

        const movieMsg = `*▸ PELÍCULA ENCONTRADA ◂*\n\n` +
                         `📌 *Título:* ${movie.title}\n` +
                         `🔗 *Link:* ${movie.link}\n\n`;

        // Enviamos la carátula con la info
        await sock.sendMessage(jid, {
            image: { url: movie.image },
            caption: movieMsg
        }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("❌ Error Movie API:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        
        await sock.sendMessage(jid, { 
            text: "⚠️ *Error:* No se pudo obtener información de la API. Intenta más tarde." 
        }, { quoted: m });
    }
}
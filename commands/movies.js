import axios from 'axios';

// Función de similitud simple y rápida
function getSimpleScore(query, target) {
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    if (t.includes(q)) return 100; // Si el título contiene la búsqueda completa, puntuación máxima
    return 0;
}

export async function movieCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    const query = args.join(" ");

    if (!query) {
        return await sock.sendMessage(jid, { text: "🎬 *Escribe el nombre de la película.*" }, { quoted: m });
    }

    try {
        await sock.sendMessage(jid, { react: { text: "🔍", key: m.key } });

        // IMPORTANTE: encodeURIComponent asegura que "la la land" viaje como "la%20la%20land"
        const apiUrl = `https://api.dorratz.com/v2/pelis-search?q=${encodeURIComponent(query)}`;
        
        console.log(`📡 [MOVIE] Consultando: ${apiUrl}`);
        
        const response = await axios.get(apiUrl, { timeout: 10000 });

        // Verificamos si la API devolvió un array directamente
        let results = [];
        if (Array.isArray(response.data)) {
            results = response.data;
        } else if (response.data && response.data.results) {
            results = response.data.results;
        }

        if (results.length === 0) {
            await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
            return await sock.sendMessage(jid, { text: "🚫 No encontré resultados para esa película en la API." }, { quoted: m });
        }

        // --- FILTRO DE EXACTITUD ---
        // Ordenamos los resultados: los que CONTENGAN las palabras buscadas van primero
        const sorted = results.sort((a, b) => {
            const scoreA = getSimpleScore(query, a.title);
            const scoreB = getSimpleScore(query, b.title);
            return scoreB - scoreA;
        });

        const movie = sorted[0];

        const movieMsg = `*▸ PELÍCULA ENCONTRADA ◂*\n\n` +
                         `📌 *Título:* ${movie.title}\n` +
                         `🔗 *Link:* ${movie.link}\n\n`;
        // Enviamos la carátula
        await sock.sendMessage(jid, {
            image: { url: movie.image },
            caption: movieMsg
        }, { quoted: m });

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("❌ Error Detallado:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { text: "⚠️ Hubo un fallo al conectar con la base de datos." }, { quoted: m });
    }
}
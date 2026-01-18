import axios from 'axios';

// Función para limpiar y comparar títulos (Filtro de exactitud)
function getExactMatch(query, list) {
    const q = query.toLowerCase().trim();
    return list.sort((a, b) => {
        const titleA = a.title.toLowerCase();
        const titleB = b.title.toLowerCase();
        
        // Si el título empieza exactamente con la búsqueda, tiene prioridad
        if (titleA.startsWith(q) && !titleB.startsWith(q)) return -1;
        if (!titleA.startsWith(q) && titleB.startsWith(q)) return 1;
        return 0;
    });
}

export async function movieCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    const query = args.join(" ");

    if (!query) {
        return await sock.sendMessage(jid, { text: "🎬 *Escribe el nombre de la película.*" }, { quoted: m });
    }

    try {
        await sock.sendMessage(jid, { react: { text: "🔍", key: m.key } });

        // URL Codificada
        const apiUrl = `https://api.dorratz.com/v2/pelis-search?q=${encodeURIComponent(query)}`;
        
        console.log(`📡 [MOVIE] Consultando: ${apiUrl}`);
        
        const response = await axios.get(apiUrl, {
            timeout: 15000,
            headers: {
                // Estos headers hacen que la API crea que somos un navegador Chrome real
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'es-ES,es;q=0.9',
                'Referer': 'https://api.dorratz.com/'
            }
        });

        // Depuración en consola para que veas qué llega realmente
        console.log("📦 [DEBUG] Respuesta API:", JSON.stringify(response.data).substring(0, 100));

        let results = [];
        if (Array.isArray(response.data)) {
            results = response.data;
        } else if (response.data && response.data.results) {
            results = response.data.results;
        } else if (response.data && typeof response.data === 'object') {
            // Caso especial: si la API devuelve un solo objeto en lugar de un array
            results = [response.data];
        }

        if (results.length === 0 || !results[0].title) {
            await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
            return await sock.sendMessage(jid, { text: "🚫 No encontré resultados. Intenta con un nombre más corto." }, { quoted: m });
        }

        // Aplicamos el orden por exactitud
        const sortedResults = getExactMatch(query, results);
        const movie = sortedResults[0];

        const movieMsg = `*▸ PELÍCULA ENCONTRADA ◂*\n\n` +
                         `📌 *Título:* ${movie.title}\n` +
                         `🔗 *Link:* ${movie.link}\n\n`;

        // Si la imagen existe, la enviamos; si no, solo texto
        if (movie.image) {
            await sock.sendMessage(jid, {
                image: { url: movie.image },
                caption: movieMsg
            }, { quoted: m });
        } else {
            await sock.sendMessage(jid, { text: movieMsg }, { quoted: m });
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("❌ Error API:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        
        let errorMsg = "⚠️ No se pudo conectar con el buscador de películas.";
        if (e.response && e.response.status === 403) errorMsg = "⚠️ Acceso denegado por la API (Bloqueo de IP).";
        
        await sock.sendMessage(jid, { text: errorMsg }, { quoted: m });
    }
}
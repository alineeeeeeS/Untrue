import axios from 'axios';

export async function movieCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    const query = args.join(" ");

    if (!query) {
        return await sock.sendMessage(jid, { text: "🎬 *Escribe el nombre de la película.*" }, { quoted: m });
    }

    try {
        // Reacción de búsqueda
        await sock.sendMessage(jid, { react: { text: "🔍", key: m.key } });

        const apiUrl = `https://api.dorratz.com/v2/pelis-search?q=${encodeURIComponent(query)}`;
        
        const response = await axios.get(apiUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        // Acceso al array 'peliculas' según tu captura
        const results = response.data.peliculas || [];

        if (results.length === 0) {
            await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
            return await sock.sendMessage(jid, { text: "🚫 No encontré resultados para esa película." }, { quoted: m });
        }

        // Filtro de exactitud: Prioriza el que contenga el nombre exacto buscado
        const movie = results.sort((a, b) => {
            const checkA = a.titulo.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
            const checkB = b.titulo.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
            return checkB - checkA;
        })[0];

        // Mensaje directo: Título, Link y Banner
        const movieMsg = `*▸ PELÍCULA ENCONTRADA ◂*\n\n` +
                         `📌 *Título:* ${movie.titulo}\n` +
                         `🔗 *Link:* ${movie.link}`;

        // Envío con imagen
        if (movie.imagen) {
            await sock.sendMessage(jid, {
                image: { url: movie.imagen },
                caption: movieMsg
            }, { quoted: m });
        } else {
            await sock.sendMessage(jid, { text: movieMsg }, { quoted: m });
        }

        // Reacción de éxito
        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("❌ Error API Películas:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { text: "⚠️ Error al conectar con el servidor." }, { quoted: m });
    }
}
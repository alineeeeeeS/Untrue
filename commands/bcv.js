import axios from 'axios';

// Tu configuración de API
const API_KEY = '286aebb9a67d895fc12f91fc';
const BASE_URL = 'https://v6.exchangerate-api.com/v6';

export async function bcvCommand(sock, m) {
    const jid = m.key.remoteJid;

    try {
        // 1. Reacción de procesamiento
        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        // 2. Realizar las consultas en paralelo para mayor velocidad
        const [resUsd, resEur] = await Promise.all([
            axios.get(`${BASE_URL}/${API_KEY}/latest/USD`),
            axios.get(`${BASE_URL}/${API_KEY}/latest/EUR`)
        ]);

        // 3. Validar respuestas y extraer tasas
        if (resUsd.data.result === "success" && resEur.data.result === "success") {
            const usdRate = resUsd.data.conversion_rates.VES;
            const eurRate = resEur.data.conversion_rates.VES;
            
            // Extraer fecha de la API (formato UTC)
            const lastUpdate = new Date(resUsd.data.time_last_update_utc);
            const fechaFormateada = lastUpdate.toLocaleDateString('es-VE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            // 4. Construir el mensaje estético
            const mensaje = `*Tasas de cambio BCV*\n\n` +
                          `💵 *Dólar (USD):* ${usdRate.toFixed(2)} VES\n` +
                          `💶 *Euro (EUR):* ${eurRate.toFixed(2)} VES\n` +
						  `📅 *Fecha:* ${fechaFormateada}\n` +
                          `\n_www.bcv.org.ve/_`;

            // 5. Enviar mensaje y reacción de éxito
            await sock.sendMessage(jid, { text: mensaje }, { quoted: m });
            await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

        } else {
            throw new Error("API_ERROR");
        }

    } catch (error) {
        console.error("Error en BCV API:", error.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { 
            text: "⚠️ *Error:* No se pudo conectar con el servicio de tasas en este momento." 
        }, { quoted: m });
    }
}
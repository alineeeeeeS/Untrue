import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Configuración de API
const API_KEY = '286aebb9a67d895fc12f91fc';
const BASE_URL = 'https://v6.exchangerate-api.com/v6';

export function getBCVFromHistorial(fecha = null) {
    try {
        const filePath = path.resolve('./services/bcvTasas.json');
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        if (fecha && data[fecha]) {
            return data[fecha];
        }
        
        // Si no se pide fecha, devuelve el último registro disponible
        const fechas = Object.keys(data);
        const ultimaFecha = fechas[fechas.length - 1];
        return { 
            fecha: ultimaFecha, 
            ...data[ultimaFecha] 
        };
    } catch (error) {
        console.error("Error leyendo historial local:", error.message);
        return { usdPrice: "0.0000 Bs", eurPrice: "0.0000 Bs" };
    }
}

export async function bcvCommand(sock, m) {
    const jid = m.key.remoteJid;

    try {
        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        // Consulta a la API para USD y EUR
        const [resUsd, resEur] = await Promise.all([
            axios.get(`${BASE_URL}/${API_KEY}/latest/USD`),
            axios.get(`${BASE_URL}/${API_KEY}/latest/EUR`)
        ]);

        if (resUsd.data.result === "success" && resEur.data.result === "success") {
            const usdRate = resUsd.data.conversion_rates.VES;
            const eurRate = resEur.data.conversion_rates.VES;

            const lastUpdate = new Date(resUsd.data.time_last_update_utc);
            const fechaFormateada = lastUpdate.toLocaleDateString('es-VE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            // Mensaje con 4 decimales según solicitado
            const mensaje = `*Tasas de cambio BCV*\n\n` +
                          `💵 *Dólar (USD):* ${usdRate.toFixed(2)} VES\n` +
                          `💶 *Euro (EUR):* ${eurRate.toFixed(2)} VES\n` +
						  `📅 *Fecha:* ${fechaFormateada}\n` +
                          `\n_www.bcv.org.ve/_`;

            await sock.sendMessage(jid, { text: mensaje }, { quoted: m });
            await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

        } else {
            throw new Error("API_ERROR");
        }

    } catch (error) {
        console.error("Error en BCV API:", error.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        
        // Fallback: Si la API falla, intentamos mostrar el último dato del JSON local
        const historial = getBCVFromHistorial();
        const msgFallback = `⚠️ *Error de API. Mostrando último registro local:*\n\n` +
                            `💵 *USD:* ${historial.usdPrice}\n` +
                            `💶 *EUR:* ${historial.eurPrice}`;
        
        await sock.sendMessage(jid, { text: msgFallback }, { quoted: m });
    }
}
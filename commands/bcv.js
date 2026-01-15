import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Configuración de API
const API_KEY = '286aebb9a67d895fc12f91fc';
const BASE_URL = 'https://v6.exchangerate-api.com/v6';

/**
 * Función para obtener el precio del historial local (usada por ping)
 */
export function getBCVPrice() {
    try {
        const filePath = path.resolve('./services/bcvTasas.json');
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        const fechas = Object.keys(data);
        const ultimaFecha = fechas[fechas.length - 1];
        const registro = data[ultimaFecha];

        // Retornamos el precio formateado (limpiando " Bs" o comas si las hay)
        return registro.usdPrice.replace(' Bs', '').replace(',', '.').trim();
    } catch (error) {
        console.error("Error en getBCVPrice:", error.message);
        return "0.0000";
    }
}

export const getBCVFromHistorial = getBCVPrice;

export async function bcvCommand(sock, m) {
    const jid = m.key.remoteJid;

    try {
        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

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

            // Mensaje ajustado con 4 decimales y "Bs"
            const mensaje = `*Tasas de cambio BCV*\n\n` +
                          `💵 *Dólar (USD):* ${usdRate.toFixed(4)} Bs\n` +
                          `💶 *Euro (EUR):* ${eurRate.toFixed(4)} Bs\n` +
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
        
        const precioLocal = getBCVPrice();
        await sock.sendMessage(jid, { 
            text: `⚠️ *Servidor de tasas no disponible.*\nÚltimo precio registrado: *${precioLocal} Bs*` 
        }, { quoted: m });
    }
}
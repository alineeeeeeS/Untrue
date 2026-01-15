import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Configuración de API
const API_KEY = '286aebb9a67d895fc12f91fc';
const BASE_URL = 'https://v6.exchangerate-api.com/v6';

export function getBCVPrice() {
    try {
        const filePath = path.resolve('./services/bcvTasas.json');
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        // Obtenemos la última entrada del historial
        const fechas = Object.keys(data);
        const ultimaFecha = fechas[fechas.length - 1];
        const registro = data[ultimaFecha];

        // Retornamos el precio formateado (limpiando el " Bs" si lo tiene)
        return registro.usdPrice.replace(' Bs', '').trim();
    } catch (error) {
        console.error("Error en getBCVPrice:", error.message);
        return "0.0000";
    }
}

/**
 * Función adicional por si algún otro comando usa el nombre antiguo
 */
export const getBCVFromHistorial = getBCVPrice;

export async function bcvCommand(sock, m) {
    const jid = m.key.remoteJid;

    try {
        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        // Consultas en paralelo a ExchangeRate-API
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

            // Mensaje con precisión de 4 decimales
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
        
        // Fallback usando el historial local si la API falla
        const precioLocal = getBCVPrice();
        await sock.sendMessage(jid, { 
            text: `⚠️ *Servidor de tasas no disponible.*\nÚltimo precio registrado: *${precioLocal} VES*` 
        }, { quoted: m });
    }
}
import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
import https from 'https';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HISTORIAL_FILE = join(__dirname, '../services/bcvTasas.json');

// --- CÓDIGO PARA EL COMANDO BCV ---

export async function bcvCommand(sock, m, args) {
    try {
        const jid = m.key.remoteJid;
        const fechaSolicitada = args[0];

        await sock.sendMessage(jid, { text: '📊 *Consultando tasas del BCV...*' }, { quoted: m });

        let bcvData;
        if (fechaSolicitada) {
            bcvData = await getBCVFromHistorial(fechaSolicitada);
        } else {
            bcvData = await getBCVPrice();
            if (bcvData.usdPrice && bcvData.eurPrice && bcvData.fechacorta && !bcvData.error) {
                await guardarEnHistorial(bcvData.fechacorta, bcvData.usdPrice, bcvData.eurPrice);
            }
        }

        const message = `▸ *Tipo de Cambio BCV* ◂\n\n` +
                        `💰 *Dólar (USD):* ${bcvData.usdPrice}\n` +
                        `💶 *Euro (EUR):* ${bcvData.eurPrice}\n` +
                        `📅 *Fecha:* ${bcvData.date}\n` +
                        `${bcvData.historical ? '🔍 _Dato histórico_' : '✅ _Actualizado recientemente_'}\n` +
                        `\n_www.bcv.org.ve/_`;

        await sock.sendMessage(jid, { text: message }, { quoted: m });

    } catch (error) {
        logger.error('bcv', `Error: ${error.message}`, { jid: m.key.remoteJid });
        await sock.sendMessage(m.key.remoteJid, { text: `❌ *Error:* ${error.message}` }, { quoted: m });
    }
}

export async function getBCVPrice() { 
    const maxRetries = 3;
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    for (let i = 0; i < maxRetries; i++) {
        try {
            const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

            const response = await axios.get('https://www.bcv.org.ve', {
                timeout: 35000,
                httpsAgent: agent,
                headers: {
                    'User-Agent': userAgents[i],
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'es-ES,es;q=0.9',
                    'Referer': 'https://www.google.com/'
                }
            });

            const $ = cheerio.load(response.data);
            
            const usdPrice = formatPrice($('#dolar strong').text().trim()) || "N/A Bs";
            const eurPrice = formatPrice($('#euro strong').text().trim()) || "N/A Bs";
            
            // Extracción de fecha con el selector 
            const rawDate = $('.pull-right.dinpro.center .date-display-single').text().trim();
            const bcvDate = transformarFechaBCV(rawDate);

            if (usdPrice === "N/A Bs") throw new Error("No se pudo extraer el precio");

            return {
                usdPrice,
                eurPrice,
                date: bcvDate,
                fechacorta: bcvDate.split('/').join(''),
                historical: false
            };

        } catch (error) {
            console.log(`⚠️ Intento ${i + 1} fallido: ${error.message}`);
            if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 3000));
        }
    }

    return { usdPrice: "Error", eurPrice: "Error", date: "No disponible", historical: false, error: true };
}

/**
 * LÓGICA DE CONVERSIÓN (Día, Mes y Año completo)
 */
function transformarFechaBCV(fechaBCV) {
    if (!fechaBCV) return new Date().toLocaleDateString('es-VE');

    const meses = {
        'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
        'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
        'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };

    // 1. Limpiamos comas y espacios múltiples
    // "Miércoles, 14 Enero 2026" -> "Miércoles 14 Enero 2026"
    let limpia = fechaBCV.replace(/,/g, '').replace(/\s+/g, ' ').trim();
    
    // 2. Separamos por espacio
    let partes = limpia.split(' ');

    // Buscamos los componentes. El BCV suele enviar: [DíaSemana, NumDía, Mes, Año]
    // Pero a veces falta el DíaSemana. Por eso filtramos por contenido:
    let dia = partes.find(p => /^\d{1,2}$/.test(p)); // Busca el número del día (1 o 2 dígitos)
    let año = partes.find(p => /^\d{4}$/.test(p));   // Busca el número del año (4 dígitos)
    let mesTexto = partes.find(p => meses[p.toLowerCase()]); // Busca el nombre del mes

    if (dia && mesTexto && año) {
        return `${dia.padStart(2, '0')}/${meses[mesTexto.toLowerCase()]}/${año}`;
    }

    // Fallback si la estructura cambia radicalmente
    return fechaBCV;
}

function formatPrice(priceText) {
    if (!priceText) return null;
    let p = priceText.replace(/[^\d,.]/g, '').replace(',', '.');
    return isNaN(parseFloat(p)) ? null : `${parseFloat(p).toFixed(4)} Bs`;
}

async function cargarHistorial() {
    try {
        const data = await fs.readFile(HISTORIAL_FILE, 'utf8');
        return JSON.parse(data);
    } catch { return {}; }
}

async function guardarEnHistorial(fechacorta, usdPrice, eurPrice) {
    try {
        const historial = await cargarHistorial();
        historial[fechacorta] = { usdPrice, eurPrice };
        await fs.writeFile(HISTORIAL_FILE, JSON.stringify(historial, null, 2));
    } catch (e) { console.error('Error historial:', e.message); }
}

export async function getBCVFromHistorial(fechaInput) {
    const fechacorta = fechaInput.replace(/-/g, '').replace(/\//g, '');
    const historial = await cargarHistorial();
    if (historial[fechacorta]) {
        return { ...historial[fechacorta], date: fechaInput, historical: true };
    }
    throw new Error('Fecha no encontrada en historial');
}
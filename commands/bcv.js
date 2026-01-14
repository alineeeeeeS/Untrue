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
    let lastError = null;

    // Agentes de usuario para rotar y parecer un navegador real
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`ℹ️ Consultando BCV desde Railway (Intento ${i + 1})...`);
            
            const agent = new https.Agent({ 
                rejectUnauthorized: false,
                keepAlive: true 
            });

            const response = await axios.get('https://www.bcv.org.ve', {
                timeout: 35000, // Timeout extendido para conexiones internacionales
                httpsAgent: agent,
                headers: {
                    'User-Agent': userAgents[i],
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'es-ES,es;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Referer': 'https://www.google.com/'
                }
            });

            if (response.status !== 200) throw new Error(`Status ${response.status}`);

            const $ = cheerio.load(response.data);
            
            // Selectores simplificados y directos
            const usdPrice = formatPrice($('#dolar strong').text().trim()) || "N/A Bs";
            const eurPrice = formatPrice($('#euro strong').text().trim()) || "N/A Bs";
            
            const dateText = $('.pull-right.dinpro.center .date-display-single').text().trim();
            const bcvDate = dateText ? transformarFechaBCV(dateText) : new Date().toLocaleDateString('es-VE');

            if (usdPrice === "N/A Bs") throw new Error("No se pudo extraer el precio");

            return {
                usdPrice,
                eurPrice,
                date: bcvDate,
                fechacorta: bcvDate.split('/').join(''),
                historical: false
            };

        } catch (error) {
            lastError = error;
            console.log(`⚠️ Intento ${i + 1} fallido: ${error.message}`);
            if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 3000));
        }
    }

    // Si fallan todos los reintentos, devolvemos el último valor del historial para que el comando no muera
    console.error('❌ BCV inaccesible después de reintentos.');
    return {
        usdPrice: "No disponible",
        eurPrice: "No disponible",
        date: "Servidor BCV bloqueado",
        fechacorta: null,
        error: true
    };
}

// Funciones de utilidad (Mantener igual que tu archivo original)
function formatPrice(priceText) {
    priceText = priceText.replace(/[^\d,.]/g, '').replace(',', '.');
    if (priceText && !isNaN(parseFloat(priceText))) {
        const priceFloat = parseFloat(priceText).toFixed(4);
        return `${priceFloat} Bs`;
    }
    return null;
}

function transformarFechaBCV(fechaBCV) {
    const meses = {
        'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
        'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
        'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };
    const partes = fechaBCV.replace(/^[^,]+, /, '').trim().split(' ');
    if (partes.length >= 3) {
        const dia = partes[0].padStart(2, '0');
        const mes = meses[partes[1].toLowerCase()];
        const año = partes[2];
        return `${dia}/${mes}/${año}`;
    }
    return fechaBCV;
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
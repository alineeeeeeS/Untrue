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
        const fechaSolicitada = args[0]; // Fecha en formato dd/mm/aaaa o dd-mm-aaaa

        await sock.sendMessage(jid, {
            text: '📊 *Consultando tasas del BCV...*'
        }, { quoted: m });

        logger.info('bcv', `Consultando precios del BCV para ${m.pushName}${fechaSolicitada ? ` fecha: ${fechaSolicitada}` : ''}`, { jid });

        let bcvData;

        if (fechaSolicitada) {
            bcvData = await getBCVFromHistorial(fechaSolicitada);
        } else {
            // Consultar precio actual
            bcvData = await getBCVPrice();

            // Guardar en historial después de obtener el precio actual
            if (bcvData.usdPrice && bcvData.eurPrice && bcvData.fechacorta) {
                await guardarEnHistorial(bcvData.fechacorta, bcvData.usdPrice, bcvData.eurPrice);
            }
        }

        const message = `▸ *Tipo de Cambio BCV* ◂\n\n` +
                       `💰 *Dólar (USD):* ${bcvData.usdPrice}\n` +
                       `💶 *Euro (EUR):* ${bcvData.eurPrice}\n` +
                       `📅 *Fecha:* ${bcvData.date}\n` +
                       `${bcvData.historical ? '🔍 _Dato histórico_' : '✅ _Actualizado recientemente_'}\n` +
                       `\n_www.bcv.org.ve/_`;

        await sock.sendMessage(jid, {
            text: message
        }, { quoted: m });

        logger.success('bcv', `Precios (USD/EUR) del BCV enviados a ${m.pushName}`, {
            usdPrice: bcvData.usdPrice,
            eurPrice: bcvData.eurPrice,
            date: bcvData.date,
            historical: bcvData.historical || false,
            jid
        });

    } catch (error) {
        logger.error('bcv', `Error en comando bcv: ${error.message}`, {
            error: error.stack,
            user: m.pushName,
            jid: m.key.remoteJid
        });

        await sock.sendMessage(m.key.remoteJid, {
            text: `❌ *Error al consultar el BCV*\n\n${error.message}`
        }, { quoted: m });
    }
}

/**
 * Normaliza y formatea el texto del precio a 'X.XXXX Bs'
 */
function formatPrice(priceText) {
    // 1. Reemplazar comas por puntos y eliminar caracteres no numéricos
    priceText = priceText.replace(/[^\d,.]/g, '').replace(',', '.');
    
    if (priceText && !isNaN(parseFloat(priceText))) {
        // 2. Formatear a 6 decimales para mantener precisión interna
        const priceFloat = parseFloat(priceText).toFixed(6);

        // 3. Recortar a 4 decimales para mostrar
        const parts = priceFloat.split('.');
        if (parts[1]) {
            parts[1] = parts[1].substring(0, 4);
            while (parts[1].length < 4) {
                parts[1] += '0';
            }
        }
        
        return `${parts.join('.')} Bs`;
    }
    return null;
}

/**
 * Obtiene los precios de Dólar y Euro desde el BCV
 */
async function getBCVPrice() {
    try {
        console.log('ℹ️ Consultando BCV...');

        const httpsAgent = new https.Agent({ rejectUnauthorized: false });

        const response = await axios.get('https://www.bcv.org.ve', {
            timeout: 15000,
            httpsAgent: httpsAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'es-ES,es;q=0.8,en;q=0.5,en-US;q=0.3',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        const $ = cheerio.load(response.data);
        console.log('ℹ️ Página del BCV cargada correctamente');
        
        // --- 1. EXTRACCIÓN DEL DÓLAR (USD) ---
        const dollarPriceElement = $('#dolar strong'); 
        let usdPrice = "N/A Bs";

        if (dollarPriceElement.length > 0) {
            usdPrice = formatPrice(dollarPriceElement.first().text().trim());
            console.log(`✅ Precio USD encontrado: ${usdPrice}`);
        } else {
            console.log('❌ No se encontró el elemento del precio USD');
        }
        
        // --- 2. EXTRACCIÓN DEL EURO (EUR) ---
        const euroPriceElement = $('#euro strong');
        let eurPrice = "N/A Bs";

        if (euroPriceElement.length > 0) {
            eurPrice = formatPrice(euroPriceElement.first().text().trim());
            console.log(`✅ Precio EUR encontrado: ${eurPrice}`);
        } else {
            console.log('❌ No se encontró el elemento del precio EUR');
        }

        if (usdPrice === "N/A Bs" && eurPrice === "N/A Bs") {
             throw new Error('No se pudo extraer ni el precio del dólar ni el del euro');
        }

        // --- 3. EXTRACCIÓN DE LA FECHA ---
        let bcvDate = '';
        const dateElement = $('.pull-right.dinpro.center .date-display-single');

        if (dateElement.length > 0) {
            bcvDate = dateElement.first().text().trim();
            const fechaTransformada = transformarFechaBCV(bcvDate);
            bcvDate = fechaTransformada;
        } else {
            bcvDate = new Date().toLocaleDateString('es-VE');
        }
        
        const fechacorta = bcvDate.split('/').join('');

        return {
            usdPrice: usdPrice,
            eurPrice: eurPrice,
            date: bcvDate, 
            fechacorta: fechacorta,
            time: new Date().toLocaleTimeString('es-VE'),
            updated: 'Hace unos segundos',
            historical: false
        };

    } catch (error) {
        console.error('❌ Error consultando BCV:', error.message);

        const now = new Date();
        const fechaCorta = now.toLocaleDateString('es-VE').split('/').join('');

        return {
            usdPrice: "36.5000 Bs (Est.)",
            eurPrice: "40.0000 Bs (Est.)",
            date: now.toLocaleDateString('es-VE'),
            fechacorta: fechaCorta,
            time: now.toLocaleTimeString('es-VE'),
            updated: 'Valores estimados - BCV no disponible',
            historical: false
        };
    }
}

/**
 * Busca en el historial por fecha
 */
async function getBCVFromHistorial(fechaInput) {
    try {
        const fechaNormalizada = fechaInput.replace(/-/g, '/');
        const fechacorta = fechaNormalizada.split('/').join('');

        console.log(`🔍 Buscando en historial: ${fechaNormalizada} (${fechacorta})`);

        const historial = await cargarHistorial();

        if (historial[fechacorta]) {
            const data = historial[fechacorta];
            console.log(`ℹ️ Precios históricos encontrados: USD=${data.usdPrice}, EUR=${data.eurPrice}`);
            return {
                usdPrice: data.usdPrice,
                eurPrice: data.eurPrice,
                date: fechaNormalizada,
                fechacorta: fechacorta,
                time: '--:--:--',
                updated: 'Dato histórico',
                historical: true
            };
        } else {
            throw new Error(`No se encontró registro para la fecha ${fechaNormalizada}`);
        }

    } catch (error) {
        console.error('❌ Error buscando en historial:', error.message);
        throw new Error(`No se pudo encontrar el precio para la fecha solicitada: ${error.message}`);
    }
}

/**
 * Guarda un nuevo registro en el historial (Ahora acepta USD y EUR)
 */
async function guardarEnHistorial(fechacorta, usdPrice, eurPrice) {
    try {
        const historial = await cargarHistorial();

        const nuevoRegistro = {
            usdPrice: usdPrice,
            eurPrice: eurPrice
        };
        
        const nuevoRegistroStr = JSON.stringify(nuevoRegistro);
        const existenteStr = historial[fechacorta] ? JSON.stringify(historial[fechacorta]) : null;

        if (!existenteStr || existenteStr !== nuevoRegistroStr) {
            historial[fechacorta] = nuevoRegistro;

            await fs.writeFile(HISTORIAL_FILE, JSON.stringify(historial, null, 2), 'utf8');
            console.log(`✅ Guardado en historial: ${fechacorta} -> USD: ${usdPrice}, EUR: ${eurPrice}`);
        } else {
            console.log(`ℹ️ Precios ya existen en historial: ${fechacorta}`);
        }

    } catch (error) {
        console.error('❌ Error guardando en historial:', error.message);
    }
}

/**
 * Carga el historial desde el archivo JSON, con compatibilidad para registros antiguos
 */
async function cargarHistorial() {
    try {
        const data = await fs.readFile(HISTORIAL_FILE, 'utf8');
        const json = JSON.parse(data);
        
        // Manejar registros antiguos que solo guardaban el precio del dólar (string)
        for (const key in json) {
            if (typeof json[key] === 'string') {
                json[key] = {
                    usdPrice: json[key],
                    eurPrice: "N/A Bs (Antiguo)"
                };
            }
        }
        
        return json;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('ℹ️ Creando nuevo archivo de historial...');
            await fs.writeFile(HISTORIAL_FILE, JSON.stringify({}, null, 2), 'utf8');
            return {};
        }
        console.error('❌ Error cargando historial:', error.message);
        return {};
    }
}

/**
 * Transforma fecha del BCV de "Día, DD Mes AAAA" a "DD/MM/AAAA"
 */
function transformarFechaBCV(fechaBCV) {
    const meses = {
        'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
        'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
        'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };

    const fechaNormalizada = fechaBCV.replace(/^[^,]+, /, '').replace(/\s+/g, ' ').trim();
    const partes = fechaNormalizada.split(' ');

    if (partes.length >= 3) {
        const dia = partes[0].padStart(2, '0');
        const mesTexto = partes[1].toLowerCase();
        const año = partes[2];

        if (meses[mesTexto] && año) {
            return `${dia}/${meses[mesTexto]}/${año}`;
        } else if (meses[mesTexto]) {
            const añoActual = new Date().getFullYear().toString();
            return `${dia}/${meses[mesTexto]}/${añoActual}`;
        }
    }
    return fechaBCV;
}

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
            text: '💰 *Consultando precio del dólar BCV...*'
        }, { quoted: m });

        logger.info('bcv', `Consultando precio del dólar para ${m.pushName}${fechaSolicitada ? ` fecha: ${fechaSolicitada}` : ''}`, { jid });

        let bcvData;

        // Si se solicita una fecha específica, buscar en el historial
        if (fechaSolicitada) {
            bcvData = await getBCVFromHistorial(fechaSolicitada);
        } else {
            // Consultar precio actual
            bcvData = await getBCVPrice();

            // Guardar en historial después de obtener el precio actual
            if (bcvData.price && bcvData.fechacorta) {
                await guardarEnHistorial(bcvData.fechacorta, bcvData.price);
            }
        }

        const message = `💵 *Tipo de Cambio BCV*\n\n` +
                       `💰 *Dólar:* ${bcvData.price}\n` +
                       `📅 *Fecha:* ${bcvData.date}\n` +
                       `${bcvData.historical ? '📚 _Dato histórico_' : '🔄 _Actualizado recientemente_'}\n` +
                       `\n_www.bcv.org.ve/_`;

        await sock.sendMessage(jid, {
            text: message
        }, { quoted: m });

        logger.success('bcv', `Precio del dólar enviado a ${m.pushName}`, {
            price: bcvData.price,
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
 * Obtiene el precio del dólar desde el BCV
 */
async function getBCVPrice() {
    try {
        console.log('🌐 Consultando BCV...');

        const httpsAgent = new https.Agent({
            rejectUnauthorized: false,
        });

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
        console.log('✅ Página del BCV cargada correctamente');

        // Selector específico del dólar principal
        console.log('🔍 Usando selector específico del dólar principal...');

        const dollarPriceElement = $('#dolar .col-sm-6.centrado strong');

        if (dollarPriceElement.length > 0) {
            let priceText = dollarPriceElement.first().text().trim();
            console.log(`✅ Precio encontrado en selector específico: "${priceText}"`);

            // Limpiar y formatear el precio - MANTENER MÁS DECIMALES
            priceText = priceText.replace(/[^\d,.]/g, '').replace(',', '.');

            if (priceText && !isNaN(parseFloat(priceText))) {
                // Formatear a 4 decimales en lugar de 2
                const dollarPrice = parseFloat(priceText).toFixed(6); // 6 decimales para mantener precisión

                // Recortar a 4 decimales pero manteniendo el formato correcto
                const parts = dollarPrice.split('.');
                if (parts[1]) {
                    // Mantener solo 4 decimales
                    parts[1] = parts[1].substring(0, 4);
                    // Asegurarse de que tenga 4 dígitos (rellenar con ceros si es necesario)
                    while (parts[1].length < 4) {
                        parts[1] += '0';
                    }
                }

                const formattedPrice = parts.join('.');
                console.log(`💰 Precio formateado (4 decimales): ${formattedPrice} Bs`);

                // EXTRAER FECHA DEL BCV - Selector corregido
                let bcvDate = '';
                const dateElement = $('.pull-right.dinpro.center .date-display-single');

                if (dateElement.length > 0) {
                    bcvDate = dateElement.first().text().trim();
                    console.log(`📅 Fecha extraída del BCV: "${bcvDate}"`);

                    // TRANSFORMAR FECHA: "Jueves, 20 Noviembre  2025" → "20/11/2025"
                    try {
                        const fechaTransformada = transformarFechaBCV(bcvDate);
                        bcvDate = fechaTransformada;
                        console.log(`📅 Fecha transformada: "${fechaTransformada}"`);
                    } catch (error) {
                        console.log('❌ Error transformando fecha, usando fecha original:', error.message);
                        // Si hay error, mantenemos la fecha original del BCV
                    }
                } else {
                    console.log('❌ No se encontró la fecha en el BCV, usando fecha local');
                    bcvDate = new Date().toLocaleDateString('es-VE');
                }

                // Crear fecha corta para el historial (ddmmaaaa)
                const fechacorta = bcvDate.split('/').join('');

                return {
                    price: `${formattedPrice} Bs`,
                    date: bcvDate, // Usa la fecha del BCV transformada
                    fechacorta: fechacorta,
                    time: new Date().toLocaleTimeString('es-VE'),
                    updated: 'Hace unos segundos',
                    historical: false
                };
            }
        } else {
            console.log('❌ No se encontró el elemento con el selector específico');
        }

        throw new Error('No se pudo extraer el precio del dólar');

    } catch (error) {
        console.error('❌ Error consultando BCV:', error.message);

        const now = new Date();
        const fechaCorta = now.toLocaleDateString('es-VE').split('/').join('');

        return {
            price: "36.5000 Bs (Estimado)",
            date: now.toLocaleDateString('es-VE'),
            fechacorta: fechaCorta,
            time: now.toLocaleTimeString('es-VE'),
            updated: 'Valor estimado - BCV no disponible',
            historical: false
        };
    }
}

/**
 * Busca en el historial por fecha
 */
async function getBCVFromHistorial(fechaInput) {
    try {
        // Normalizar fecha (acepta dd/mm/aaaa o dd-mm-aaaa)
        const fechaNormalizada = fechaInput.replace(/-/g, '/');
        const fechacorta = fechaNormalizada.split('/').join('');

        console.log(`📚 Buscando en historial: ${fechaNormalizada} (${fechacorta})`);

        // Cargar historial
        const historial = await cargarHistorial();

        if (historial[fechacorta]) {
            console.log(`✅ Precio histórico encontrado: ${historial[fechacorta]}`);
            return {
                price: historial[fechacorta],
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
 * Guarda un nuevo registro en el historial
 */
async function guardarEnHistorial(fechacorta, precio) {
    try {
        // Cargar historial existente
        const historial = await cargarHistorial();

        // Solo guardar si es un precio nuevo o diferente
        if (!historial[fechacorta] || historial[fechacorta] !== precio) {
            historial[fechacorta] = precio;

            // Guardar archivo
            await fs.writeFile(HISTORIAL_FILE, JSON.stringify(historial, null, 2), 'utf8');
            console.log(`💾 Guardado en historial: ${fechacorta} -> ${precio}`);
        } else {
            console.log(`ℹ️  Precio ya existe en historial: ${fechacorta}`);
        }

    } catch (error) {
        console.error('❌ Error guardando en historial:', error.message);
    }
}

/**
 * Carga el historial desde el archivo JSON
 */
async function cargarHistorial() {
    try {
        const data = await fs.readFile(HISTORIAL_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Si el archivo no existe, crear uno vacío
        if (error.code === 'ENOENT') {
            console.log('📁 Creando nuevo archivo de historial...');
            await fs.writeFile(HISTORIAL_FILE, JSON.stringify({}, null, 2), 'utf8');
            return {};
        }
        console.error('❌ Error cargando historial:', error.message);
        return {};
    }
}

/**
 * Transforma fecha del BCV de "Jueves, 20 Noviembre  2025" a "20/11/2025"
 */
function transformarFechaBCV(fechaBCV) {
    // Mapeo de meses en español a números
    const meses = {
        'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
        'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
        'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };

    // Remover el día de la semana (ej: "Jueves, ") y normalizar espacios múltiples
    const fechaNormalizada = fechaBCV.replace(/^[^,]+, /, '').replace(/\s+/g, ' ').trim();
    console.log(`📅 Fecha normalizada: "${fechaNormalizada}"`);

    // Dividir en día, mes y año (ahora con espacios normalizados)
    const partes = fechaNormalizada.split(' ');

    console.log(`📅 Partes de la fecha:`, partes);

    if (partes.length >= 3) {
        const dia = partes[0].padStart(2, '0');
        const mesTexto = partes[1].toLowerCase();
        const año = partes[2]; // Ahora debería capturar el año correctamente

        console.log(`📅 Día: ${dia}, Mes: ${mesTexto}, Año: ${año}`);

        const mesNumero = meses[mesTexto];

        if (mesNumero && año) {
            return `${dia}/${mesNumero}/${año}`;
        } else if (mesNumero) {
            // Si tenemos mes pero no año, usar año actual
            const añoActual = new Date().getFullYear().toString();
            return `${dia}/${mesNumero}/${añoActual}`;
        }
    }

    // Si no se puede transformar, devolver la fecha original
    console.log('❌ No se pudo transformar la fecha, usando original');
    return fechaBCV;
}
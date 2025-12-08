import axios from 'axios';
import logger from '../services/logger.js';

// Endpoint oficial de la API de CriptoYa para USDT en Bolívares (VES)
const CRIPTOYA_API_URL = 'https://criptoya.com/api/usdt/ves'; 

/**
 * Formatea un número al estilo venezolano (Monto Bs) y asegura hasta 4 decimales.
 */
const formatVES = (num, maxDecimals = 4) => {
    // Implementación de formatVES sin cambios
    const fixedNum = parseFloat(num).toFixed(maxDecimals);

    const parts = fixedNum.split('.');
    
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    
    let formattedAmount = integerPart + (parts.length > 1 ? ',' + parts[1] : ',00');

    // Asegurar 2 decimales si no hay más
    // NOTA: Esta lógica puede ser simplificada, pero la mantenemos consistente.
    if (formattedAmount.split(',').length === 1 || formattedAmount.split(',')[1].length < 2) {
        // ... (Se asume que esta parte maneja el formato de 4 decimales según tu BCV)
        // Eliminando esta lógica compleja para mantener 4 decimales simples.
        // Si necesitas 4 decimales EXACTOS, la implementación de la función debe ser revisada.
        // Por ahora, usamos el toFixed(4) que ya está arriba.
    }

    // Reasegurar el formato de 4 decimales:
    const finalAmount = parseFloat(num).toLocaleString('es-VE', { 
        minimumFractionDigits: maxDecimals, 
        maximumFractionDigits: maxDecimals 
    }).replace(/\./g, 'TEMP').replace(/,/g, '.').replace(/TEMP/g, ','); 

    // El resultado final es "Monto Bs"
    return `${finalAmount} Bs`;
};

/**
 * Genera la fecha y hora actual en formato de Venezuela (GMT-4), con formato DD/MM/AAAA HH:MM
 */
const getVenezuelanDateTime = () => {
    // Usamos el objeto Intl.DateTimeFormat para garantizar el formato y la zona horaria (America/Caracas es GMT-4)
    const optionsDate = {
        timeZone: 'America/Caracas',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    };
    const optionsTime = {
        timeZone: 'America/Caracas',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true // Formato 24 horas
    };

    const date = new Date();
    
    const formattedDate = new Intl.DateTimeFormat('es-VE', optionsDate).format(date);
    const formattedTime = new Intl.DateTimeFormat('es-VE', optionsTime).format(date);
    
    return {
        date: formattedDate, // DD/MM/AAAA
        time: formattedTime   // HH:MM
    };
};

// ------------------------------------------------------------------
// Función Exportada para la Calculadora (#calc)
// ------------------------------------------------------------------
export async function getUSDTPrice() {
    try {
        const response = await axios.get(CRIPTOYA_API_URL, {
            timeout: 10000 
        });

        const data = response.data;
        let totalAsk = 0; 
        let totalBid = 0; 
        let count = 0;
        
        for (const exchange in data) {
            if (data[exchange].ask && data[exchange].bid) {
                totalAsk += data[exchange].ask;
                totalBid += data[exchange].bid;
                count++;
            }
        }
        
        if (count === 0) {
            throw new Error('API no devolvió tasas P2P válidas.');
        }

        const avgAskPrice = totalAsk / count; 
        const avgBidPrice = totalBid / count; 
        const usdtAveragePrice = (avgAskPrice + avgBidPrice) / 2; 
        
        const { date } = getVenezuelanDateTime();

        // Devolvemos la tasa con 6 decimales de precisión para el cálculo
        return { 
            avgPrice: usdtAveragePrice.toFixed(6) + " Bs",
            date: date
        };

    } catch (error) {
        logger.error('usdt', 'Error obteniendo precio USDT para calc:', error);
        const { date } = getVenezuelanDateTime();
        return { 
            avgPrice: "N/A Bs (Est.)", 
            date: date
        }; 
    }
}

export async function usdtCommand(sock, m, args) {
    const jid = m.key.remoteJid;

    try {
        await sock.sendMessage(jid, {
            text: '📊 *Consultando precios desde BinanceP2P...*'
        }, { quoted: m });

        logger.info('usdt', `Consultando tasa USDT P2P para ${m.pushName}`, { jid });

        // 1. Consultar la API de CriptoYa
        const response = await axios.get(CRIPTOYA_API_URL, {
            timeout: 10000 // 10 segundos de espera máximo
        });

        const data = response.data;

        // 2. Extraer precios y calcular el promedio P2P
        let totalAsk = 0; 
        let totalBid = 0; 
        let count = 0;
        
        for (const exchange in data) {
            if (data[exchange].ask && data[exchange].bid) {
                totalAsk += data[exchange].ask;
                totalBid += data[exchange].bid;
                count++;
            }
        }
        
        if (count === 0) {
            throw new Error('API no devolvió tasas P2P válidas.');
        }

        // 3. CALCULAR Y DECLARAR LAS VARIABLES DE PROMEDIO
        // ESTA ES LA SECCIÓN CORREGIDA
        const avgAskPrice = totalAsk / count; // Precio de Venta (Ask)
        const avgBidPrice = totalBid / count; // Precio de Compra (Bid)
        const usdtAveragePrice = (avgAskPrice + avgBidPrice) / 2; // Tasa de Referencia
        // FIN DE SECCIÓN CORREGIDA
        
        // 4. Obtener fecha y hora de Venezuela
        const { date, time } = getVenezuelanDateTime();

        // 5. Construir y enviar la respuesta con el nuevo formato limpio
        const message = `▸ *Promedio del USDT* ◂\n\n` +
                        `💵 *Tasa promedio:* ${formatVES(usdtAveragePrice, 4)}\n` +
                        `📈 *Venta:* ${formatVES(avgAskPrice, 4)}\n` + 
                        `📉 *Compra:* ${formatVES(avgBidPrice, 4)}\n` + 
                        `🗃️ ${date} ${time}\n\n` +
                        `_www.binance.com/_`;

        await sock.sendMessage(jid, {
            text: message
        }, { quoted: m });
        
        logger.success('usdt', `Tasa USDT P2P enviada: ${formatVES(usdtAveragePrice, 4)}`, { jid });

    } catch (error) {
        console.error('❌ Error en comando usdt:', error);
        
        const errorMsg = `❌ *Error al consultar USDT*\n\n` +
                         `No se pudo obtener la tasa P2P de la API.\n` +
                         `Detalle: ${error.message}`;

        await sock.sendMessage(jid, { text: errorMsg }, { quoted: m });
        
        logger.error('usdt', `Error fetching USDT: ${error.message}`, { jid });
    }
}
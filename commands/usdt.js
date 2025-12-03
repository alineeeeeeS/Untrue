import axios from 'axios';
import logger from '../services/logger.js';

// Endpoint oficial de la API de CriptoYa para USDT en Bolívares (VES)
const CRIPTOYA_API_URL = 'https://criptoya.com/api/usdt/ves'; 

/**
 * Formatea un número al estilo venezolano (Monto Bs) y asegura hasta 4 decimales.
 */
const formatVES = (num, maxDecimals = 4) => {
    // Si el número original no tiene 4 decimales significativos, lo redondeamos.
    // Usamos toFixed para asegurar la cantidad de decimales, luego toLocaleString para el formato de miles/decimales
    const fixedNum = parseFloat(num).toFixed(maxDecimals);

    // Separar la parte entera y decimal
    const parts = fixedNum.split('.');
    
    // Formatear la parte entera con separador de miles (punto en VE)
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    
    // Reconstruir el monto con coma como separador decimal
    let formattedAmount = integerPart + (parts.length > 1 ? ',' + parts[1] : ',00');

    // Asegurar 2 decimales si no hay más
    if (formattedAmount.split(',').length === 1 || formattedAmount.split(',')[1].length < 2) {
        formattedAmount += '00';
    }

    // El resultado final es "Monto Bs"
    return `${formattedAmount} Bs`;
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
        hour12: false // Formato 24 horas
    };

    const date = new Date();
    
    const formattedDate = new Intl.DateTimeFormat('es-VE', optionsDate).format(date);
    const formattedTime = new Intl.DateTimeFormat('es-VE', optionsTime).format(date);
    
    return {
        date: formattedDate, // DD/MM/AAAA
        time: formattedTime   // HH:MM
    };
};


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

        // 3. Calcular el punto medio (Tasa de Referencia)
        const usdtAveragePrice = ((totalAsk / count) + (totalBid / count)) / 2;
        
        // 4. Obtener fecha y hora de Venezuela
        const { date, time } = getVenezuelanDateTime();

        // 5. Construir y enviar la respuesta con el nuevo formato limpio
        const message = `▸ *Promedio del USDT* ◂\n\n` +
                        `💵 *Tasa de referencia:* ${formatVES(usdtAveragePrice)}\n` +
                        `📈 *Precio de venta:* ${formatVES(avgAskPrice)}\n` +
                        `📉 *Precio de compra:* ${formatVES(avgBidPrice)}\n` +
                        `🗓️ _${date} ${time}_\n\n` +
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
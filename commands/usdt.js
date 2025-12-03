import axios from 'axios';
import logger from '../services/logger.js';

// Endpoint oficial de la API de CriptoYa para USDT en Bolívares (VES)
const CRIPTOYA_API_URL = 'https://criptoya.com/api/usdt/ves'; 

export async function usdtCommand(sock, m, args) {
    const jid = m.key.remoteJid;

    try {
        await sock.sendMessage(jid, {
            text: '🔎 *Consultando tasa de referencia P2P de USDT...* (Fuente: CriptoYa API)'
        }, { quoted: m });

        logger.info('usdt', `Consultando tasa USDT P2P para ${m.pushName}`, { jid });

        // 1. Consultar la API de CriptoYa
        const response = await axios.get(CRIPTOYA_API_URL, {
            timeout: 10000 // 10 segundos de espera máximo
        });

        const data = response.data;

        // 2. Extraer precios y calcular el promedio P2P
        let totalBid = 0; // Precio de Compra (lo que el exchange ofrece por tu USDT)
        let totalAsk = 0; // Precio de Venta (lo que el exchange pide por el USDT)
        let count = 0;
        
        // Iterar sobre los datos para sumar todos los precios 'bid' y 'ask'
        // Esto incluye Binance, Bitget, Bybit, etc.
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

        // 3. Calcular los promedios
        const avgAskPrice = totalAsk / count;
        const avgBidPrice = totalBid / count;
        
        // Calcular el punto medio (Tasa de Referencia general del mercado)
        const usdtAveragePrice = (avgAskPrice + avgBidPrice) / 2;
        
        // 4. Formatear la salida en Bolívares (VES)
        const formatVES = (num) => {
            return `Bs ${num.toLocaleString('es-VE', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            })}`;
        };

        const date = new Date().toLocaleDateString('es-VE');
        const time = new Date().toLocaleTimeString('es-VE');

        // 5. Construir y enviar la respuesta
        const message = `▸ *Promedio del USDT* ◂\n\n` +
                        `💵 *Tasa de referencia:* ${formatVES(usdtAveragePrice)}\n` +
                        `📈 *Precio de venta:* ${formatVES(avgAskPrice)}\n` +
                        `📉 *Precio de compra:* ${formatVES(avgBidPrice)}\n` +
                        `_${date} ${time}_\n\n` +
                        `▸ La tasa de referencia es promediada de acuerdo al historial de transacciones desde _BinanceP2P_`;

        await sock.sendMessage(jid, {
            text: message
        }, { quoted: m });
        
        logger.success('usdt', `Tasa USDT P2P enviada: ${formatVES(usdtAveragePrice)}`, { jid });

    } catch (error) {
        console.error('❌ Error en comando usdt:', error);
        
        const errorMsg = `❌ *Error al consultar USDT*\n\n` +
                         `No se pudo obtener la tasa P2P de la API.\n` +
                         `Detalle: ${error.message}`;

        await sock.sendMessage(jid, { text: errorMsg }, { quoted: m });
        
        logger.error('usdt', `Error fetching USDT: ${error.message}`, { jid });
    }
}
import axios from 'axios';
import logger from '../services/logger.js';

const CRIPTOYA_API_URL = 'https://criptoya.com/api/usdt/ves';

const formatVES = (num, maxDecimals = 4) => {
    const finalAmount = parseFloat(num).toLocaleString('es-VE', {
        minimumFractionDigits: maxDecimals,
        maximumFractionDigits: maxDecimals
    }).replace(/\./g, 'TEMP').replace(/,/g, '.').replace(/TEMP/g, ',');

    return `${finalAmount} Bs`;
};

const getVenezuelanDateTime = () => {
    const optionsDate = { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric' };
    const optionsTime = { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hour12: true };

    const date = new Date();
    const formattedDate = new Intl.DateTimeFormat('es-VE', optionsDate).format(date);
    const formattedTime = new Intl.DateTimeFormat('es-VE', optionsTime).format(date);

    return { date: formattedDate, time: formattedTime };
};

export async function getUSDTPrice() {
    try {
        const response = await axios.get(CRIPTOYA_API_URL, { timeout: 10000 });
        const data = response.data;
        let totalAsk = 0, totalBid = 0, count = 0;

        for (const exchange in data) {
            if (data[exchange].ask && data[exchange].bid) {
                totalAsk += data[exchange].ask;
                totalBid += data[exchange].bid;
                count++;
            }
        }

        if (count === 0) throw new Error('API no devolvió tasas P2P válidas.');

        const avgAskPrice = totalAsk / count;
        const avgBidPrice = totalBid / count;
        const usdtAveragePrice = (avgAskPrice + avgBidPrice) / 2;

        const { date } = getVenezuelanDateTime();

        return {
            avgPrice: usdtAveragePrice.toFixed(4) + " Bs",
            date: date
        };

    } catch (error) {
        logger.error('usdt', 'Error obteniendo precio USDT para calc:', error);
        const { date } = getVenezuelanDateTime();
        return { avgPrice: "N/A Bs (Est.)", date: date };
    }
}

export async function usdtCommand(sock, m, args) {
    const jid = m.key.remoteJid;

    try {
        await sock.sendMessage(jid, { text: 'Consultando precios desde BinanceP2P...' }, { quoted: m });
        logger.info('usdt', `Consultando tasa USDT P2P para ${m.pushName}`, { jid });

        const response = await axios.get(CRIPTOYA_API_URL, { timeout: 10000 });
        const data = response.data;

        let totalAsk = 0, totalBid = 0, count = 0;

        for (const exchange in data) {
            if (data[exchange].ask && data[exchange].bid) {
                totalAsk += data[exchange].ask;
                totalBid += data[exchange].bid;
                count++;
            }
        }

        if (count === 0) throw new Error('API no devolvió tasas P2P válidas.');

        const avgAskPrice = totalAsk / count;
        const avgBidPrice = totalBid / count;
        const usdtAveragePrice = (avgAskPrice + avgBidPrice) / 2;

        const { date, time } = getVenezuelanDateTime();

        const message = `Promedio del USDT\n\n` +
                        `Tasa promedio: ${formatVES(usdtAveragePrice, 4)}\n` +
                        `Venta: ${formatVES(avgAskPrice, 4)}\n` +
                        `Compra: ${formatVES(avgBidPrice, 4)}\n` +
                        `Fecha: ${date} ${time}\n\n` +
                        `Fuente: www.binance.com`;

        await sock.sendMessage(jid, { text: message }, { quoted: m });
        logger.success('usdt', `Tasa USDT P2P enviada: ${formatVES(usdtAveragePrice, 4)}`, { jid });

    } catch (error) {
        const errorMsg = `Error al consultar USDT. No se pudo obtener la tasa P2P.\nDetalle: ${error.message}`;
        await sock.sendMessage(jid, { text: errorMsg }, { quoted: m });
        logger.error('usdt', `Error fetching USDT: ${error.message}`, { jid });
    }
}

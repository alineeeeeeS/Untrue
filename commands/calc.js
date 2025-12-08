import { getBCVPrice, getBCVFromHistorial } from './bcv.js'; 
import { getUSDTPrice } from './usdt.js';
import logger from '../services/logger.js';

/**
 * Mapeo de monedas válidas y la función para obtener su tasa.
 */
const MONEDAS_VALIDAS = {
    'USD': {
        alias: ['usd', 'dolar'],
        fetcher: getBCVPrice,
        historicalFetcher: getBCVFromHistorial, // Función para historial
        rateKey: 'usdPrice',
        source: 'BCV'
    },
    'EUR': {
        alias: ['eur', 'euro'],
        fetcher: getBCVPrice,
        historicalFetcher: getBCVFromHistorial, // Función para historial
        rateKey: 'eurPrice',
        source: 'BCV'
    },
    'USDT': {
        alias: ['usdt', 'tether'],
        fetcher: getUSDTPrice, 
        historicalFetcher: null, // USDT no tiene historial implementado
        rateKey: 'avgPrice', 
        source: 'P2P'
    }
};

/**
 * Normaliza una cadena de precio (ej. "36,5000 Bs") a un número de alta precisión.
 */
function cleanPriceToNumber(priceString) {
    if (!priceString || priceString.includes('N/A') || priceString.includes('Est.')) {
        return null;
    }
    // Reemplaza la coma por punto para que parseFloat funcione correctamente (formato VE)
    const cleaned = String(priceString).replace(/[^\d,.]/g, '').replace(',', '.'); 
    const number = parseFloat(cleaned);
    return isNaN(number) ? null : number;
}

/**
 * Formatea un número resultado al estilo venezolano (separador de miles punto, decimal coma).
 */
function formatFinalResult(number, decimales) {
    if (isNaN(number)) return "Error";
    
    const fixedString = number.toFixed(decimales);
    const [entera, decimal] = fixedString.split('.');
    
    // Formatear la parte entera con punto como separador de miles
    const enteraFormateada = entera.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    
    // Unir usando la coma como separador decimal
    return enteraFormateada + (decimal ? ',' + decimal : '');
}

/**
 * Función principal del comando #calc
 */
export async function calcCommand(sock, m, args) {
    const jid = m.key.remoteJid;

    if (args.length < 2 || args.length > 3) {
        return sock.sendMessage(jid, {
            text: `❌ *Uso incorrecto del comando*\n\nUsa:\n• *#calc [moneda] [cantidad]* (Tasa actual)\n• *#calc [cantidad] [moneda] [fecha]* (Tasa histórica)\n\nEjemplos:\n• *#calc eur 560* (Actual)\n• *#calc 50 usd 01/12/2025* (Histórico)`
        }, { quoted: m });
    }

    const [arg1, arg2, arg3] = args.map(arg => String(arg).toLowerCase());
    const fecha = args.length === 3 ? args[2] : null;

    // 1. Detectar Moneda, Cantidad y Dirección
    let cantidad, monedaKey, direccion, monedaInfo;

    // Lógica para detectar el orden de Moneda/Cantidad (solo con arg1 y arg2)
    const isArg1Currency = Object.values(MONEDAS_VALIDAS).some(info => info.alias.includes(arg1));

    if (isArg1Currency) {
        // Extranjera -> VES (Ej: #calc eur 560)
        monedaInfo = Object.values(MONEDAS_VALIDAS).find(info => info.alias.includes(arg1));
        monedaKey = Object.keys(MONEDAS_VALIDAS).find(key => MONEDAS_VALIDAS[key] === monedaInfo);
        cantidad = cleanPriceToNumber(arg2);
        direccion = 'toVES';
    } else {
        // VES -> Extranjera (Ej: #calc 50 eur)
        monedaInfo = Object.values(MONEDAS_VALIDAS).find(info => info.alias.includes(arg2));
        if (monedaInfo) {
            monedaKey = Object.keys(MONEDAS_VALIDAS).find(key => MONEDAS_VALIDAS[key] === monedaInfo);
            cantidad = cleanPriceToNumber(arg1);
            direccion = 'fromVES';
        } else {
            return sock.sendMessage(jid, {
                text: `❌ *Moneda no válida*\n\nLas monedas soportadas son: *USD, EUR, USDT*.`
            }, { quoted: m });
        }
    }

    if (cantidad === null) {
        return sock.sendMessage(jid, { text: `❌ *Cantidad no válida*`, }, { quoted: m });
    }

    await sock.sendMessage(jid, {
        text: `⏳ *Consultando tasa de ${monedaKey}...*`
    }, { quoted: m });
    
    // 2. Obtener la Tasa (Priorizando el historial si la fecha está presente y es BCV)
    let fullData;
    
    if (fecha && monedaInfo.historicalFetcher) {
        // Tasa histórica (solo USD/EUR)
        try {
            fullData = await monedaInfo.historicalFetcher(fecha);
        } catch (e) {
             return sock.sendMessage(jid, {
                text: `❌ *Error Histórico*\n\nNo se encontró el registro para ${monedaKey} en la fecha *${fecha}*.`
            }, { quoted: m });
        }
    } else if (fecha && !monedaInfo.historicalFetcher) {
        // El usuario pidió fecha para USDT
         return sock.sendMessage(jid, {
            text: `⚠️ *Historial no disponible*\n\nSolo las tasas *USD* y *EUR* del BCV soportan consultas históricas. Usando la tasa actual de *${monedaKey}*.`
        }, { quoted: m });
    } else {
        // Tasa actual
        fullData = await monedaInfo.fetcher();
    }

    // 3. Extracción y Cálculo
    try {
        const tasaBruta = fullData[monedaInfo.rateKey];
        const tasa = cleanPriceToNumber(tasaBruta);
        const fuente = monedaInfo.source;
        const fechaTasa = fullData.date || 'Hoy';

        if (tasa === null || isNaN(tasa)) {
            throw new Error(`Tasa ${monedaKey} no disponible (${tasaBruta})`);
        }

        let resultado, unidadDestino, unidadOrigen;
        
        if (direccion === 'toVES') {
            resultado = (cantidad * tasa);
            unidadDestino = 'VES';
            unidadOrigen = monedaKey;
        } else {
            resultado = (cantidad / tasa);
            unidadDestino = monedaKey;
            unidadOrigen = 'VES';
        }
        
        // 4. Formato y Respuesta (Alta Precisión)
        const tasaFormateada = formatFinalResult(tasa, 6); 
        const decimalesResultado = unidadDestino === 'VES' ? 4 : 6;
        const resultadoFinal = formatFinalResult(resultado, decimalesResultado);
        
        const message = `
✅ *Calculadora de Cambio* ${fullData.historical ? '(Histórico)' : ''}

▸ *Cantidad a Convertir:* ${formatFinalResult(cantidad, 2)} ${unidadOrigen}
▸ *Tasa Utilizada:* ${tasaFormateada} VES/${unidadOrigen} (${fuente})
▸ *Fecha de Tasa:* ${fechaTasa}

*Resultado:*
*${resultadoFinal} ${unidadDestino}*
        `.trim();

        await sock.sendMessage(jid, {
            text: message
        }, { quoted: m });

        logger.info('calc', `Cálculo ${unidadOrigen} a ${unidadDestino} para ${m.pushName}`, {
            cantidad: cantidad,
            tasa: tasa,
            resultado: resultado,
            jid
        });

    } catch (error) {
        logger.error('calc', `Error en cálculo final: ${error.message}`, {
            error: error.stack,
            user: m.pushName,
            jid: jid
        });
        
        await sock.sendMessage(jid, {
            text: `❌ *Error al realizar el cálculo*\n\n${error.message}`
        }, { quoted: m });
    }
}
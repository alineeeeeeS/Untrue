[file name]: bcv.js
[file content begin]
import axios from 'axios';
import logger from '../services/logger.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HISTORIAL_FILE = join(__dirname, '../services/bcvTasas.json');

// API Key de exchangerate-api.com 
const API_KEY = '286aebb9a67d895fc12f91fc';
const API_KEY = process.env.EXCHANGERATE_API_KEY || '286aebb9a67d895fc12f91fc';

// Tasa de respaldo en caso de que la API falle (se actualiza manualmente)
const TASA_RESPALDO = {
  USD: 36.2500, // Ejemplo: 1 USD = 36.25 Bs
  EUR: 39.1800, // Ejemplo: 1 EUR = 39.18 Bs
  ultimaActualizacion: '15/01/2026'
};

// Cache en memoria para reducir llamadas a la API
let cache = {
  data: null,
  timestamp: 0,
  ttl: 10 * 60 * 1000 // 10 minutos en milisegundos
};

// --- CÓDIGO PARA EL COMANDO BCV ---

export async function bcvCommand(sock, m, args) {
  try {
    const jid = m.key.remoteJid;
    const fechaSolicitada = args[0];

    // Enviar mensaje de "escribiendo"
    await sock.sendPresenceUpdate('composing', jid);
    await sock.sendMessage(jid, { text: '📊 *Consultando tasas del BCV...*' }, { quoted: m });

    let bcvData;
    if (fechaSolicitada) {
      bcvData = await getBCVFromHistorial(fechaSolicitada);
    } else {
      bcvData = await getBCVPriceFromAPI();
      
      // Guardar en historial si tenemos datos válidos
      if (bcvData.usdPrice && bcvData.usdPrice !== "Error" && 
          bcvData.eurPrice && bcvData.eurPrice !== "Error" &&
          bcvData.fechacorta) {
        await guardarEnHistorial(bcvData.fechacorta, bcvData.usdPrice, bcvData.eurPrice, bcvData.source);
      }
    }

    let message;
    if (bcvData.error) {
      message = `❌ *Error consultando BCV*\n\n` +
               `No se pudo obtener la tasa actual.\n` +
               `▸ Usando datos de respaldo:\n\n` +
               `💰 *Dólar (USD):* ${bcvData.usdPrice || "N/A Bs"}\n` +
               `💶 *Euro (EUR):* ${bcvData.eurPrice || "N/A Bs"}\n` +
               `📅 *Fecha:* ${bcvData.date}\n` +
               `⚠️ _Última tasa disponible_`;
    } else {
      message = `▸ *Tipo de Cambio BCV* ◂\n\n` +
               `💰 *Dólar (USD):* ${bcvData.usdPrice}\n` +
               `💶 *Euro (EUR):* ${bcvData.eurPrice}\n` +
               `📅 *Fecha:* ${bcvData.date}\n` +
               `${bcvData.historical ? '🔍 _Dato histórico_' : '✅ _Actualizado recientemente_'}\n` +
               `\n_www.bcv.org.ve/_`;
    }

    await sock.sendMessage(jid, { text: message }, { quoted: m });
    await sock.sendPresenceUpdate('paused', jid);

  } catch (error) {
    logger.error('bcv', `Error: ${error.message}`, { jid: m.key.remoteJid });
    await sock.sendMessage(m.key.remoteJid, { 
      text: `❌ *Error inesperado:*\n${error.message}\n\n_Usa #bcv [fecha] para consultar histórico_` 
    }, { quoted: m });
    await sock.sendPresenceUpdate('paused', m.key.remoteJid);
  }
}

// FUNCIÓN PRINCIPAL CON API EXCHANGERATE
export async function getBCVPriceFromAPI() {
  try {
    // Verificar cache primero
    const now = Date.now();
    if (cache.data && (now - cache.timestamp) < cache.ttl) {
      console.log('📦 Usando datos en caché');
      return { ...cache.data, cached: true };
    }

    console.log('🌐 Consultando API exchangerate-api.com...');
    
    // Hacer ambas consultas en paralelo para mayor velocidad
    const [usdResponse, eurResponse] = await Promise.allSettled([
      axios.get(`${BASE_URL}/${API_KEY}/latest/USD`, {
        timeout: 10000,
        headers: { 'Accept': 'application/json' }
      }),
      axios.get(`${BASE_URL}/${API_KEY}/latest/EUR`, {
        timeout: 10000,
        headers: { 'Accept': 'application/json' }
      })
    ]);

    let usdRate = null;
    let eurRate = null;
    let fechaActualizacion = getCurrentDate();
    let source = 'exchangerate-api.com';

    // Procesar respuesta USD
    if (usdResponse.status === 'fulfilled' && usdResponse.value.data) {
      const data = usdResponse.value.data;
      if (data.result === 'success' && data.conversion_rates && data.conversion_rates.VES) {
        usdRate = parseFloat(data.conversion_rates.VES).toFixed(4);
        fechaActualizacion = formatAPIDate(data.time_last_update_utc);
        console.log(`✅ USD Rate: ${usdRate} Bs`);
      }
    }

    // Procesar respuesta EUR
    if (eurResponse.status === 'fulfilled' && eurResponse.value.data) {
      const data = eurResponse.value.data;
      if (data.result === 'success' && data.conversion_rates && data.conversion_rates.VES) {
        eurRate = parseFloat(data.conversion_rates.VES).toFixed(4);
        // Usar la fecha más reciente de las dos respuestas
        if (data.time_last_update_utc) {
          fechaActualizacion = formatAPIDate(data.time_last_update_utc);
        }
        console.log(`✅ EUR Rate: ${eurRate} Bs`);
      }
    }

    // Si alguna consulta falló, usar la otra para calcular la tasa faltante
    if (usdRate && !eurRate) {
      // Calcular EUR basado en USD y tasa EUR/USD
      try {
        const eurUsdResponse = await axios.get(`${BASE_URL}/${API_KEY}/pair/EUR/USD`, {
          timeout: 5000
        });
        if (eurUsdResponse.data && eurUsdResponse.data.conversion_rate) {
          const eurToUsd = eurUsdResponse.data.conversion_rate;
          eurRate = (parseFloat(usdRate) * parseFloat(eurToUsd)).toFixed(4);
          console.log(`🔁 EUR calculado: ${eurRate} Bs`);
        }
      } catch (calcError) {
        console.log('⚠️ No se pudo calcular tasa EUR');
      }
    }

    // Si aún no tenemos tasas, usar datos de respaldo
    if (!usdRate || !eurRate) {
      console.log('⚠️ Usando datos de respaldo');
      usdRate = usdRate || TASA_RESPALDO.USD.toFixed(4);
      eurRate = eurRate || TASA_RESPALDO.EUR.toFixed(4);
      fechaActualizacion = TASA_RESPALDO.ultimaActualizacion;
      source = 'Datos de respaldo';
    }

    const result = {
      usdPrice: `${usdRate} Bs`,
      eurPrice: `${eurRate} Bs`,
      date: fechaActualizacion,
      fechacorta: fechaActualizacion.split('/').join(''),
      historical: false,
      source: source,
      error: false
    };

    // Guardar en caché
    cache.data = result;
    cache.timestamp = Date.now();

    return result;

  } catch (error) {
    console.error('💥 Error en getBCVPriceFromAPI:', error.message);
    
    // Intentar usar caché aunque esté expirado
    if (cache.data) {
      console.log('🔄 Usando caché expirado como respaldo');
      return { ...cache.data, cached: true, error: true, source: 'Caché (respaldo)' };
    }

    // Último recurso: datos de respaldo
    return {
      usdPrice: `${TASA_RESPALDO.USD.toFixed(4)} Bs`,
      eurPrice: `${TASA_RESPALDO.EUR.toFixed(4)} Bs`,
      date: TASA_RESPALDO.ultimaActualizacion,
      fechacorta: TASA_RESPALDO.ultimaActualizacion.split('/').join(''),
      historical: false,
      source: 'Datos de respaldo (error API)',
      error: true
    };
  }
}

// Función para consulta única (más eficiente)
export async function getBCVPriceSingle() {
  try {
    // Usar solo una consulta con USD como base
    const response = await axios.get(`${BASE_URL}/${API_KEY}/latest/USD`, {
      timeout: 8000
    });

    if (response.data.result === 'success') {
      const data = response.data;
      const usdRate = parseFloat(data.conversion_rates.VES).toFixed(4);
      
      // Para EUR, necesitamos hacer una segunda consulta más pequeña
      let eurRate;
      try {
        const eurResponse = await axios.get(`${BASE_URL}/${API_KEY}/pair/EUR/USD`, {
          timeout: 5000
        });
        if (eurResponse.data.conversion_rate) {
          eurRate = (parseFloat(usdRate) * parseFloat(eurResponse.data.conversion_rate)).toFixed(4);
        }
      } catch {
        // Si falla, estimar EUR (1 EUR ≈ 1.08 USD)
        eurRate = (parseFloat(usdRate) * 1.08).toFixed(4);
      }

      return {
        usdPrice: `${usdRate} Bs`,
        eurPrice: `${eurRate} Bs`,
        date: formatAPIDate(data.time_last_update_utc),
        source: 'exchangerate-api.com',
        error: false
      };
    }
  } catch (error) {
    console.error('Error en consulta única:', error.message);
  }
  
  return null;
}

// Nueva función con múltiples estrategias
export async function getBCVPriceWithFallback() {
  try {
    // 1. Primero intentar con la API
    const apiData = await getBCVPriceSingle();
    if (apiData && !apiData.error) {
      // Actualizar cache
      cache.data = apiData;
      cache.timestamp = Date.now();
      return apiData;
    }

    // 2. Si falla, intentar desde el historial (última tasa guardada)
    const historial = await cargarHistorial();
    const fechas = Object.keys(historial).sort().reverse();
    
    if (fechas.length > 0) {
      const ultimaFecha = fechas[0];
      const ultimaData = historial[ultimaFecha];
      return {
        ...ultimaData,
        date: formatDateFromKey(ultimaFecha),
        fechacorta: ultimaFecha,
        historical: true,
        source: 'Historial local',
        note: 'Última tasa disponible'
      };
    }
    
    // 3. Si no hay historial, devolver datos de respaldo
    return {
      usdPrice: `${TASA_RESPALDO.USD.toFixed(4)} Bs`,
      eurPrice: `${TASA_RESPALDO.EUR.toFixed(4)} Bs`,
      date: TASA_RESPALDO.ultimaActualizacion,
      historical: false,
      source: 'Datos de respaldo',
      error: true
    };
    
  } catch (error) {
    console.error('Error en getBCVPriceWithFallback:', error);
    return {
      usdPrice: `${TASA_RESPALDO.USD.toFixed(4)} Bs`,
      eurPrice: `${TASA_RESPALDO.EUR.toFixed(4)} Bs`,
      date: TASA_RESPALDO.ultimaActualizacion,
      historical: false,
      source: 'Datos de respaldo (error)',
      error: true
    };
  }
}

// Funciones auxiliares
function formatAPIDate(utcDateString) {
  if (!utcDateString) return getCurrentDate();
  
  try {
    const date = new Date(utcDateString);
    const dia = date.getDate().toString().padStart(2, '0');
    const mes = (date.getMonth() + 1).toString().padStart(2, '0');
    const año = date.getFullYear();
    return `${dia}/${mes}/${año}`;
  } catch {
    return getCurrentDate();
  }
}

function getCurrentDate() {
  const now = new Date();
  const dia = now.getDate().toString().padStart(2, '0');
  const mes = (now.getMonth() + 1).toString().padStart(2, '0');
  const año = now.getFullYear();
  return `${dia}/${mes}/${año}`;
}

function formatDateFromKey(dateKey) {
  // Convierte "14012026" a "14/01/2026"
  if (dateKey.length === 8 && !isNaN(dateKey)) {
    return `${dateKey.slice(0, 2)}/${dateKey.slice(2, 4)}/${dateKey.slice(4)}`;
  }
  return dateKey;
}

// Gestión de historial (actualizada)
async function cargarHistorial() {
  try {
    await fs.access(HISTORIAL_FILE);
    const data = await fs.readFile(HISTORIAL_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log('Creando nuevo archivo de historial');
    return {};
  }
}

async function guardarEnHistorial(fechacorta, usdPrice, eurPrice, source = 'API') {
  try {
    const historial = await cargarHistorial();
    
    // Mantener solo los últimos 60 días para no saturar
    const fechas = Object.keys(historial).sort().reverse();
    if (fechas.length >= 60) {
      const toRemove = fechas.slice(60);
      toRemove.forEach(fecha => delete historial[fecha]);
    }
    
    historial[fechacorta] = { 
      usdPrice, 
      eurPrice,
      source,
      timestamp: new Date().toISOString()
    };
    
    await fs.writeFile(HISTORIAL_FILE, JSON.stringify(historial, null, 2));
  } catch (error) { 
    console.error('Error guardando historial:', error.message);
  }
}

export async function getBCVFromHistorial(fechaInput) {
  try {
    const fechacorta = fechaInput.replace(/-/g, '').replace(/\//g, '');
    const historial = await cargarHistorial();
    
    // Buscar exacto
    if (historial[fechacorta]) {
      return { 
        ...historial[fechacorta], 
        date: formatDateFromKey(fechacorta) || fechaInput, 
        historical: true 
      };
    }
    
    // Buscar por mes (si solo se proporciona mes y año)
    if (fechacorta.length === 6) {
      const fechasMes = Object.keys(historial).filter(f => f.startsWith(fechacorta));
      if (fechasMes.length > 0) {
        const fechaEncontrada = fechasMes[fechasMes.length - 1]; // Último del mes
        return {
          ...historial[fechaEncontrada],
          date: formatDateFromKey(fechaEncontrada),
          historical: true,
          note: 'Fecha aproximada (último dato del mes)'
        };
      }
    }
    
    // Buscar fecha más cercana
    const todasFechas = Object.keys(historial).sort();
    if (todasFechas.length > 0) {
      // Convertir a números para comparación
      const fechaNum = parseInt(fechacorta);
      const fechasNum = todasFechas.map(f => parseInt(f));
      
      // Encontrar la más cercana
      const fechaCercana = fechasNum.reduce((prev, curr) => {
        return (Math.abs(curr - fechaNum) < Math.abs(prev - fechaNum) ? curr : prev);
      });
      
      if (Math.abs(fechaCercana - fechaNum) <= 7) { // Diferencia de hasta 7 días
        const fechaStr = fechaCercana.toString().padStart(8, '0');
        return {
          ...historial[fechaStr],
          date: formatDateFromKey(fechaStr),
          historical: true,
          note: 'Fecha cercana encontrada'
        };
      }
    }
    
    throw new Error('Fecha no encontrada en historial. Usa formato DDMMAAAA o DD/MM/AAAA');
    
  } catch (error) {
    console.error('Error en getBCVFromHistorial:', error.message);
    throw error;
  }
}

// Función para actualizar manualmente las tasas de respaldo
export async function updateBackupRates(usdRate, eurRate) {
  TASA_RESPALDO.USD = parseFloat(usdRate);
  TASA_RESPALDO.EUR = parseFloat(eurRate);
  TASA_RESPALDO.ultimaActualizacion = getCurrentDate();
  console.log(`✅ Tasas de respaldo actualizadas: USD=${usdRate}, EUR=${eurRate}`);
}
[file content end]
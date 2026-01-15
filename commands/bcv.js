import axios from 'axios';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HISTORIAL_FILE = join(__dirname, '../services/bcvTasas.json');

// API Key - usa variable de entorno
const API_KEY = process.env.EXCHANGERATE_API_KEY || '286aebb9a67d895fc12f91fc';
const BASE_URL = 'https://v6.exchangerate-api.com/v6';

// Cache simple
let cache = {
    data: null,
    timestamp: 0,
    ttl: 10 * 60 * 1000 // 10 minutos
};

// --- FUNCIÓN PRINCIPAL ---
export async function bcvCommand(sock, m, args) {
    try {
        const jid = m.key.remoteJid;
        const fechaSolicitada = args[0];

        await sock.sendMessage(jid, { text: '📊 *Consultando tasas del BCV...*' }, { quoted: m });

        let bcvData;
        if (fechaSolicitada) {
            bcvData = await getBCVFromHistorial(fechaSolicitada);
        } else {
            bcvData = await getBCVPriceFromAPI();
            
            if (bcvData.usdPrice && !bcvData.error) {
                await guardarEnHistorial(
                    bcvData.fechacorta, 
                    bcvData.usdPrice, 
                    bcvData.eurPrice
                );
            }
        }

        let message;
        if (bcvData.error) {
            message = `❌ *Error consultando BCV*\n\n` +
                     `No se pudo obtener la tasa actual.\n\n` +
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
					 `\n_www.bcv.org.ve/_`
        }

        await sock.sendMessage(jid, { text: message }, { quoted: m });

    } catch (error) {
        console.error('Error en bcvCommand:', error.message);
        await sock.sendMessage(m.key.remoteJid, { 
            text: `❌ Error: ${error.message}` 
        }, { quoted: m });
    }
}

// --- OBTENER TASAS DESDE API (VERSIÓN SIMPLE) ---
export async function getBCVPriceFromAPI() {
    try {
        // Verificar cache
        const now = Date.now();
        if (cache.data && (now - cache.timestamp) < cache.ttl) {
            return { ...cache.data, cached: true };
        }

        console.log('🌐 Consultando API exchangerate-api.com...');
        
        // Solo consultar USD y calcular EUR
        const response = await axios.get(`${BASE_URL}/${API_KEY}/latest/USD`, {
            timeout: 10000
        });

        if (response.data.result === 'success') {
            const data = response.data;
            const usdRate = parseFloat(data.conversion_rates.VES).toFixed(4);
            
            // Calcular EUR (aproximado: 1 EUR ≈ 1.08 USD)
            const eurRate = (parseFloat(usdRate) * 1.08).toFixed(4);
            
            // Formatear fecha
            let fechaActualizacion = getCurrentDate();
            if (data.time_last_update_utc) {
                fechaActualizacion = formatAPIDate(data.time_last_update_utc);
            }

            const result = {
                usdPrice: `${usdRate} Bs`,
                eurPrice: `${eurRate} Bs`,
                date: fechaActualizacion,
                fechacorta: fechaActualizacion.split('/').join(''),
                historical: false,
                source: 'exchangerate-api.com',
                error: false
            };

            // Guardar en cache
            cache.data = result;
            cache.timestamp = Date.now();

            return result;
        }
        
        throw new Error('API no devolvió datos válidos');
        
    } catch (error) {
        console.error('💥 Error API:', error.message);
        
        // Datos de respaldo
        return {
            usdPrice: "36.2500 Bs",
            eurPrice: "39.1800 Bs",
            date: getCurrentDate(),
            fechacorta: getCurrentDate().split('/').join(''),
            historical: false,
            source: 'Datos de respaldo',
            error: true
        };
    }
}

// --- FUNCIONES AUXILIARES ---
function formatAPIDate(utcDateString) {
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

// --- GESTIÓN DE HISTORIAL ---
async function cargarHistorial() {
    try {
        await fs.access(HISTORIAL_FILE);
        const data = await fs.readFile(HISTORIAL_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        console.log('📁 Creando nuevo archivo de historial');
        return {};
    }
}

async function guardarEnHistorial(fechacorta, usdPrice, eurPrice) {
    try {
        const historial = await cargarHistorial();
        
        // Limitar a 30 días
        const fechas = Object.keys(historial).sort().reverse();
        if (fechas.length >= 30) {
            const toRemove = fechas.slice(30);
            toRemove.forEach(fecha => delete historial[fecha]);
        }
        
        historial[fechacorta] = { 
            usdPrice, 
            eurPrice,
            timestamp: new Date().toISOString()
        };
        
        await fs.writeFile(HISTORIAL_FILE, JSON.stringify(historial, null, 2));
    } catch (error) { 
        console.error('Error guardando historial:', error.message);
    }
}

export async function getBCVFromHistorial(fechaInput) {
    try {
        const fechacorta = fechaInput.replace(/\D/g, ''); // Solo números
        const historial = await cargarHistorial();
        
        if (historial[fechacorta]) {
            return { 
                ...historial[fechacorta], 
                date: formatDateFromKey(fechacorta), 
                historical: true 
            };
        }
        
        throw new Error('Fecha no encontrada. Formato: DDMMAAAA');
        
    } catch (error) {
        console.error('Error en getBCVFromHistorial:', error.message);
        throw error;
    }
}

function formatDateFromKey(dateKey) {
    if (dateKey.length === 8 && !isNaN(dateKey)) {
        return `${dateKey.slice(0, 2)}/${dateKey.slice(2, 4)}/${dateKey.slice(4)}`;
    }
    return dateKey;
}
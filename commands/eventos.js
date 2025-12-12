import { economy } from '../services/economy.js';

// Cooldown para el evento: 5 minutos
const COOLDOWN_TIME = 5 * 60 * 1000; 

// Base de la economía del evento: Impacto máximo de la pérdida/ganancia.
const MAX_IMPACT = 300; // Máximo que puede ganar/perder un usuario con bajo saldo

// Función de utilidad para generar un impacto monetario variable
function getRandomImpact(money, isNegative) {
    // Rango de impacto porcentual: 5% a 15%
    const minPercent = 0.05;
    const maxPercent = 0.15;
    // Rango de impacto fijo (Base): 50 a 200 Bs
    const minFixed = 50;
    const maxFixed = 200;

    // Cálculo del impacto
    const percentImpact = money * (minPercent + Math.random() * (maxPercent - minPercent)); 
    const fixedImpact = minFixed + Math.random() * (maxFixed - minFixed); 

    let rawImpact = Math.floor(percentImpact + fixedImpact);
    let finalImpact = Math.min(MAX_IMPACT, rawImpact); // Respeta el tope máximo

    return isNegative ? -finalImpact : finalImpact;
}

// --- DEFINICIÓN DE EVENTOS TEMÁTICOS VENEZOLANOS (MENSAJES ORIGINALES) ---
const EVENTS = [
    // --- Eventos Negativos (Probabilidad: 70%) ---
    {
        type: 'negative',
        emoji: '🚨',
        message: '¡ALCABALA! Tuviste que pagar la *vacuna* a los matraqueros. Perdiste',
    },
    {
        type: 'negative',
        emoji: '🍞',
        message: 'Fuiste a comprar harina PAN y la cobraron a precio de USDT. Perdiste',
    },
    {
        type: 'negative',
        emoji: '⛽',
        message: 'Se te coló el carro en la cola por gasolina. ¡Qué rabia! Perdiste',
    },
    { 
        type: 'negative', 
        emoji: '🔌', 
        message: 'Hubo un *bajón* de luz y la nevera se te dañó. Perdiste'
    },
    { 
        type: 'negative', 
        emoji: '📦', 
        message: 'El repartidor de tu encomienda cobró un *extra por el envío*. Perdiste' 
    },
    
    // --- Eventos Positivos (Probabilidad: 30%) ---
    {
        type: 'positive',
        emoji: '💰',
        message: 'Una tía te mandó unos riales desde el exterior. Ganaste',
    },
    {
        type: 'positive',
        emoji: '🎉',
        message: 'Pudiste comprar dólares a *BCV*. Ganaste',
    },
    {
        type: 'positive',
        emoji: '🤝',
        message: 'Te cayó el *Bono de Guerra*. Ganaste',
    }
];

// --- LÓGICA PRINCIPAL DEL COMANDO ---
export async function eventosCommand(sock, m) {
    const jid = m.key.remoteJid;
    // FIX: Se usa m.key.participant para identificar al usuario en grupos
    const sender = m.key.participant || m.sender; 
    
    await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });
    
    try {
        const user = await economy.getUser(sender);
        const now = Date.now();
        
        // --- 1. Chequeo de Cooldown ---
        const lastEventTimestamp = new Date(user.lastEvent || 0).getTime(); 
        if (now - lastEventTimestamp < COOLDOWN_TIME) {
            const remaining = COOLDOWN_TIME - (now - lastEventTimestamp);
            const minutes = Math.floor(remaining / (60 * 1000));
            const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
            
            let timeRemaining = '';
            if (minutes > 0) timeRemaining += `${minutes} minuto${minutes > 1 ? 's' : ''}`;
            if (seconds > 0) timeRemaining += `${minutes > 0 ? ' y ' : ''}${seconds} segundo${seconds > 1 ? 's' : ''}`;
            
            await sock.sendMessage(jid, { react: { text: "⏰", key: m.key } });
            // MENSAJE ORIGINAL MANTENIDO
            return sock.sendMessage(jid, { 
                text: `⏳ *TIEMPO DE ESPERA*.\n\nEl último evento ocurrió hace poco. Vuelve en *${timeRemaining.trim()}* para activar otro.` 
            }, { quoted: m });
        }
        
        // --- 2. Selección de Evento Ponderada (70% Negativo / 30% Positivo) ---
        const isNegative = Math.random() < 0.7; 
        const pool = EVENTS.filter(e => e.type === (isNegative ? 'negative' : 'positive'));
        const event = pool[Math.floor(Math.random() * pool.length)];

        // --- 3. Calcular Monto del Evento usando la función de utilidad ---
        let amount = getRandomImpact(user.money, isNegative);
        
        // Asegurar que el usuario no pierda más dinero del que tiene (en negativo)
        if (amount < 0 && Math.abs(amount) > user.money) {
            amount = -user.money; // Solo pierde lo que tiene
        }
        
        // LLAMADA CRÍTICA: Aquí es donde se actualiza y se obtiene el saldo guardado.
        const newBalance = await economy.updateBalance(sender, amount);
        
        // --- 4. Actualizar Cooldown y Notificar ---
        await economy.updateField(sender, 'lastEvent', now);
        
        const prefix = amount >= 0 ? '✅' : '🔴';
        const action = amount >= 0 ? 'Ganaste' : 'Perdiste';
        const formattedAmount = Math.abs(amount).toLocaleString('es-VE', { minimumFractionDigits: 2 });
        
        // MENSAJE ORIGINAL MANTENIDO
        const message = `${event.emoji} *EVENTO ACTIVADO* ${event.emoji}\n\n` +
                        `${event.message} *${formattedAmount} Bs*. \n\n` +
                        `----------------------------------------\n` +
                        `*${action}*: ${formattedAmount} Bs\n` +
                        `*Nuevo Saldo*: ${newBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`;

        await sock.sendMessage(jid, { react: { text: prefix, key: m.key } });
        await sock.sendMessage(jid, { text: message }, { quoted: m });
        
    } catch (error) {
        console.error('Error en eventosCommand:', error);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { text: "❌ Ocurrió un error en el evento. Intenta más tarde." }, { quoted: m });
    }
}
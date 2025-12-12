import { economy } from '../services/economy.js';

// Cooldown para el evento: 6 horas
const COOLDOWN_TIME = 6 * 60 * 60 * 1000; 

// Base de la economía del evento: Impacto máximo de la pérdida/ganancia.
const MAX_IMPACT = 300; // Máximo que puede ganar/perder un usuario con bajo saldo

// --- DEFINICIÓN DE EVENTOS TEMÁTICOS VENEZOLANOS ---
const EVENTS = [
    // --- Eventos Negativos (Probabilidad: 70%) ---
    {
        type: 'negative',
        emoji: '🚨',
        message: '¡ALCABALA! Tuviste que pagar la *vacuna* a los funcionarios. Perdiste',
        impact: (money) => Math.min(MAX_IMPACT, Math.floor(money * 0.15 + 100)) * -1, // Pierde 15% del saldo + un fijo, máx 300
    },
    {
        type: 'negative',
        emoji: '🍞',
        message: 'Fuiste a comprar harina PAN y la cobraron a precio de USDT. Perdiste',
        impact: (money) => Math.min(MAX_IMPACT, Math.floor(money * 0.05 + 50)) * -1, // Pierde 5% + un fijo, máx 300
    },
    {
        type: 'negative',
        emoji: '⛽️',
        message: 'Tuviste que comprar gasolina a bachaqueros. Te costó',
        impact: (money) => Math.min(MAX_IMPACT, Math.floor(money * 0.10 + 50)) * -1, // Pierde 10% + un fijo, máx 300
    },
    {
        type: 'negative',
        emoji: '💰',
        message: 'Un *malandro* te atracó en la calle. Te quitó',
        impact: (money) => Math.min(MAX_IMPACT * 1.5, Math.floor(money * 0.25)) * -1, // Pérdida más alta, máx 450
    },
    
    // --- Eventos Positivos (Probabilidad: 30%) ---
    {
        type: 'positive',
        emoji: '🥳',
        message: 'Te cayó el *bono* de Patria. Ganaste',
        impact: (money) => Math.min(MAX_IMPACT * 2, Math.floor(money * 0.20 + 200)), // Gana 20% + fijo, máx 600
    },
    {
        type: 'positive',
        emoji: '🇻🇪',
        message: '¡Buena suerte! Una tía te mandó una remesa desde el exterior. Ganaste',
        impact: (money) => Math.min(MAX_IMPACT * 1.5, Math.floor(money * 0.15 + 150)), // Gana 15% + fijo, máx 450
    },
];

/**
 * Ejecuta un evento aleatorio con impacto económico. Uso: #eventos
 */
export async function eventosCommand(sock, m) {
    const jid = m.key.remoteJid;
    const sender = m.key.participant || m.sender;
    
    await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });
    
    try {
        const user = await economy.getUser(sender);
        const now = Date.now();
        
        // --- 1. Verificar Cooldown ---
        const lastEventTimestamp = new Date(user.lastEvent).getTime();

        if (now - lastEventTimestamp < COOLDOWN_TIME) {
            const remaining = COOLDOWN_TIME - (now - lastEventTimestamp);
            
            // Convertir milisegundos restantes a horas y minutos
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            
            let timeRemaining = '';
            if (hours > 0) timeRemaining += `${hours} hora${hours > 1 ? 's' : ''}`;
            if (minutes > 0) timeRemaining += `${hours > 0 ? ' y ' : ''}${minutes} minuto${minutes > 1 ? 's' : ''}`;
            
            await sock.sendMessage(jid, { react: { text: "⏰", key: m.key } });
            return sock.sendMessage(jid, { text: `⏰ *EVENTOS:* Debes esperar. Vuelve en *${timeRemaining.trim()}* para activar otro evento.` }, { quoted: m });
        }
        
        // --- 2. Seleccionar Evento ---
        // Ponderación manual: Seleccionar un número entre 0 y 100.
        // 0-69 (70%): Negativo | 70-99 (30%): Positivo
        const rng = Math.floor(Math.random() * 100);
        let selectedEvents = rng < 70 
            ? EVENTS.filter(e => e.type === 'negative')
            : EVENTS.filter(e => e.type === 'positive');
            
        const event = selectedEvents[Math.floor(Math.random() * selectedEvents.length)];
        
        // --- 3. Calcular y Aplicar Impacto ---
        let amount = event.impact(user.money);
        
        // Asegurarse de que el usuario no pierda más dinero del que tiene (en negativo)
        if (amount < 0 && Math.abs(amount) > user.money) {
            amount = -user.money; // Solo pierde lo que tiene
        }
        
        const newBalance = await economy.updateBalance(sender, amount);
        
        // --- 4. Actualizar Cooldown y Notificar ---
        await economy.updateField(sender, 'lastEvent', now);
        
        const prefix = amount >= 0 ? '✅' : '🔴';
        const action = amount >= 0 ? 'Ganaste' : 'Perdiste';
        const formattedAmount = Math.abs(amount).toLocaleString('es-VE', { minimumFractionDigits: 2 });
        
        const message = `${event.emoji} *EVENTO ACTIVADO* ${event.emoji}\n\n` +
                        `${event.message} *${formattedAmount} Bs*.\n\n` +
                        `----------------------------------------\n` +
                        `*${action}*: ${formattedAmount} Bs\n` +
                        `*Nuevo Saldo*: ${newBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`;

        await sock.sendMessage(jid, { react: { text: prefix, key: m.key } });
        await sock.sendMessage(jid, { text: message }, { quoted: m });
        
    } catch (error) {
        console.error('Error en eventosCommand:', error);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { text: "❌ Ocurrió un error al activar el evento. Intenta más tarde." }, { quoted: m });
    }
}
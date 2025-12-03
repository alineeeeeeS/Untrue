class StatsManager {
    constructor() {
        this.startTime = new Date();
        this.totalCommands = 0;
        this.uniqueUsers = new Set(); // Almacena IDs de usuarios únicos
    }

    recordCommand(commandName, userId) {
        this.totalCommands++;
        this.uniqueUsers.add(userId); // Agregar usuario a la lista de únicos
    }

    getStats() {
        const uptime = Date.now() - this.startTime;
        const hours = Math.floor(uptime / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        
        // Obtener uso de memoria
        const memoryUsage = process.memoryUsage();
        const memoryMB = (memoryUsage.rss / 1024 / 1024).toFixed(2);
        
        return {
            uptime: `${hours}h ${minutes}m`,
            totalCommands: this.totalCommands,
            uniqueUsers: this.uniqueUsers.size,
            memoryUsage: `${memoryMB} MB`,
            startTime: this.startTime
        };
    }

    resetStats() {
        this.totalCommands = 0;
        this.uniqueUsers.clear();
        this.startTime = new Date();
    }
}

// Instancia global del administrador de estadísticas
const statsManager = new StatsManager();

// ID del creador
const CREATOR_ID = '30837949124772@lid';

/**
 * Verifica si el usuario es el creador del bot (compatible con grupos)
 */
function isCreator(userId, participant = null) {
    // En grupos, el ID real del usuario está en participant
    // En chats individuales, está en userId
    const effectiveUserId = participant || userId;
    
    console.log('🔍 DEBUG - UserId:', userId);
    console.log('🔍 DEBUG - Participant:', participant);
    console.log('🔍 DEBUG - Effective UserId:', effectiveUserId);
    console.log('🔍 DEBUG - Creator ID:', CREATOR_ID);
    console.log('🔍 DEBUG - ¿Es creador?:', effectiveUserId === CREATOR_ID);
    
    return effectiveUserId === CREATOR_ID;
}

/**
 * Formatea la duración de forma legible
 */
function formatUptime(uptimeStr) {
    const [hours, minutes] = uptimeStr.split(' ').map(val => parseInt(val));
    if (hours === 0) return `${minutes} minutos`;
    if (minutes === 0) return `${hours} horas`;
    return `${hours}h ${minutes}m`;
}

/**
 * Comando para ver estadísticas del bot (SOLO CREADOR)
 */
export async function statsCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const userId = m.key.remoteJid;
    const participant = m.key.participant;

    try {
        // Verificar si es el creador
        if (!isCreator(userId, participant)) {
            await sock.sendMessage(remoteJid, { 
                text: '❌ *Acceso denegado*\n\nEste comando solo está disponible para el creador del bot.'
            }, { quoted: m });
            return;
        }

        const stats = statsManager.getStats();

        let statsText = '🤖 *ESTADÍSTICAS DEL BOT*\n\n';
        
        // Información simplificada
        statsText += `⏰ *Encendido:* ${formatUptime(stats.uptime)}\n`;
        statsText += `📊 *Memoria:* ${stats.memoryUsage}\n`;
        statsText += `👥 *Usuarios:* ${stats.uniqueUsers}\n`;
        statsText += `🎯 *Comandos usados:* ${stats.totalCommands}`;

        // Manejar comando de reset
        if (args[0] === 'reset') {
            statsManager.resetStats();
            statsText += '\n\n✅ *Estadísticas reiniciadas correctamente*';
        }

        await sock.sendMessage(remoteJid, { 
            text: statsText
        }, { quoted: m });

        // Registrar el uso del comando stats (usar participant si existe para grupos)
        const userToRecord = participant || userId;
        statsManager.recordCommand('stats', userToRecord);

    } catch (error) {
        console.error('Error en comando stats:', error);
        await sock.sendMessage(remoteJid, { 
            text: '❌ Error al obtener estadísticas' 
        }, { quoted: m });
    }
}

/**
 * Función para registrar comandos
 */
export function recordCommandUsage(commandName, userId) {
    statsManager.recordCommand(commandName, userId);
}

/**
 * Obtener estadísticas para otros usos
 */
export function getStats() {
    return statsManager.getStats();
}
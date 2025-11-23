import logger from '../services/logger.js';

/**
 * Comando para ver estadísticas del bot
 * Comando: #stats
 */
export async function statsCommand(sock, m) {
    const remoteJid = m.key.remoteJid;

    try {
        const stats = await logger.getStats();

        let statsText = '📊 *ESTADÍSTICAS DEL BOT*\n\n';

        if (Object.keys(stats).length === 0) {
            statsText += 'No hay estadísticas disponibles aún.\nUsa algunos comandos para generar estadísticas.';
        } else {
            // Ordenar por uso (más popular primero)
            const sortedCommands = Object.entries(stats)
                .sort(([,a], [,b]) => b.count - a.count);

            sortedCommands.forEach(([command, data]) => {
                const lastUsed = new Date(data.lastUsed).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                statsText += `• *${command}:* ${data.count} usos\n`;
                statsText += `  👥 ${data.users.length} usuarios únicos\n`;
                statsText += `  ⏰ Último uso: ${lastUsed}\n\n`;
            });

            // Total general
            const totalUses = Object.values(stats).reduce((sum, cmd) => sum + cmd.count, 0);
            const totalUsers = new Set(Object.values(stats).flatMap(cmd => cmd.users)).size;

            statsText += `📈 *TOTAL:* ${totalUses} usos por ${totalUsers} usuarios`;
        }

        await sock.sendMessage(remoteJid, { 
            text: statsText
        }, { quoted: m });

        logger.command(remoteJid, 'stats', [], true);

    } catch (error) {
        logger.error('command', 'Error en comando stats', { error: error.message });
        await sock.sendMessage(remoteJid, { 
            text: '❌ Error al obtener estadísticas' 
        }, { quoted: m });
    }
}
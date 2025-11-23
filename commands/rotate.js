import logRotator from '../services/logRotator.js';

/**
 * Comando para rotar logs manualmente
 * Comando: #rotate
 */
export async function rotateCommand(sock, m) {
    const remoteJid = m.key.remoteJid;

    try {
        await sock.sendMessage(remoteJid, { 
            text: '🔄 *Iniciando rotación de logs...*' 
        }, { quoted: m });

        const report = await logRotator.runRotation();

        await sock.sendMessage(remoteJid, { 
            text: '✅ *Rotación de logs completada*\n\nLos logs antiguos han sido limpiados automáticamente.' 
        }, { quoted: m });

    } catch (error) {
        logger.error('command', 'Error en comando rotate', { error: error.message });
        await sock.sendMessage(remoteJid, { 
            text: '❌ Error al rotar logs' 
        }, { quoted: m });
    }
}
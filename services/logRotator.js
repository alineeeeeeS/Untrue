import fs from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import logger from './logger.js';

class LogRotator {
    constructor() {
        this.logDir = './logs';
        this.maxDays = 7; // Conservar logs de los últimos 7 días
        this.maxSize = 10 * 1024 * 1024; // 10MB máximo por archivo (Replit tiene límites)
    }

    /**
     * Rotar logs diarios - eliminar los más viejos
     */
    async rotateDailyLogs() {
        try {
            const dailyDir = join(this.logDir, 'daily');
            if (!existsSync(dailyDir)) {
                logger.info('logrotate', 'Directorio daily no existe, saltando rotación');
                return;
            }

            const files = await fs.readdir(dailyDir);
            const now = new Date();
            const cutoffDate = new Date(now);
            cutoffDate.setDate(cutoffDate.getDate() - this.maxDays);

            let deletedCount = 0;

            for (const file of files) {
                if (file.endsWith('.log')) {
                    // Extraer fecha del nombre (ej: "2025-11-10.log")
                    const dateStr = file.replace('.log', '');
                    const fileDate = new Date(dateStr);

                    // Si la fecha es inválida o es más antigua que el límite, eliminar
                    if (isNaN(fileDate.getTime()) || fileDate < cutoffDate) {
                        const filePath = join(dailyDir, file);
                        await fs.unlink(filePath);
                        deletedCount++;
                        logger.debug('logrotate', `Log eliminado: ${file}`);
                    }
                }
            }

            if (deletedCount > 0) {
                logger.info('logrotate', `Rotación completada: ${deletedCount} archivos antiguos eliminados`);
            } else {
                logger.debug('logrotate', 'Rotación: No se encontraron archivos para eliminar');
            }

        } catch (error) {
            logger.error('logrotate', 'Error rotando logs diarios', { error: error.message });
        }
    }

    /**
     * Verificar tamaño de archivos y rotar si son muy grandes
     */
    async checkFileSizes() {
        try {
            const checkFiles = [
                join(this.logDir, 'errors', 'errors.log'),
                join(this.logDir, 'messages', 'messages.log'),
                join(this.logDir, 'sessions', 'sessions.log'),
                join(this.logDir, 'commands', 'ping.log'),
                join(this.logDir, 'commands', 'stats.log'),
                join(this.logDir, 'commands', 'tiktok.log'),
                join(this.logDir, 'commands', 'ttaudio.log')
            ];

            let rotatedCount = 0;

            for (const filePath of checkFiles) {
                if (existsSync(filePath)) {
                    const stats = await fs.stat(filePath);
                    if (stats.size > this.maxSize) {
                        // Renombrar archivo grande y crear uno nuevo
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        const newPath = `${filePath}.${timestamp}.bak`;
                        await fs.rename(filePath, newPath);
                        rotatedCount++;
                        logger.info('logrotate', `Log rotado por tamaño: ${filePath} → ${newPath}`);
                    }
                }
            }

            if (rotatedCount > 0) {
                logger.info('logrotate', `Rotación por tamaño: ${rotatedCount} archivos rotados`);
            }

        } catch (error) {
            logger.error('logrotate', 'Error verificando tamaños de log', { error: error.message });
        }
    }

    /**
     * Limpiar archivos .bak muy antiguos
     */
    async cleanupBackupFiles() {
        try {
            const allFiles = await this.getAllLogFiles();
            const now = new Date();
            const backupCutoff = new Date(now);
            backupCutoff.setDate(backupCutoff.getDate() - 30); // 30 días para backups

            let cleanedCount = 0;

            for (const filePath of allFiles) {
                if (filePath.includes('.bak')) {
                    const stats = await fs.stat(filePath);
                    const fileDate = new Date(stats.mtime);

                    if (fileDate < backupCutoff) {
                        await fs.unlink(filePath);
                        cleanedCount++;
                        logger.debug('logrotate', `Backup eliminado: ${filePath}`);
                    }
                }
            }

            if (cleanedCount > 0) {
                logger.info('logrotate', `Limpieza de backups: ${cleanedCount} archivos eliminados`);
            }

        } catch (error) {
            logger.error('logrotate', 'Error limpiando backups', { error: error.message });
        }
    }

    /**
     * Obtener todos los archivos de log recursivamente
     */
    async getAllLogFiles() {
        const files = [];

        async function scanDirectory(dir) {
            try {
                const items = await fs.readdir(dir, { withFileTypes: true });

                for (const item of items) {
                    const fullPath = join(dir, item.name);

                    if (item.isDirectory()) {
                        await scanDirectory(fullPath);
                    } else if (item.isFile() && (item.name.endsWith('.log') || item.name.endsWith('.bak'))) {
                        files.push(fullPath);
                    }
                }
            } catch (error) {
                // Ignorar errores de directorio
            }
        }

        await scanDirectory(this.logDir);
        return files;
    }

    /**
     * Reporte de uso de almacenamiento
     */
    async getStorageReport() {
        try {
            const allFiles = await this.getAllLogFiles();
            let totalSize = 0;
            let fileCount = 0;

            for (const filePath of allFiles) {
                try {
                    const stats = await fs.stat(filePath);
                    totalSize += stats.size;
                    fileCount++;
                } catch (error) {
                    // Archivo pudo ser eliminado, continuar
                }
            }

            const report = {
                totalFiles: fileCount,
                totalSize: totalSize,
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
                logFiles: allFiles.filter(f => f.endsWith('.log')).length,
                backupFiles: allFiles.filter(f => f.endsWith('.bak')).length
            };

            logger.info('logrotate', 'Reporte de almacenamiento', report);
            return report;

        } catch (error) {
            logger.error('logrotate', 'Error generando reporte de almacenamiento', { error: error.message });
            return null;
        }
    }

    /**
     * Ejecutar todas las tareas de rotación
     */
    async runRotation() {
        logger.info('logrotate', '🚀 Iniciando rotación automática de logs...');

        const startTime = Date.now();

        await this.rotateDailyLogs();
        await this.checkFileSizes();
        await this.cleanupBackupFiles();
        const report = await this.getStorageReport();

        const duration = Date.now() - startTime;

        logger.info('logrotate', `✅ Rotación completada en ${duration}ms`, { 
            duration,
            report 
        });
    }
}

export default new LogRotator();
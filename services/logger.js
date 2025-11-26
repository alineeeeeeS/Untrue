import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

class Logger {
    constructor() {
        this.logDir = './logs';
        this.writeQueue = [];
        this.isProcessing = false;
        this.init();
    }

    /**
     * Inicializar estructura de directorios - OPTIMIZADO
     */
    init() {
        try {
            const directories = [
                this.logDir,
                join(this.logDir, 'commands'),
                join(this.logDir, 'errors'), 
                join(this.logDir, 'messages'),
                join(this.logDir, 'sessions'),
                join(this.logDir, 'daily')
            ];

            directories.forEach(dir => {
                if (!existsSync(dir)) {
                    mkdirSync(dir, { recursive: true });
                }
            });
            
            console.log('✅ Sistema de logs optimizado inicializado');
        } catch (error) {
            console.error('Error inicializando logs:', error);
        }
    }

    /**
     * Sistema de cola para escrituras - EVITA BLOQUEOS
     */
    async addToQueue(filePath, data) {
        this.writeQueue.push({ filePath, data });
        
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    async processQueue() {
        this.isProcessing = true;
        
        while (this.writeQueue.length > 0) {
            const { filePath, data } = this.writeQueue.shift();
            try {
                await fs.appendFile(filePath, data + '\n', 'utf8');
            } catch (error) {
                console.error('Error escribiendo log (cola):', error);
            }
            
            // Pequeña pausa para no saturar el sistema
            if (this.writeQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        this.isProcessing = false;
    }

    /**
     * Formatear timestamp - MÁS RÁPIDO
     */
    getTimestamp() {
        return new Date().toLocaleString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).replace(/, /, ' ');
    }

    /**
     * Obtener archivo de log diario
     */
    getDailyLogFile() {
        const date = new Date().toISOString().split('T')[0];
        return join(this.logDir, 'daily', `${date}.log`);
    }

    /**
     * Log general - OPTIMIZADO
     */
    async log(level, category, message, data = null) {
        const timestamp = this.getTimestamp();
        
        // Formato simplificado para mejor rendimiento
        const logString = `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}${data ? ' ' + JSON.stringify(data).substring(0, 200) : ''}`;

        // Console output con colores (síncrono)
        const colors = {
            info: '\x1b[36m',    // Cyan
            success: '\x1b[32m', // Green
            warn: '\x1b[33m',    // Yellow
            error: '\x1b[31m',   // Red
            debug: '\x1b[35m'    // Magenta
        };

        const color = colors[level] || '\x1b[0m';
        console.log(`${color}${logString}\x1b[0m`);

        // File output ASINCRÓNICO (no espera)
        this.addToQueue(this.getDailyLogFile(), logString);

        // Archivos específicos por categoría (solo si es necesario)
        if (['error', 'warn'].includes(level)) {
            this.addToQueue(join(this.logDir, 'errors', 'errors.log'), logString);
        }

        if (category === 'session') {
            this.addToQueue(join(this.logDir, 'sessions', 'sessions.log'), logString);
        }
    }

    /**
     * Métodos específicos por tipo de log
     */
    async info(category, message, data = null) {
        await this.log('info', category, message, data);
    }

    async success(category, message, data = null) {
        await this.log('success', category, message, data);
    }

    async warn(category, message, data = null) {
        await this.log('warn', category, message, data);
    }

    async error(category, message, data = null) {
        await this.log('error', category, message, data);
    }

    async debug(category, message, data = null) {
        await this.log('debug', category, message, data);
    }

    /**
     * Log de comandos específico - OPTIMIZADO
     */
    async command(user, command, args, success = true, result = null) {
        const data = {
            user: user.replace(/@s\.whatsapp\.net$/, ''), // Acortar ID
            command,
            args: args.slice(0, 3), // Limitar args
            success,
            result: result ? { type: result.type } : null
        };

        // Log rápido a consola
        const status = success ? '✅' : '❌';
        console.log(`${status} [COMMAND] ${data.user} -> ${command} ${args.join(' ')}`);

        // Log asíncrono a archivos
        await this.log(success ? 'success' : 'error', 'command', 
            `Comando: ${command}`, data);

        // Log específico del comando (asíncrono)
        this.addToQueue(
            join(this.logDir, 'commands', `${command}.log`),
            `[${this.getTimestamp()}] ${data.user} -> ${command} ${args.join(' ')} -> ${success ? 'ÉXITO' : 'FALLO'}`
        );
    }

    /**
     * Log de mensajes - OPTIMIZADO
     */
    async message(user, message, type = 'received') {
        const truncatedMessage = message.length > 50 ? message.substring(0, 50) + '...' : message;

        // Solo loggear a archivo si es muy largo, sino solo consola
        if (message.length > 100) {
            this.addToQueue(
                join(this.logDir, 'messages', 'messages.log'),
                `[${this.getTimestamp()}] [${type.toUpperCase()}] ${user}: ${truncatedMessage}`
            );
        }

        await this.log('info', 'message', 
            `Mensaje ${type}`, { 
                user: user.replace(/@s\.whatsapp\.net$/, ''), 
                message: truncatedMessage, 
                type 
            });
    }

    /**
     * Log de conexión - SIMPLIFICADO
     */
    async connection(event, data = null) {
        console.log(`🔗 [CONNECTION] ${event}`);
        await this.log('info', 'session', event, data);
    }

    /**
     * Log de descargas - NUEVO (útil para YouTube, Instagram, etc.)
     */
    async download(platform, url, success, fileSize = null, error = null) {
        const data = {
            platform,
            url: url.substring(0, 100), // Limitar longitud de URL
            success,
            fileSize,
            error: error ? error.message : null
        };

        const status = success ? '📥' : '❌';
        console.log(`${status} [DOWNLOAD] ${platform}: ${success ? 'ÉXITO' : 'FALLO'} - ${fileSize ? (fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}`);

        await this.log(success ? 'success' : 'error', 'download', 
            `Descarga ${platform}`, data);
    }

    /**
     * Log de errores críticos - NUEVO
     */
    async critical(error, context = {}) {
        const data = {
            error: error.message,
            stack: error.stack,
            ...context
        };

        console.error(`💥 [CRITICAL] ${error.message}`);
        
        await this.log('error', 'critical', 
            `Error crítico: ${error.message}`, data);

        // Siempre guardar errores críticos en archivo especial
        this.addToQueue(
            join(this.logDir, 'errors', 'critical.log'),
            `[${this.getTimestamp()}] ${error.message}\nStack: ${error.stack}\nContext: ${JSON.stringify(context)}`
        );
    }
}

// Exportar instancia única
const logger = new Logger();

export default logger;
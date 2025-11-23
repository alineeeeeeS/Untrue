import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

class Logger {
    constructor() {
        this.logDir = './logs';
        this.statsDir = './stats';
        this.init();
    }

    /**
     * Inicializar estructura de directorios
     */
    init() {
        const directories = [
            this.logDir,
            join(this.logDir, 'commands'),
            join(this.logDir, 'errors'),
            join(this.logDir, 'messages'),
            join(this.logDir, 'sessions'),
            join(this.logDir, 'daily'),
            this.statsDir
        ];

        directories.forEach(dir => {
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
                console.log(`📁 Directorio creado: ${dir}`);
            }
        });
        console.log('✅ Sistema de logs inicializado');
    }

    /**
     * Formatear timestamp
     */
    getTimestamp() {
        return new Date().toISOString();
    }

    /**
     * Obtener archivo de log diario
     */
    getDailyLogFile() {
        const date = new Date().toISOString().split('T')[0];
        return join(this.logDir, 'daily', `${date}.log`);
    }

    /**
     * Escribir en archivo de log
     */
    async writeToFile(filePath, data) {
        try {
            await fs.appendFile(filePath, data + '\n', 'utf8');
        } catch (error) {
            console.error('Error escribiendo log:', error);
        }
    }

    /**
     * Log general
     */
    async log(level, category, message, data = null) {
        const timestamp = this.getTimestamp();
        const logEntry = {
            timestamp,
            level,
            category,
            message,
            data
        };

        const logString = `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message} ${data ? JSON.stringify(data) : ''}`;

        // Console output con colores
        const colors = {
            info: '\x1b[36m',    // Cyan
            success: '\x1b[32m', // Green
            warn: '\x1b[33m',    // Yellow
            error: '\x1b[31m',   // Red
            debug: '\x1b[35m'    // Magenta
        };

        const color = colors[level] || '\x1b[0m';
        console.log(`${color}${logString}\x1b[0m`);

        // File output
        await this.writeToFile(this.getDailyLogFile(), logString);

        // Archivos específicos por categoría
        if (['error', 'warn'].includes(level)) {
            await this.writeToFile(join(this.logDir, 'errors', 'errors.log'), logString);
        }

        if (category === 'session') {
            await this.writeToFile(join(this.logDir, 'sessions', 'sessions.log'), logString);
        }

        // Actualizar estadísticas para comandos exitosos
        if (level === 'success' && data?.command) {
            await this.updateCommandStats(data.command, data.user);
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
     * Log de comandos específico
     */
    async command(user, command, args, success = true, result = null) {
        const data = {
            user,
            command,
            args,
            success,
            result: result ? (typeof result === 'object' ? { type: result.type } : result) : null
        };

        await this.log(success ? 'success' : 'error', 'command', 
            `Comando ejecutado: ${command}`, data);

        // Log específico del comando
        await this.writeToFile(
            join(this.logDir, 'commands', `${command}.log`),
            `[${this.getTimestamp()}] ${user} -> ${command} ${JSON.stringify(args)} -> ${success ? 'ÉXITO' : 'FALLO'}`
        );
    }

    /**
     * Log de mensajes
     */
    async message(user, message, type = 'received') {
        const truncatedMessage = message.length > 100 ? message.substring(0, 100) + '...' : message;

        await this.log('info', 'message', 
            `Mensaje ${type}`, { user, message: truncatedMessage, type });

        await this.writeToFile(
            join(this.logDir, 'messages', 'messages.log'),
            `[${this.getTimestamp()}] [${type.toUpperCase()}] ${user}: ${truncatedMessage}`
        );
    }

    /**
     * Log de conexión
     */
    async connection(event, data = null) {
        await this.log('info', 'session', event, data);
    }

    /**
     * Actualizar estadísticas de comandos
     */
    async updateCommandStats(command, user) {
        try {
            const statsFile = join(this.statsDir, 'commands.json');
            let stats = {};

            if (existsSync(statsFile)) {
                const content = await fs.readFile(statsFile, 'utf8');
                stats = JSON.parse(content);
            }

            // Inicializar comando si no existe
            if (!stats[command]) {
                stats[command] = { 
                    count: 0, 
                    users: [], 
                    lastUsed: null,
                    lastUser: null
                };
            }

            // Actualizar estadísticas
            stats[command].count++;
            if (!stats[command].users.includes(user)) {
                stats[command].users.push(user);
            }
            stats[command].lastUsed = this.getTimestamp();
            stats[command].lastUser = user;

            await fs.writeFile(statsFile, JSON.stringify(stats, null, 2));
        } catch (error) {
            console.error('Error actualizando estadísticas:', error);
        }
    }

    /**
     * Obtener estadísticas
     */
    async getStats() {
        try {
            const statsFile = join(this.statsDir, 'commands.json');
            if (existsSync(statsFile)) {
                const content = await fs.readFile(statsFile, 'utf8');
                return JSON.parse(content);
            }
            return {};
        } catch (error) {
            return {};
        }
    }
}

// Exportar instancia única
export default new Logger();
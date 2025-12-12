import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../database/users.json');

// Función para asegurar que el archivo JSON exista.
// Si el bot se inicia y el archivo no está, lo crea.
async function initDB() {
    try {
        await fs.access(DB_PATH);
    } catch {
        const initialData = { users: {} };
        // Crear la carpeta database si no existe (capa de seguridad)
        await fs.mkdir(dirname(DB_PATH), { recursive: true }); 
        await fs.writeFile(DB_PATH, JSON.stringify(initialData, null, 2));
        logger.warn('Economy', 'Archivo de base de datos de usuarios creado por primera vez.');
    }
}

initDB(); 

export const economy = {
    // 1. Obtener datos de un usuario o crearlo si no existe
    async getUser(userId) {
        // Lee la data del JSON
        const data = JSON.parse(await fs.readFile(DB_PATH, 'utf-8'));
        
        if (!data.users[userId]) {
            data.users[userId] = {
                money: 500, // Bono inicial de bienvenida
                lastDaily: 0,
                wins: 0,
                losses: 0
            };
            // Guarda el nuevo usuario
            await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
        }
        return data.users[userId];
    },

    // 2. Modificar el saldo (suma o resta) y guardar de forma segura
    async updateBalance(userId, amount) {
        const data = JSON.parse(await fs.readFile(DB_PATH, 'utf-8'));
        
        // Si el usuario no existe, lo crea antes de actualizar
        if (!data.users[userId]) {
            await this.getUser(userId); 
            return this.updateBalance(userId, amount);
        }
        
        const user = data.users[userId];
        user.money += amount;
        
        // Evitar saldos negativos
        if (user.money < 0) user.money = 0;

        await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
        return user.money;
    },
    
    // 3. Actualizar un campo específico (útil para lastDaily y estadísticas de juego)
    async updateField(userId, field, value) {
        const data = JSON.parse(await fs.readFile(DB_PATH, 'utf-8'));
        
        if (!data.users[userId]) {
             await this.getUser(userId); 
             return this.updateField(userId, field, value);
        }
        
        data.users[userId][field] = value;
        await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
        return data.users[userId];
    }
};
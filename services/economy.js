import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../database/users.json');

// Función para asegurar que el archivo JSON exista.
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
        
        // Verifica si el usuario ya existe o si necesita migración
        let userNeedsSave = false;
        
        if (!data.users[userId]) {
            data.users[userId] = {
                money: 500, // Bono inicial de bienvenida
                lastDaily: 0,
                lastEvent: 0,
                wins: 0,
                losses: 0
            };
            userNeedsSave = true;
        }
        
        // Migración (Asegura que usuarios viejos tengan lastEvent)
        if (data.users[userId].lastEvent === undefined) {
             data.users[userId].lastEvent = 0;
             userNeedsSave = true;
        }

        if (userNeedsSave) {
             // Guarda el nuevo usuario o el usuario migrado
             await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
        }
        
        return data.users[userId];
    },

    // 2. Modificar el saldo (suma o resta) y guardar de forma segura
    async updateBalance(userId, amount) {
        // Lee la data inicial
        let data = JSON.parse(await fs.readFile(DB_PATH, 'utf-8'));
        
        // Si el usuario no existe, lo crea a través de getUser (que lo guarda)
        if (!data.users[userId]) {
            await this.getUser(userId); 
            // **FIX**: Vuelve a leer la data para asegurar que el usuario creado esté en el objeto 'data'
            data = JSON.parse(await fs.readFile(DB_PATH, 'utf-8'));
        }
        
        const user = data.users[userId];
        user.money += amount;
        
        // Evitar saldos negativos
        if (user.money < 0) user.money = 0;

        await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
        return user.money;
    },
    
    // 3. Actualizar un campo específico (útil para lastDaily, lastEvent y estadísticas de juego)
    async updateField(userId, field, value) {
        // Lee la data inicial
        let data = JSON.parse(await fs.readFile(DB_PATH, 'utf-8'));
        
        if (!data.users[userId]) {
             await this.getUser(userId); 
             // Vuelve a leer la data para incluir el usuario recién creado
             data = JSON.parse(await fs.readFile(DB_PATH, 'utf-8'));
        }
        
        data.users[userId][field] = value;
        await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
        return data.users[userId];
    },
    
    // 4. Obtener todos los IDs de usuarios (Para uso futuro en rankings o eventos grupales)
    async getAllUserIds() {
        const data = JSON.parse(await fs.readFile(DB_PATH, 'utf-8'));
        return Object.keys(data.users);
    }
};
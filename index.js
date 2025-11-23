import { connectToWhatsApp } from './bot.js';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Iniciando Bot WhatsApp en Koyeb...');

// Health checks simples
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        platform: 'Koyeb',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

app.get('/ping', (req, res) => {
    res.json({ pong: Date.now() });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor listo en puerto ${PORT}`);
    console.log('📱 Iniciando conexión WhatsApp...');
});

// Iniciar bot WhatsApp
async function initializeBot() {
    try {
        await connectToWhatsApp();
        console.log('✅ Bot WhatsApp CONECTADO y funcionando');
    } catch (error) {
        console.error('❌ Error conectando bot:', error.message);
        console.log('🔄 Reintentando en 10 segundos...');
        setTimeout(initializeBot, 10000);
    }
}

// Delay inicial para estabilizar el servidor
setTimeout(initializeBot, 5000);
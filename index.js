import { connectToWhatsApp } from './bot.js';
import express from 'express';

// Railway usa process.env.PORT, si no existe usa 3000
const PORT = process.env.PORT || 3000;

const app = express();

console.log('🤖 Bot WhatsApp - Railway 24/7');

app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        platform: 'Railway',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        port: PORT
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

app.get('/ping', (req, res) => {
    res.json({ pong: Date.now() });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Bot ejecutándose en puerto ${PORT}`);
    console.log('📱 Plataforma: Railway (24/7 garantizado)');
});

// Iniciar bot
async function startBot() {
    try {
        await connectToWhatsApp();
        console.log('✅ Bot WhatsApp conectado');
    } catch (error) {
        console.error('❌ Error bot:', error);
        setTimeout(startBot, 15000);
    }
}

setTimeout(startBot, 3000);

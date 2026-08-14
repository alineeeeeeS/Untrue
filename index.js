import { connectToWhatsApp } from './bot.js';
import express from 'express';

const PORT = process.env.PORT || 3000;
const app = express();

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        platform: 'Railway',
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

async function startBot() {
    try {
        await connectToWhatsApp();
        console.log('whatsapp bot conectado');
    } catch (error) {
        console.error('Bot error:', error.message);
        setTimeout(startBot, 15000);
    }
}

setTimeout(startBot, 3000);

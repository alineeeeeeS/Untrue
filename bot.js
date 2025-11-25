import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import fs from 'fs/promises';
import { existsSync } from 'fs';

// ==========================================
// 🎯 CONFIGURACIÓN SIMPLIFICADA PARA RAILWAY
// ==========================================

// Directorio simple sin volumes complejos
const SESSION_DIR = './whatsapp_session';

let isConnected = false;
let currentSocket = null;

console.log('🚀 Iniciando bot de WhatsApp...');
console.log('📁 Directorio de sesión:', SESSION_DIR);

// ==========================================
// 🎯 INICIALIZACIÓN SIMPLE
// ==========================================

async function initializeBot() {
    try {
        console.log('🔧 Inicializando WhatsApp...');
        
        // Crear directorio de sesión si no existe
        if (!existsSync(SESSION_DIR)) {
            await fs.mkdir(SESSION_DIR, { recursive: true });
            console.log('✅ Directorio de sesión creado');
        }

        const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
        const { version } = await fetchLatestBaileysVersion();

        console.log('🔐 Estado de sesión:', state.creds?.registered ? 'GUARDADA ✅' : 'NUEVA ❌');

        const sock = makeWASocket({
            version,
            auth: { creds: state.creds, keys: state.keys },
            browser: ["Ubuntu", "Chrome", "120.0.0.0"],
            printQRInTerminal: true,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            connectTimeoutMs: 30000,
        });

        currentSocket = sock;

        // ==========================================
        // 🎯 MANEJADORES DE EVENTOS
        // ==========================================

        sock.ev.on('connection.update', (update) => {
            const { connection, qr, lastDisconnect } = update;
            
            console.log('📡 Estado de conexión:', connection);

            if (qr) {
                console.log('\n' + '='.repeat(40));
                console.log('📱 ESCANEA EL CÓDIGO QR:');
                console.log('='.repeat(40));
                qrcode.generate(qr, { small: true });
                console.log('='.repeat(40) + '\n');
            }

            if (connection === 'open') {
                console.log('🎉 ¡CONECTADO A WHATSAPP!');
                console.log('🤖 Bot listo para recibir mensajes');
                isConnected = true;
            }

            if (connection === 'close') {
                console.log('❌ Conexión cerrada, reconectando...');
                isConnected = false;
                setTimeout(initializeBot, 5000);
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m) => {
            try {
                const message = m.messages[0];
                if (!message || message.key.fromMe) return;

                console.log('📩 Mensaje recibido');

                let text = '';
                if (message.message?.conversation) {
                    text = message.message.conversation;
                } else if (message.message?.extendedTextMessage?.text) {
                    text = message.message.extendedTextMessage.text;
                }

                if (text.startsWith('#')) {
                    const args = text.trim().split(' ');
                    const commandName = args[0].toLowerCase().replace('#', '');

                    console.log(`⚡ Comando: ${commandName}`);

                    try {
                        const { handleCommand } = await import('./commands/commandHandler.js');
                        await handleCommand(sock, message, commandName, args.slice(1));
                    } catch (error) {
                        console.error(`❌ Error en comando:`, error);
                        await sock.sendMessage(message.key.remoteJid, {
                            text: `❌ Error: ${error.message}`
                        });
                    }
                }
            } catch (error) {
                console.error('💥 Error procesando mensaje:', error);
            }
        });

        console.log('✅ Bot inicializado correctamente');
        return sock;

    } catch (error) {
        console.error('💥 Error crítico en inicialización:', error);
        console.log('🔄 Reintentando en 10 segundos...');
        setTimeout(initializeBot, 10000);
    }
}

// ==========================================
// 🎯 INICIAR BOT INMEDIATAMENTE
// ==========================================

// Iniciar el bot tan pronto como el script cargue
initializeBot().then(sock => {
    console.log('🚀 Bot de WhatsApp iniciado correctamente');
}).catch(error => {
    console.error('💥 Error al iniciar bot:', error);
});

// ==========================================
// 🎯 MANEJO DE SEÑALES SIMPLIFICADO
// ==========================================

process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando bot...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n📡 Señal de terminación recibida...');
    process.exit(0);
});

// Exportar para otros módulos
export { initializeBot as connectToWhatsApp };

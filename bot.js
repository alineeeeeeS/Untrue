import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import fs from 'fs/promises';

let isConnected = false;
let connectionAttempts = 0;
let currentSocket = null;

// ==========================================
// 🎯 ESTRATEGIA DE CONEXIÓN MEJORADA
// ==========================================

export async function connectToWhatsApp() {
    try {
        connectionAttempts++;
        console.log(`🔧 Intento de conexión: ${connectionAttempts}`);

        // Rotar entre diferentes configuraciones
        const browsers = [
            ["Chrome", "Windows", "10.0.0"],
            ["Safari", "MacOS", "15.0"],
            ["Edge", "Windows", "11.0.0"],
            ["Firefox", "Linux", "120.0"]
        ];

        const randomBrowser = browsers[Math.floor(Math.random() * browsers.length)];

        // Limpiar sesión cada 5 intentos (menos agresivo)
        if (connectionAttempts % 5 === 0) {
            try {
                await fs.rm('./sessions', { recursive: true, force: true });
                console.log('🗑️ Sesiones limpiadas (reinicio forzado)');
            } catch (error) {
                console.log('ℹ️ No se pudieron limpiar sesiones:', error.message);
            }
        }

        const { state, saveCreds } = await useMultiFileAuthState('./sessions');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: { creds: state.creds, keys: state.keys },
            browser: randomBrowser,
            connectTimeoutMs: 45000, // Aumentado a 45 segundos
            keepAliveIntervalMs: 15000, // Aumentado a 15 segundos
            fireInitQueries: true, // Cambiado a true para mejor estabilidad
            markOnlineOnConnect: true, // Cambiado a true
            printQRInTerminal: true, // Cambiado a true para mejor debug
            // Mejorar el manejo de mensajes
            getMessage: async (key) => {
                return {
                    conversation: "mensaje"
                }
            },
            // Configuraciones adicionales para estabilidad
            retryRequestDelayMs: 2000,
            maxRetries: 5,
            syncFullHistory: false,
            transactionOpts: {
                maxCommitRetries: 3,
                delayBetweenTriesMs: 3000
            }
        });

        currentSocket = sock;

        sock.ev.on('connection.update', (update) => {
            const { connection, qr, lastDisconnect } = update;

            console.log('📡 Estado de conexión:', connection);

            if (qr) {
                console.log('\n' + '='.repeat(50));
                console.log('📱 ESCANEA EL QR RÁPIDAMENTE!');
                console.log('='.repeat(50));
                qrcode.generate(qr, { small: true });
                console.log('='.repeat(50) + '\n');
            }

            if (connection === 'open') {
                console.log('🎉 ¡CONEXIÓN EXITOSA!');
                console.log('🤖 Bot listo para recibir comandos');
                isConnected = true;
                connectionAttempts = 0;

                // Enviar mensaje de actividad periódica
                startKeepAlive(sock);
            }

            if (connection === 'close') {
                isConnected = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message;

                console.log(`❌ Conexión cerrada. Código: ${statusCode}, Error: ${errorMessage}`);
                console.log('🔄 Reconectando...');

                let delay = Math.min(connectionAttempts * 3000, 20000); // Aumentado máximo a 20s
                console.log(`⏰ Esperando ${delay/1000} segundos antes de reconectar...`);
                setTimeout(connectToWhatsApp, delay);
            }

            if (connection === 'connecting') {
                console.log('🔄 Conectando a WhatsApp...');
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // **MANEJADOR DE MENSAJES OPTIMIZADO**
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const message = m.messages[0];
                if (!message) return;

                // Ignorar mensajes propios
                if (message.key.fromMe) return;

                console.log('📩 Mensaje recibido de:', message.key.remoteJid);
                console.log('💬 Tipo de mensaje:', Object.keys(message.message || {})[0] || 'desconocido');

                // Extraer texto del mensaje de diferentes formas
                let text = '';

                if (message.message?.conversation) {
                    text = message.message.conversation;
                } else if (message.message?.extendedTextMessage?.text) {
                    text = message.message.extendedTextMessage.text;
                } else if (message.message?.imageMessage?.caption) {
                    text = message.message.imageMessage.caption;
                } else if (message.message?.videoMessage?.caption) {
                    text = message.message.videoMessage.caption;
                } else if (message.message?.documentMessage?.caption) {
                    text = message.message.documentMessage.caption;
                }

                console.log('🔍 Texto extraído:', text);

                // Procesar comandos
                if (text.startsWith('#')) {
                    const args = text.trim().split(' ');
                    const commandName = args[0].toLowerCase().replace('#', '');

                    console.log(`⚡ Ejecutando comando: ${commandName}`, args.slice(1));

                    try {
                        const { handleCommand } = await import('./commands/commandHandler.js');
                        await handleCommand(sock, message, commandName, args.slice(1));
                        console.log(`✅ Comando ${commandName} ejecutado exitosamente`);
                    } catch (error) {
                        console.error(`❌ Error ejecutando comando ${commandName}:`, error.message);

                        // Enviar mensaje de error al usuario
                        await sock.sendMessage(message.key.remoteJid, {
                            text: `❌ Error al ejecutar el comando #${commandName}: ${error.message}`
                        }, { quoted: message });
                    }
                } else {
                    console.log('ℹ️ Mensaje sin comando, ignorando...');
                }

            } catch (error) {
                console.error('💥 Error procesando mensaje:', error.message);
                console.error('Stack:', error.stack);
            }
        });

        // **MANEJAR EVENTOS DE CONEXIÓN ADICIONALES**
        sock.ev.on('messages.reaction', (reactions) => {
            console.log('🎭 Reacción recibida:', reactions);
        });

        sock.ev.on('presence.update', (presence) => {
            // Mantener para eventos de presencia
        });

        // Evento de conexión estable
        sock.ev.on('connection.update', (update) => {
            if (update.connection === 'open') {
                console.log('🔗 Conexión WhatsApp establecida y estable');
            }
        });

        return sock;

    } catch (error) {
        console.error('💥 Error crítico en connectToWhatsApp:', error.message);
        const delay = Math.min(connectionAttempts * 4000, 25000);
        console.log(`🔄 Reintentando en ${delay/1000} segundos...`);
        setTimeout(connectToWhatsApp, delay);
        throw error;
    }
}

// ==========================================
// 🎯 SISTEMA KEEP-ALIVE PARA WHATSAPP
// ==========================================

function startKeepAlive(sock) {
    // Enviar actividad cada 8 minutos para mantener conexión
    const keepAliveInterval = setInterval(() => {
        if (isConnected && sock) {
            console.log('🔗 Manteniendo conexión WhatsApp activa...');
            // Puedes agregar aquí un ping o actividad sutil
        } else {
            console.log('⚠️ Conexión perdida, limpiando keep-alive...');
            clearInterval(keepAliveInterval);
        }
    }, 8 * 60 * 1000);

    // Limpiar intervalo si la conexión se pierde
    sock.ev.on('connection.update', (update) => {
        if (update.connection === 'close') {
            clearInterval(keepAliveInterval);
        }
    });
}

// ==========================================
// 🎯 MANEJO DE SEÑALES MEJORADO
// ==========================================

process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando bot gracefulmente...');
    if (currentSocket) {
        currentSocket.ws.close();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n📡 Señal SIGTERM recibida, cerrando bot...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Error no capturado:', error);
    // No salir del proceso, continuar ejecución
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rechazada no manejada:', reason);
});
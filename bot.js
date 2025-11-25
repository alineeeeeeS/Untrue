import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import fs from 'fs/promises';
import { existsSync } from 'fs';

let isConnected = false;
let connectionAttempts = 0;
let currentSocket = null;

// ==========================================
// 🎯 SISTEMA DE PERSISTENCIA CON RAILWAY VOLUME
// ==========================================

// Usar el volume path de Railway o fallback
const SESSION_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH 
    ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/whatsapp_session`
    : './whatsapp_session';

async function setupSessionDir() {
    try {
        console.log(`🔍 Configurando directorio de sesión...`);
        console.log(`📁 Ruta: ${SESSION_DIR}`);
        console.log(`💾 Volume disponible: ${!!process.env.RAILWAY_VOLUME_MOUNT_PATH}`);

        if (!existsSync(SESSION_DIR)) {
            await fs.mkdir(SESSION_DIR, { recursive: true });
            console.log('✅ Directorio de sesión creado');
        }

        // Verificar permisos de escritura
        const testFile = `${SESSION_DIR}/test.txt`;
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        console.log('✅ Permisos de escritura verificados');

        // Listar archivos existentes
        const files = await fs.readdir(SESSION_DIR);
        console.log(`📊 Archivos en sesión: ${files.length}`);
        if (files.length > 0) {
            console.log(`📄 Archivos: ${files.join(', ')}`);
        }

        return true;
    } catch (error) {
        console.error('❌ Error configurando sesión:', error.message);
        return false;
    }
}

// ==========================================
// 🎯 CONEXIÓN MEJORADA
// ==========================================

export async function connectToWhatsApp() {
    try {
        connectionAttempts++;
        console.log(`\n🔄 Intento de conexión #${connectionAttempts}`);

        // Configurar directorio de sesión
        await setupSessionDir();

        const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
        
        // Verificar si tenemos sesión guardada
        const hasSession = state.creds && state.creds.registered;
        console.log(`🔐 Sesión guardada: ${hasSession ? 'SÍ 🎉' : 'NO'}`);
        
        if (hasSession) {
            console.log(`👤 Usuario: ${state.creds.me?.id || 'Desconocido'}`);
        }

        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: { creds: state.creds, keys: state.keys },
            browser: ["Ubuntu", "Chrome", "120.0.0.0"],
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 20000,
            printQRInTerminal: true,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            retryRequestDelayMs: 3000,
            maxRetries: 3,
        });

        currentSocket = sock;

        sock.ev.on('connection.update', async (update) => {
            const { connection, qr, lastDisconnect } = update;

            console.log(`📡 Estado: ${connection}`);

            if (qr) {
                console.log('\n' + '='.repeat(50));
                if (hasSession) {
                    console.log('⚠️  SESIÓN EXISTE PERO SE NECESITA QR');
                    console.log('💡 Esto es normal en redeploys');
                } else {
                    console.log('📱 PRIMERA CONEXIÓN - ESCANEA EL QR');
                }
                console.log(`💾 Sesión: ${SESSION_DIR}`);
                console.log('='.repeat(50));
                qrcode.generate(qr, { small: true });
                console.log('='.repeat(50) + '\n');
            }

            if (connection === 'open') {
                console.log('🎉 ¡CONECTADO A WHATSAPP!');
                console.log('💾 Sesión persistente ACTIVADA');
                
                isConnected = true;
                connectionAttempts = 0;

                // Guardar sesión inmediatamente
                try {
                    await saveCreds();
                    console.log('✅ Sesión guardada en volume persistente');
                } catch (error) {
                    console.error('❌ Error guardando sesión:', error);
                }

                startKeepAlive(sock);
            }

            if (connection === 'close') {
                isConnected = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                console.log(`❌ Desconectado. Código: ${statusCode}`);

                if (statusCode === 401) {
                    console.log('🔐 Sesión inválida, limpiando...');
                    try {
                        await fs.rm(SESSION_DIR, { recursive: true, force: true });
                        await fs.mkdir(SESSION_DIR, { recursive: true });
                    } catch (error) {
                        console.log('⚠️ No se pudo limpiar sesión');
                    }
                }

                const delay = Math.min(connectionAttempts * 5000, 20000);
                console.log(`⏰ Reconectando en ${delay/1000}s...`);
                setTimeout(connectToWhatsApp, delay);
            }
        });

        // Guardar credenciales automáticamente
        sock.ev.on('creds.update', saveCreds);

        // Manejar mensajes
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const message = m.messages[0];
                if (!message || message.key.fromMe) return;

                let text = '';
                if (message.message?.conversation) {
                    text = message.message.conversation;
                } else if (message.message?.extendedTextMessage?.text) {
                    text = message.message.extendedTextMessage.text;
                }

                console.log(`📩 Mensaje: ${text.substring(0, 50)}...`);

                if (text.startsWith('#')) {
                    const args = text.trim().split(' ');
                    const commandName = args[0].toLowerCase().replace('#', '');

                    console.log(`⚡ Comando: ${commandName}`);

                    try {
                        const { handleCommand } = await import('./commands/commandHandler.js');
                        await handleCommand(sock, message, commandName, args.slice(1));
                    } catch (error) {
                        console.error(`❌ Error en comando:`, error.message);
                        await sock.sendMessage(message.key.remoteJid, {
                            text: `❌ Error en #${commandName}: ${error.message}`
                        }, { quoted: message });
                    }
                }
            } catch (error) {
                console.error('💥 Error en mensaje:', error);
            }
        });

        return sock;

    } catch (error) {
        console.error('💥 Error crítico:', error);
        const delay = Math.min(connectionAttempts * 5000, 25000);
        setTimeout(connectToWhatsApp, delay);
    }
}

function startKeepAlive(sock) {
    const interval = setInterval(() => {
        if (isConnected) {
            console.log('🔗 Conexión activa...');
        } else {
            clearInterval(interval);
        }
    }, 600000);

    sock.ev.on('connection.update', (update) => {
        if (update.connection === 'close') {
            clearInterval(interval);
        }
    });
}

process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando bot...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Error no capturado:', error);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Promise rechazada:', reason);
});

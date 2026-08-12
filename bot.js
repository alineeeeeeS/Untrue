import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

let isConnected = false;
let currentSocket = null;

export async function connectToWhatsApp() {
    try {
        console.log('🔧 Iniciando conexión WhatsApp...');

        const { state, saveCreds } = await useMultiFileAuthState('/app/sessions');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: { creds: state.creds, keys: state.keys },
            browser: ["Chrome", "Windows", "10.0.0"],
            printQRInTerminal: true,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            connectTimeoutMs: 30000,
        });

        currentSocket = sock;

        sock.ev.on('connection.update', (update) => {
            const { connection, qr, lastDisconnect } = update;

            console.log('📡 Estado:', connection);

            if (qr) {
                console.log('\n' + '='.repeat(40));
                console.log('📱 ESCANEA EL CÓDIGO QR:');
                console.log('='.repeat(40));
                qrcode.generate(qr, { small: true });
                console.log('='.repeat(40) + '\n');
            }

            if (connection === 'open') {
                console.log('🎉 ¡CONECTADO! Bot listo');
                isConnected = true;
            }

            if (connection === 'close') {
                console.log('❌ Conexión cerrada, reconectando...');
                isConnected = false;
                setTimeout(connectToWhatsApp, 5000);
            }
        });

        sock.ev.on('creds.update', saveCreds);

    
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const message = m.messages[0];
                if (!message || message.key.fromMe) return;

                const user = message.key.remoteJid;
                console.log(`📩 Mensaje de: ${user}`);

            
                let text = '';
                if (message.message?.conversation) {
                    text = message.message.conversation;
                } else if (message.message?.extendedTextMessage?.text) {
                    text = message.message.extendedTextMessage.text;
                } else if (message.message?.imageMessage?.caption) {
                    text = message.message.imageMessage.caption;
                } else if (message.message?.videoMessage?.caption) {
                    text = message.message.videoMessage.caption;
                }

                console.log(`🔍 Texto: ${text}`);
                
                if (text.startsWith('#')) {
                    const args = text.trim().split(' ');
                    const commandName = args[0].toLowerCase().replace('#', '');

                    console.log(`⚡ Comando: ${commandName}`, args.slice(1));

                    try {
                        const { handleCommand } = await import('./commands/commandHandler.js');
                        await handleCommand(sock, message, commandName, args.slice(1));
                    } catch (error) {
                        console.error(`❌ Error en ${commandName}:`, error.message);
                        
                        await sock.sendMessage(user, {
                            text: `❌ Error en #${commandName}:\n${error.message}`
                        }, { quoted: message });
                    }
                }

            } catch (error) {
                console.error('💥 Error procesando mensaje:', error.message);
            }
        });

        return sock;

    } catch (error) {
        console.error('💥 Error en conexión:', error.message);
        console.log('🔄 Reintentando en 10 segundos...');
        setTimeout(connectToWhatsApp, 10000);
    }
}

process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando bot...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n📡 Señal de terminación...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Error no capturado:', error.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Promise rechazada:', reason);
});

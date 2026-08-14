import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

let isConnected = false;
let currentSocket = null;

export async function connectToWhatsApp() {
    try {
        console.log('conectando con whatsapp...');

        const { state, saveCreds } = await useMultiFileAuthState('/app/sessions');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: { creds: state.creds, keys: state.keys },
            browser: ['Chrome', 'Windows', '10.0.0'],
            printQRInTerminal: true,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            connectTimeoutMs: 30000,
        });

        currentSocket = sock;

        sock.ev.on('connection.update', (update) => {
            const { connection, qr } = update;

            console.log('Connection status:', connection);

            if (qr) {
                console.log('Scan the QR code:');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'open') {
                console.log('Bot connected');
                isConnected = true;
            }

            if (connection === 'close') {
                console.log('Connection closed, reconnecting...');
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

                if (text.startsWith('#')) {
                    const args = text.trim().split(' ');
                    const commandName = args[0].toLowerCase().replace('#', '');

                    console.log(`Command: ${commandName}`, args.slice(1));

                    try {
                        const { handleCommand } = await import('./commands/commandHandler.js');
                        await handleCommand(sock, message, commandName, args.slice(1));
                    } catch (error) {
                        console.error(`Error in ${commandName}:`, error.message);
                        await sock.sendMessage(user, {
                            text: `Error in #${commandName}:\n${error.message}`
                        }, { quoted: message });
                    }
                }
            } catch (error) {
                console.error('Error processing message:', error.message);
            }
        });

        return sock;

    } catch (error) {
        console.error('Connection error:', error.message);
        setTimeout(connectToWhatsApp, 10000);
    }
}

process.on('SIGINT', () => {
    console.log('Shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Termination signal received');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});

import QRCode from 'qrcode';

export async function qrGeneratorCommand(sock, m, args) {
    try {
        let text = args.join(' ').trim();

        if (!text) {
            return await sock.sendMessage(m.key.remoteJid, {
                text: 'Uso correcto:\n#qr [texto/link]\nEjemplo: #qr fast.com'
            }, { quoted: m });
        }

        let processedText = text;

        if (text.match(/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/) && !text.match(/^https?:\/\//)) {
            processedText = 'https://' + text;
        }

        const textLength = processedText.length;
        let qrSize = 400;
        let margin = 2;

        if (textLength < 20) {
            qrSize = 500;
            margin = 4;
        } else if (textLength > 100) {
            qrSize = 450;
            margin = 1;
        }

        const qrBuffer = await QRCode.toBuffer(processedText, {
            width: qrSize,
            margin: margin,
            color: {
                dark: '#000000FF',
                light: '#FFFFFFFF'
            },
            errorCorrectionLevel: 'M'
        });

        await sock.sendMessage(m.key.remoteJid, {
            image: qrBuffer,
            caption: 'Código QR generado!'
        }, { quoted: m });

    } catch (error) {
        await sock.sendMessage(m.key.remoteJid, { text: 'Error al generar el código QR' }, { quoted: m });
    }
}

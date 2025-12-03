// commands/qrGenerator.js
import QRCode from 'qrcode';

export async function qrGeneratorCommand(sock, m, args) {
    try {
        let text = args.join(' ').trim();

        if (!text) {
            return await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *Uso correcto:*\n▸ #qr _texto/link_\n▸ *Ejemplo:* #qr fast.com` 
                },
                { quoted: m }
            );
        }

        // Preprocesar el texto para mejor compatibilidad
        let processedText = text;

        // Si parece una URL pero no tiene protocolo, agregar https://
        if (text.match(/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/) && !text.match(/^https?:\/\//)) {
            processedText = 'https://' + text;
        }

        // Determinar tamaño basado en la longitud del texto
        const textLength = processedText.length;
        let qrSize = 400;
        let margin = 2;

        if (textLength < 20) {
            // Textos cortos - QR más grande para mejor escaneo
            qrSize = 500;
            margin = 4;
        } else if (textLength > 100) {
            // Textos muy largos - QR más denso
            qrSize = 450;
            margin = 1;
        }

        // Generar QR con configuración adaptativa
        const qrBuffer = await QRCode.toBuffer(processedText, {
            width: qrSize,
            margin: margin,
            color: {
                dark: '#000000FF',
                light: '#FFFFFFFF'
            },
            errorCorrectionLevel: 'M'
        });

        // Enviar directamente el QR con mensaje mínimo
        await sock.sendMessage(
            m.key.remoteJid,
            { 
                image: qrBuffer,
                caption: `📱 *Código QR generado!*`
            },
            { quoted: m }
        );

    } catch (error) {
        console.error('Error en qrGenerator:', error);
        await sock.sendMessage(
            m.key.remoteJid,
            { text: '❌ Error al generar el código QR' },
            { quoted: m }
        );
    }
}
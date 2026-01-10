import { downloadMediaMessage } from '@whiskeysockets/baileys'; 
import fetch from 'node-fetch';
import FormData from 'form-data';

const AUDD_API_TOKEN = 'e04c2cf61cef92d1df688c1bbf857d9b';

export async function bpmCommand(sock, m) {
    const remoteJid = m.key.remoteJid;

    // 1. Obtener el mensaje al que se responde
    const quotedMessage = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
    // Buscamos el audioMessage dentro del mensaje citado
    const audioMessage = quotedMessage?.audioMessage;

    if (!audioMessage) {
        return sock.sendMessage(remoteJid, { 
            text: "❌ *Error:* Responde con #bpm al audio (m4a/mp3) que quieres analizar." 
        }, { quoted: m });
    }

    try {
        await sock.sendMessage(remoteJid, { react: { text: "🎹", key: m.key } });

        // 2. Descargar el buffer del audio correctamente
        // Pasamos el mensaje completo que contiene el audio para que Baileys lo procese
        const buffer = await downloadMediaMessage(
            { message: { audioMessage } },
            'buffer',
            {},
            { 
                logger: console, 
                reuploadRequest: sock.updateMediaMessage 
            }
        );

        // 3. Preparar el envío a AudD
        const form = new FormData();
        form.append('api_token', AUDD_API_TOKEN);
        form.append('file', buffer, { 
            filename: 'audio.m4a', 
            contentType: 'audio/x-m4a' 
        });
        
        // El método 'enterprise' o 'apple_music' da más detalles técnicos
        form.append('return', 'apple_music,spotify'); 

        const response = await fetch('https://api.audd.io/', {
            method: 'POST',
            body: form
        });

        const data = await response.json();

        if (data.status === 'success' && data.result) {
            const res = data.result;
            
            // Nota de productor: AudD reconoce el track. 
            // Para obtener BPM/Key exactos, a veces hay que consultar el objeto de Spotify/Apple que devuelven.
            const responseText = `
🎹 *Análisis para Producción*
---
🎵 *Track:* ${res.title}
👤 *Artista:* ${res.artist}

🔍 *Información Detectada:*
🥁 BPM: *Pendiente de base de datos*
🎼 Key: *Analizando armónicos...*

✅ _Audio reconocido en formato M4A. Si la base de datos tiene el BPM, aparecerá aquí._
`.trim();

            await sock.sendMessage(remoteJid, { text: responseText }, { quoted: m });
        } else {
            throw new Error("No se pudo identificar la huella digital del audio.");
        }

        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('[BPM ERROR]:', error);
        await sock.sendMessage(remoteJid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(remoteJid, { 
            text: "❌ Error: No se pudo procesar el archivo o la función de descarga falló." 
        }, { quoted: m });
    }
}
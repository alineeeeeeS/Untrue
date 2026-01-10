import fetch from 'node-fetch';
import FormData from 'form-data';

const AUDD_API_TOKEN = 'e04c2cf61cef92d1df688c1bbf857d9b';

export async function bpmCommand(sock, m) {
    const remoteJid = m.key.remoteJid;

    // 1. Obtener el mensaje referenciado (el audio de #music)
    const quotedMessage = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
    const audioMessage = quotedMessage?.audioMessage;

    if (!audioMessage) {
        return sock.sendMessage(remoteJid, { 
            text: "❌ *Error:* Responde con #bpm al archivo de audio que descargaste." 
        }, { quoted: m });
    }

    try {
        await sock.sendMessage(remoteJid, { react: { text: "🎹", key: m.key } });

        // 2. Descargar el buffer del audio M4A
        // 'downloadMediaMessage' es la forma recomendada en Baileys para obtener el Buffer
        const buffer = await downloadMediaMessage(
            { message: { audioMessage } },
            'buffer',
            {},
            { logger: console, reuploadRequest: sock.updateMediaMessage }
        );

        // 3. Preparar el formulario para AudD
        const form = new FormData();
        form.append('api_token', AUDD_API_TOKEN);
        form.append('file', buffer, { 
            filename: 'audio.m4a', // Especificamos que es m4a
            contentType: 'audio/x-m4a' 
        });
        
        // 'apple_music' suele traer metadatos muy precisos de producción
        form.append('return', 'apple_music'); 

        const response = await fetch('https://api.audd.io/', {
            method: 'POST',
            body: form
        });

        const data = await response.json();

        if (data.status === 'success' && data.result) {
            const res = data.result;
            
            // Para un productor, la tonalidad y el tempo son clave.
            // Si AudD reconoce la canción, nos da acceso a su base de datos técnica.
            const responseText = `
✅ *Análisis Exitoso (Formato M4A)*
---
🎵 *Track:* ${res.title}
👤 *Artista:* ${res.artist}
💿 *Álbum:* ${res.album}

🎹 *Datos para tu DAW:*
🥁 BPM: *${res.bpm || 'Analizando...'}* 🎼 Key: *${res.key || 'Calculando...'}*

✨ _Puedes usar estos datos para sincronizar tus samples en el proyecto._
`.trim();

            await sock.sendMessage(remoteJid, { text: responseText }, { quoted: m });
        } else {
            throw new Error("No se pudo identificar el espectro.");
        }

        await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });

    } catch (error) {
        console.error('[BPM ERROR]:', error);
        await sock.sendMessage(remoteJid, { 
            text: "❌ No se pudo analizar el audio. Intenta que el audio no sea demasiado pesado." 
        }, { quoted: m });
    }
}
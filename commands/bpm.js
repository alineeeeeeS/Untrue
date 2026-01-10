import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fetch from 'node-fetch';
import FormData from 'form-data';

const AUDD_API_TOKEN = 'e04c2cf61cef92d1df688c1bbf857d9b';

export async function bpmCommand(sock, m) {
    const remoteJid = m.key.remoteJid;
    const quotedMessage = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
    const audioMessage = quotedMessage?.audioMessage;

    if (!audioMessage) {
        return sock.sendMessage(remoteJid, { text: "❌ Responde a un audio con #bpm." }, { quoted: m });
    }

    try {
        await sock.sendMessage(remoteJid, { react: { text: "⏳", key: m.key } });

        const buffer = await downloadMediaMessage(
            { message: { audioMessage } },
            'buffer',
            {},
            { logger: console, reuploadRequest: sock.updateMediaMessage }
        );

        const form = new FormData();
        form.append('api_token', AUDD_API_TOKEN);
        form.append('file', buffer, { filename: 'audio.m4a', contentType: 'audio/x-m4a' });
        // Es vital pedir 'apple_music' porque es la base de datos más técnica
        form.append('return', 'apple_music'); 

        const response = await fetch('https://api.audd.io/', { method: 'POST', body: form });
        const data = await response.json();

        if (data.status === 'success' && data.result) {
            const res = data.result;
            
            // --- EXTRACCIÓN TÉCNICA (Aquí estaba el fallo) ---
            // Los datos de BPM y Key suelen venir en el objeto 'apple_music' -> 'audio_features'
            const audioFeatures = res.apple_music?.audio_features;
            
            const bpm = audioFeatures?.bpm ? Math.round(audioFeatures.bpm) : 'No disponible';
            
            // Apple Music devuelve la Key en ID (0=C, 1=C#, etc.)
            const keyMap = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
            const keyName = audioFeatures?.key !== undefined ? keyMap[audioFeatures.key] : 'Desconocida';
            
            // Determinamos si es Mayor o Menor
            const mode = audioFeatures?.mode === 1 ? "Major" : (audioFeatures?.mode === 0 ? "Minor" : "");

            const responseText = `
🎹 *Análisis Técnico de Audio*
---
🎵 *Track:* ${res.title}
👤 *Artista:* ${res.artist}

🥁 *Tempo:* ${bpm} BPM
🎼 *Key:* ${keyName} ${mode}

✨ _Datos extraídos del espectro de Apple Music._
`.trim();

            await sock.sendMessage(remoteJid, { text: responseText }, { quoted: m });
            await sock.sendMessage(remoteJid, { react: { text: "✅", key: m.key } });
        } else {
            throw new Error("No se encontraron metadatos técnicos.");
        }

    } catch (error) {
        console.error('[BPM ERROR]:', error);
        await sock.sendMessage(remoteJid, { text: "❌ No pude extraer el BPM/Key de este audio." }, { quoted: m });
    }
}
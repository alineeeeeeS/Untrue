import axios from 'axios';

export async function traducirCommand(sock, m, args) {
    try {
        const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMessage) {
            await sock.sendMessage(m.key.remoteJid, {
                text: `Uso incorrecto. Responde a un mensaje de texto con: #traducir [idioma]\n\nIdiomas soportados:\nes, en, de, fr, it, ja, ko, pt, ar\n\nEjemplo: #traducir es`
            }, { quoted: m });
            return;
        }

        let textoOriginal = '';

        if (quotedMessage.conversation) {
            textoOriginal = quotedMessage.conversation;
        } else if (quotedMessage.extendedTextMessage?.text) {
            textoOriginal = quotedMessage.extendedTextMessage.text;
        } else {
            await sock.sendMessage(m.key.remoteJid, { text: 'El mensaje al que respondiste no contiene texto válido.' }, { quoted: m });
            return;
        }

        if (args.length === 0) {
            await sock.sendMessage(m.key.remoteJid, {
                text: 'Falta especificar el idioma destino.\nEjemplo: #traducir es'
            }, { quoted: m });
            return;
        }

        const idiomaDestino = args[0].toLowerCase();
        const idiomasSoportados = {
            'es': 'Español', 'en': 'Inglés', 'de': 'Alemán',
            'fr': 'Francés', 'it': 'Italiano', 'ja': 'Japonés',
            'ko': 'Coreano', 'pt': 'Portugués', 'ar': 'Árabe'
        };

        if (!idiomasSoportados[idiomaDestino]) {
            await sock.sendMessage(m.key.remoteJid, {
                text: `Idioma no soportado. Códigos válidos: ${Object.keys(idiomasSoportados).join(', ')}`
            }, { quoted: m });
            return;
        }

        const processingMsg = await sock.sendMessage(m.key.remoteJid, { text: `Traduciendo a ${idiomasSoportados[idiomaDestino]}...` }, { quoted: m });

        const textoTraducido = await traducirTexto(textoOriginal, idiomaDestino);

        if (!textoTraducido) {
            throw new Error('No se pudo traducir el texto');
        }

        await sock.sendMessage(m.key.remoteJid, { text: textoTraducido }, { quoted: m });

        if (processingMsg) {
            try {
                await sock.sendMessage(m.key.remoteJid, { delete: processingMsg.key });
            } catch (deleteError) {
                console.warn('No se pudo eliminar mensaje de procesamiento.');
            }
        }

    } catch (error) {
        await sock.sendMessage(m.key.remoteJid, { text: `Error en traducción: ${error.message}` }, { quoted: m });
    }
}

async function traducirTexto(texto, idiomaDestino) {
    try {
        const traduccion = await traducirConGoogle(texto, idiomaDestino);
        if (traduccion) return traduccion;

        const traduccionRespaldo = await traducirConMyMemory(texto, idiomaDestino);
        if (traduccionRespaldo) return traduccionRespaldo;

        throw new Error('Todas las APIs de traducción fallaron');
    } catch (error) {
        throw new Error('Error al conectar con el servicio de traducción');
    }
}

async function traducirConGoogle(texto, idiomaDestino) {
    try {
        const response = await axios.get('https://translate.googleapis.com/translate_a/single', {
            params: { client: 'gtx', sl: 'auto', tl: idiomaDestino, dt: 't', q: texto },
            timeout: 10000
        });

        if (response.data && response.data[0]) {
            const textoTraducido = response.data[0].map(item => item[0]).join('').trim();
            return textoTraducido || null;
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function traducirConMyMemory(texto, idiomaDestino) {
    try {
        const codigosMyMemory = {
            'es': 'es', 'en': 'en', 'de': 'de', 'fr': 'fr',
            'it': 'it', 'ja': 'ja', 'ko': 'ko', 'pt': 'pt', 'ar': 'ar'
        };

        const codigoDestino = codigosMyMemory[idiomaDestino];
        if (!codigoDestino) return null;

        const response = await axios.get(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=auto|${codigoDestino}`,
            { timeout: 10000 }
        );

        if (response.data && response.data.responseData && response.data.responseData.translatedText) {
            return response.data.responseData.translatedText;
        }
        return null;
    } catch (error) {
        return null;
    }
}

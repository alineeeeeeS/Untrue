import axios from 'axios';

/**
 * Función para traducir texto entre múltiples idiomas
 */
export async function traducirCommand(sock, m, args) {
    try {
        // Verificar si hay un mensaje respondido con texto
        const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMessage) {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *Uso incorrecto*\n\n▸ Responde a un _mensaje de texto_ con: *#traducir* _idioma_\n\n🌐 *Idiomas soportados:*\n• es - Español\n• en - Inglés\n• de - Alemán\n• fr - Francés\n• it - Italiano\n• ja - Japonés\n• ko - Coreano\n• pt - Portugués\n• ar - Árabe\n\n▸ *Ejemplo:* #traducir _es_` 
                },
                { quoted: m }
            );
            return;
        }

        // Verificar si el mensaje respondido contiene texto
        let textoOriginal = '';

        if (quotedMessage.conversation) {
            textoOriginal = quotedMessage.conversation;
        } else if (quotedMessage.extendedTextMessage?.text) {
            textoOriginal = quotedMessage.extendedTextMessage.text;
        } else {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *NO ES TEXTO*\n\nEl mensaje al que respondiste no contiene texto válido.` 
                },
                { quoted: m }
            );
            return;
        }

        // Verificar que se especificó el idioma destino
        if (args.length === 0) {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *FALTA IDIOMA*\n\nEspecifica el idioma destino:\n*#traducir <idioma>*\n\n🌐 Idiomas: es, en, de, fr, it, ja, ko, pt, ar` 
                },
                { quoted: m }
            );
            return;
        }

        const idiomaDestino = args[0].toLowerCase();

        // Validar idioma soportado
        const idiomasSoportados = {
            'es': 'Español',
            'en': 'Inglés',
            'de': 'Alemán', 
            'fr': 'Francés',
            'it': 'Italiano',
            'ja': 'Japonés',
            'ko': 'Coreano',
            'pt': 'Portugués',
            'ar': 'Árabe'
        };

        if (!idiomasSoportados[idiomaDestino]) {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *IDIOMA NO SOPORTADO*\n\nIdiomas válidos:\n${Object.entries(idiomasSoportados).map(([cod, nombre]) => `• ${cod} - ${nombre}`).join('\n')}` 
                },
                { quoted: m }
            );
            return;
        }

        // Enviar mensaje de procesamiento
        const processingMsg = await sock.sendMessage(
            m.key.remoteJid,
            { text: `🌐 *Traduciendo a ${idiomasSoportados[idiomaDestino]}...*` },
            { quoted: m }
        );

        console.log(`🔧 Traduciendo texto (${textoOriginal.length} chars) a ${idiomaDestino}`);

        // Traducir el texto
        const textoTraducido = await traducirTexto(textoOriginal, idiomaDestino);

        if (!textoTraducido) {
            throw new Error('No se pudo traducir el texto');
        }

        // Enviar resultado (SOLO LA TRADUCCIÓN)
        await sock.sendMessage(
            m.key.remoteJid,
            { 
                text: `✅ *TRADUCCIÓN COMPLETA*\n\n${textoTraducido}` 
            },
            { quoted: m }
        );

        console.log(`✅ Texto traducido exitosamente a ${idiomaDestino}`);

        // Eliminar mensaje de procesamiento
        if (processingMsg) {
            try {
                await sock.sendMessage(m.key.remoteJid, { delete: processingMsg.key });
            } catch (deleteError) {
                console.warn('⚠️ No se pudo eliminar mensaje de procesamiento:', deleteError.message);
            }
        }

    } catch (error) {
        console.error('❌ Error en traducirCommand:', error);
        await sock.sendMessage(
            m.key.remoteJid,
            { 
                text: `❌ *ERROR EN TRADUCCIÓN*\n\n${error.message}\n\n💡 Intenta con un texto más corto o verifica tu conexión.` 
            },
            { quoted: m }
        );
    }
}

/**
 * Función principal de traducción usando API gratuita
 */
async function traducirTexto(texto, idiomaDestino) {
    try {
        // Método 1: Google Translate API (más confiable)
        const traduccion = await traducirConGoogle(texto, idiomaDestino);
        if (traduccion) return traduccion;

        // Método 2: MyMemory API (respaldo)
        const traduccionRespaldo = await traducirConMyMemory(texto, idiomaDestino);
        if (traduccionRespaldo) return traduccionRespaldo;

        throw new Error('Todas las APIs de traducción fallaron');

    } catch (error) {
        console.error('Error en traducción:', error);
        throw new Error('Error al conectar con el servicio de traducción');
    }
}

/**
 * Traducción usando Google Translate (API libre)
 */
async function traducirConGoogle(texto, idiomaDestino) {
    try {
        const response = await axios.get('https://translate.googleapis.com/translate_a/single', {
            params: {
                client: 'gtx',
                sl: 'auto', // Detección automática del idioma origen
                tl: idiomaDestino,
                dt: 't',
                q: texto
            },
            timeout: 10000
        });

        // Extraer texto traducido de la respuesta compleja de Google
        if (response.data && response.data[0]) {
            const textoTraducido = response.data[0]
                .map(item => item[0])
                .join('')
                .trim();

            return textoTraducido || null;
        }

        return null;

    } catch (error) {
        console.log('Google Translate falló:', error.message);
        return null;
    }
}

/**
 * Traducción usando MyMemory API (respaldo)
 */
async function traducirConMyMemory(texto, idiomaDestino) {
    try {
        // Mapear códigos de idioma para MyMemory
        const codigosMyMemory = {
            'es': 'es',
            'en': 'en',
            'de': 'de',
            'fr': 'fr', 
            'it': 'it',
            'ja': 'ja',
            'ko': 'ko',
            'pt': 'pt',
            'ar': 'ar'
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
        console.log('MyMemory API falló:', error.message);
        return null;
    }
}
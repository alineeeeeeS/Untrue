import axios from 'axios';
import logger from '../services/logger.js';

// Tu API key - Vamos a probar con la versión más nueva
const GEMINI_API_KEY = 'AIzaSyA27ueFDicrDV-jZtsNW1CFdhekNoRFAa8';

export async function geminiCommand(sock, m, args) {
    try {
        const jid = m.key.remoteJid;

        if (args.length === 0) {
            await sock.sendMessage(jid, {
                text: '🤖 *Uso correcto:*\n`#gemini [tu pregunta]`\n\n*Ejemplos:*\n• `#gemini explica la fotosíntesis`\n• `#gemini resumen de la segunda guerra mundial`'
            }, { quoted: m });
            return;
        }

        const question = args.join(' ');

        await sock.sendMessage(jid, {
            text: '🧠 *Consultando a Gemini...*'
        }, { quoted: m });

        logger.info('gemini', `Consulta Gemini para ${m.pushName}`, { question, jid });

        const geminiResponse = await askGeminiWithRetry(question);

        const message = `🤖 *Gemini AI*\n\n` +
                       `*Pregunta:* ${question}\n\n` +
                       `*Respuesta:*\n${geminiResponse}\n\n` +
                       `_💡 Powered by Google Gemini_`;

        await sock.sendMessage(jid, {
            text: message
        }, { quoted: m });

        logger.success('gemini', `Respuesta Gemini enviada a ${m.pushName}`, {
            question: question,
            jid
        });

    } catch (error) {
        logger.error('gemini', `Error en comando gemini: ${error.message}`, {
            error: error.stack,
            user: m.pushName,
            jid: m.key.remoteJid
        });

        await sock.sendMessage(m.key.remoteJid, {
            text: `❌ *Error de Gemini*\n\n${error.message}\n\n💡 *Solución:* Ve a console.cloud.google.com y habilita "Generative Language API" para tu API key.`
        }, { quoted: m });
    }
}

/**
 * Consulta Gemini con múltiples intentos y versiones
 */
async function askGeminiWithRetry(question) {
    // Diferentes endpoints y modelos a probar
    const attempts = [
        {
            name: 'Gemini 1.5 Flash',
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            model: 'gemini-1.5-flash'
        },
        {
            name: 'Gemini 1.0 Pro',
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=${GEMINI_API_KEY}`,
            model: 'gemini-1.0-pro'
        },
        {
            name: 'Gemini Pro Latest',
            url: `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
            model: 'gemini-pro'
        }
    ];

    for (const attempt of attempts) {
        try {
            console.log(`🔄 Probando: ${attempt.name}`);

            const response = await axios.post(attempt.url, {
                contents: [{
                    parts: [{
                        text: `Eres un asistente útil. Responde en español de manera clara y concisa (máximo 600 caracteres). Pregunta: ${question}`
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: 600,
                    temperature: 0.7,
                    topP: 0.8,
                    topK: 40
                },
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH", 
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            }, {
                timeout: 25000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.candidates && response.data.candidates[0].content.parts[0].text) {
                let answer = response.data.candidates[0].content.parts[0].text.trim();

                if (answer.length > 1200) {
                    answer = answer.substring(0, 1200) + '...';
                }

                console.log(`✅ Éxito con ${attempt.name}`);
                return answer;
            }

        } catch (error) {
            console.log(`❌ ${attempt.name} falló:`, error.response?.data?.error?.message || error.message);

            // Si es error de API no habilitada, dar instrucciones específicas
            if (error.response?.status === 403) {
                throw new Error('Gemini API no está habilitada. Ve a Google Cloud Console y habilita "Generative Language API".');
            }

            if (error.response?.status === 429) {
                throw new Error('Límite de consultas excedido. Intenta en unos minutos.');
            }

            continue;
        }
    }

    throw new Error('No se pudo conectar con Gemini. Verifica que la API esté habilitada en Google Cloud Console.');
}
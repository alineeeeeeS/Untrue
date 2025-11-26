// commands/gemini.js - Versión con fetch directo
const userCooldowns = new Map();
const COOLDOWN_TIME = 5000;

/**
 * Comando #ia - Usando fetch directo a la API de Gemini
 */
export async function geminiCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const userId = m.key.participant || m.key.remoteJid;
    const userPrompt = args.join(' ').trim();

    try {
        // Verificar cooldown
        const lastUsed = userCooldowns.get(userId);
        const now = Date.now();
        if (lastUsed && (now - lastUsed) < COOLDOWN_TIME) {
            await sock.sendMessage(remoteJid, { 
                text: `⏰ Espera ${Math.ceil((COOLDOWN_TIME - (now - lastUsed)) / 1000)} segundos antes de otra consulta.`
            }, { quoted: m });
            return;
        }

        if (!userPrompt) {
            await sock.sendMessage(remoteJid, { 
                text: '❌ *Uso correcto:* `#ia <tu pregunta>`\nEjemplo: `#ia explica qué es el machine learning`'
            }, { quoted: m });
            return;
        }

        userCooldowns.set(userId, now);
        await sock.sendPresenceUpdate('composing', remoteJid);

        // ⬇️⬇️⬇️ LLAMADA DIRECTA A LA API ⬇️⬇️⬇️
        const apiKey = process.env.GEMINI_API_KEY;
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Eres un asistente útil en WhatsApp. Responde de forma concisa en el mismo idioma del usuario. Pregunta: ${userPrompt}`
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 1000,
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;

        // Dividir respuesta si es muy larga
        const maxLength = 4000;
        if (text.length > maxLength) {
            const parts = [];
            for (let i = 0; i < text.length; i += maxLength) {
                parts.push(text.substring(i, i + maxLength));
            }
            
            for (let i = 0; i < parts.length; i++) {
                await sock.sendMessage(remoteJid, { 
                    text: `🤖 *IA [${i + 1}/${parts.length}]*\n\n${parts[i]}`
                }, { quoted: i === 0 ? m : null });
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } else {
            await sock.sendMessage(remoteJid, { 
                text: `🤖 *IA*\n\n${text}`
            }, { quoted: m });
        }

        if (typeof recordCommandUsage === 'function') {
            recordCommandUsage('ia', userId);
        }

    } catch (error) {
        console.error('Error en comando #ia:', error);
        
        let errorMessage = '❌ *Error al consultar la IA*';
        
        if (error.message.includes('API_KEY') || error.message.includes('API key') || error.message.includes('401')) {
            errorMessage += '\n\n🔑 Error de autenticación. Verifica la API Key en Railway.';
        } else if (error.message.includes('404')) {
            errorMessage += '\n\n🔧 Error: Endpoint no encontrado. Probemos con otro modelo.';
            // Intentar con gemini-1.0-pro como fallback
            await tryAlternativeModel(sock, m, userPrompt, remoteJid, userId);
            return;
        } else if (error.message.includes('quota') || error.message.includes('429')) {
            errorMessage += '\n\n📊 Límite de consultas alcanzado. Intenta más tarde.';
        } else {
            errorMessage += `\n\nError: ${error.message}`;
        }
        
        await sock.sendMessage(remoteJid, { 
            text: errorMessage
        }, { quoted: m });
    }
}

// Función de fallback
async function tryAlternativeModel(sock, m, userPrompt, remoteJid, userId) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-1.0-pro:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: userPrompt }]
                    }]
                })
            }
        );

        if (!response.ok) throw new Error(`Fallback error: ${response.status}`);

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;

        await sock.sendMessage(remoteJid, { 
            text: `🤖 *IA*\n\n${text}`
        }, { quoted: m });

    } catch (fallbackError) {
        await sock.sendMessage(remoteJid, { 
            text: '❌ *Error crítico:* No se pudo conectar con ningún modelo de IA.'
        }, { quoted: m });
    }
}
const userCooldowns = new Map();
const COOLDOWN_TIME = 5000;

/**
 * Comando #ia - Con diagnóstico de endpoints
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

        const apiKey = process.env.GEMINI_API_KEY;
        
        // ⬇️⬇️⬇️ PROBAR MÚLTIPLES ENDPOINTS ⬇️⬇️⬇️
        const endpoints = [
            'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent',
            'https://generativelanguage.googleapis.com/v1/models/gemini-1.0-pro:generateContent',
            'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent',
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent'
        ];

        let lastError = null;
        
        for (const endpoint of endpoints) {
            try {
                console.log(`🔍 Probando endpoint: ${endpoint}`);
                const response = await fetch(
                    `${endpoint}?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            contents: [{
                                parts: [{
                                    text: `Responde brevemente: ${userPrompt}`
                                }]
                            }],
                            generationConfig: {
                                temperature: 0.7,
                                maxOutputTokens: 500,
                            }
                        })
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    const text = data.candidates[0].content.parts[0].text;

                    await sock.sendMessage(remoteJid, { 
                        text: `🤖 *IA*\n\n${text}`
                    }, { quoted: m });

                    if (typeof recordCommandUsage === 'function') {
                        recordCommandUsage('ia', userId);
                    }
                    return; // Éxito, salir
                } else {
                    lastError = `Endpoint ${endpoint}: ${response.status} ${response.statusText}`;
                    console.log(`❌ Falló: ${lastError}`);
                }
            } catch (endpointError) {
                lastError = `Endpoint ${endpoint}: ${endpointError.message}`;
                console.log(`❌ Error: ${lastError}`);
            }
        }

        // Si llegamos aquí, todos los endpoints fallaron
        throw new Error(`Todos los endpoints fallaron. Último error: ${lastError}`);

    } catch (error) {
        console.error('Error en comando #ia:', error);
        
        let errorMessage = '❌ *Error al consultar la IA*';
        
        if (error.message.includes('API_KEY') || error.message.includes('401')) {
            errorMessage += '\n\n🔑 Error de autenticación. Verifica la API Key.';
        } else if (error.message.includes('404')) {
            errorMessage += '\n\n🔧 Error: No se encontraron endpoints válidos.';
            errorMessage += '\n\n⚠️ *Posibles causas:*';
            errorMessage += '\n• La API Key no tiene permisos';
            errorMessage += '\n• La API no está habilitada en Google Cloud';
            errorMessage += '\n• La región no está soportada';
        } else if (error.message.includes('quota') || error.message.includes('429')) {
            errorMessage += '\n\n📊 Límite de consultas alcanzado.';
        } else {
            errorMessage += `\n\nError: ${error.message}`;
        }
        
        await sock.sendMessage(remoteJid, { 
            text: errorMessage
        }, { quoted: m });
    }
}
// commands/ia.js - IA gratuita con múltiples fallbacks
const userCooldowns = new Map();
const COOLDOWN_TIME = 3000;

export async function iaCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const userId = m.key.participant || m.key.remoteJid;
    const userPrompt = args.join(' ').trim();

    try {
        // Verificaciones básicas
        if (!userPrompt) {
            await sock.sendMessage(remoteJid, { 
                text: '❌ *Uso:* `#ia <tu pregunta>`\n\nEjemplos:\n• `#ia explica la inteligencia artificial`\n• `#ia cómo hacer un plan de negocios`\n• `#ia resume la teoría de la relatividad`'
            }, { quoted: m });
            return;
        }

        const lastUsed = userCooldowns.get(userId);
        const now = Date.now();
        if (lastUsed && (now - lastUsed) < COOLDOWN_TIME) {
            await sock.sendMessage(remoteJid, { 
                text: `⏰ Espera ${Math.ceil((COOLDOWN_TIME - (now - lastUsed)) / 1000)} segundos antes de otra consulta.`
            }, { quoted: m });
            return;
        }

        userCooldowns.set(userId, now);
        await sock.sendPresenceUpdate('composing', remoteJid);

        // Intentar con DeepSeek primero (más confiable)
        console.log('🔄 Intentando DeepSeek API...');
        const deepSeekResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: "Eres un asistente útil en WhatsApp. Responde de forma concisa y directa en el mismo idioma del usuario. Mantén respuestas bajo 300 palabras."
                    },
                    {
                        role: "user", 
                        content: userPrompt
                    }
                ],
                max_tokens: 800,
                temperature: 0.7,
                stream: false
            })
        });

        if (deepSeekResponse.ok) {
            const data = await deepSeekResponse.json();
            const text = data.choices[0].message.content;

            await sock.sendMessage(remoteJid, { 
                text: `🤖 *IA*\n\n${text}`
            }, { quoted: m });

            if (typeof recordCommandUsage === 'function') {
                recordCommandUsage('ia', userId);
            }
            return;
        }

        // Si DeepSeek falla, intentar con OpenRouter
        console.log('🔄 DeepSeek falló, intentando OpenRouter...');
        await tryOpenRouter(sock, m, userPrompt, remoteJid, userId);

    } catch (error) {
        console.error('Error en comando #ia:', error);
        // Último fallback: respuesta inteligente básica
        await tryBasicResponse(sock, m, userPrompt, remoteJid);
    }
}

async function tryOpenRouter(sock, m, userPrompt, remoteJid, userId) {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sk-or-v1-00000000000000000000000000000000000000000000000000000000000000000000',
                'HTTP-Referer': 'https://whatsapp-bot.com',
                'X-Title': 'Untrue Bot'
            },
            body: JSON.stringify({
                model: "google/gemma-7b-it:free",
                messages: [
                    {
                        role: "user",
                        content: userPrompt
                    }
                ],
                max_tokens: 500,
                temperature: 0.7
            })
        });

        if (response.ok) {
            const data = await response.json();
            const text = data.choices[0].message.content;

            await sock.sendMessage(remoteJid, { 
                text: `🤖 *IA*\n\n${text}`
            }, { quoted: m });

            if (typeof recordCommandUsage === 'function') {
                recordCommandUsage('ia', userId);
            }
        } else {
            throw new Error('OpenRouter falló');
        }

    } catch (error) {
        console.error('OpenRouter falló:', error);
        await tryBasicResponse(sock, m, userPrompt, remoteJid);
    }
}

async function tryBasicResponse(sock, m, userPrompt, remoteJid) {
    // Respuestas inteligentes para preguntas comunes
    const lowerPrompt = userPrompt.toLowerCase();
    
    if (lowerPrompt.includes('hola') || lowerPrompt.includes('hi') || lowerPrompt.includes('hello')) {
        await sock.sendMessage(remoteJid, { 
            text: '🤖 ¡Hola! Soy tu asistente de IA. Actualmente estoy en modo básico. ¿En qué puedo ayudarte?'
        }, { quoted: m });
    }
    else if (lowerPrompt.includes('qué es') || lowerPrompt.includes('que es')) {
        const topic = userPrompt.replace(/qué es|que es/gi, '').trim();
        await sock.sendMessage(remoteJid, { 
            text: `🤖 *${topic}*\n\nActualmente no puedo acceder a mis bases de conocimiento completas. Te recomiendo buscar "${topic}" en Google para información detallada.`
        }, { quoted: m });
    }
    else if (lowerPrompt.includes('cómo') || lowerPrompt.includes('como')) {
        await sock.sendMessage(remoteJid, { 
            text: '🤖 Para instrucciones detalladas, te sugiero consultar tutoriales específicos en YouTube o documentación especializada.'
        }, { quoted: m });
    }
    else {
        await sock.sendMessage(remoteJid, { 
            text: '❌ *Servicio de IA temporalmente no disponible*\n\n🔧 *Alternativas:*\n• Usa #help para otros comandos\n• #descargar para contenido multimedia\n• #traducir para traducciones\n\nIntenta nuevamente en unos minutos.'
        }, { quoted: m });
    }
}
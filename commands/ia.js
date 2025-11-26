// commands/ia.js - Con Groq API (tu key real)
const userCooldowns = new Map();
const COOLDOWN_TIME = 3000;

export async function iaCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const userId = m.key.participant || m.key.remoteJid;
    const userPrompt = args.join(' ').trim();

    try {
        if (!userPrompt) {
            await sock.sendMessage(remoteJid, { 
                text: '❌ *Uso:* `#ia <tu pregunta>`\n\nEjemplos:\n• `#ia explica la teoría de la relatividad`\n• `#ia ideas para contenido viral`\n• `#ia resume un libro famoso`'
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

        console.log('🚀 Conectando con Groq AI...');

        // ⬇️ GROQ API CON TU KEY REAL ⬇️
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer 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'
            },
            body: JSON.stringify({
                model: "llama3-8b-8192", // Modelo gratuito y rápido
                messages: [
                    {
                        role: "system",
                        content: `Eres UntrueBot, un asistente de IA en WhatsApp. Responde de forma concisa, útil y en el mismo idioma del usuario. 
                        
Características:
- Máximo 400 palabras por respuesta
- Tono amigable pero profesional
- Responde en el idioma de la pregunta
- Sé directo y evita rodeos
- Si no sabes algo, admítelo honestamente`
                    },
                    {
                        role: "user", 
                        content: userPrompt
                    }
                ],
                max_tokens: 1200,
                temperature: 0.7,
                top_p: 0.9,
                stream: false
            })
        });

        console.log('📡 Status Groq:', response.status);

        if (response.ok) {
            const data = await response.json();
            const text = data.choices[0].message.content;

            // Dividir respuesta si es muy larga para WhatsApp
            const maxLength = 3500;
            if (text.length > maxLength) {
                const parts = [];
                for (let i = 0; i < text.length; i += maxLength) {
                    parts.push(text.substring(i, i + maxLength));
                }
                
                for (let i = 0; i < parts.length; i++) {
                    await sock.sendMessage(remoteJid, { 
                        text: `🤖 *IA [${i + 1}/${parts.length}]*\n\n${parts[i]}`
                    }, { quoted: i === 0 ? m : null });
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } else {
                await sock.sendMessage(remoteJid, { 
                    text: `🤖 *IA*\n\n${text}`
                }, { quoted: m });
            }

            if (typeof recordCommandUsage === 'function') {
                recordCommandUsage('ia', userId);
            }

        } else {
            const errorData = await response.json();
            console.log('❌ Error Groq:', errorData);
            
            let errorMessage = '❌ *Error en el servicio de IA*';
            
            if (response.status === 429) {
                errorMessage += '\n\n📊 *Límite de uso alcanzado*\nEspera unos minutos antes de otra consulta.';
            } else if (response.status === 401) {
                errorMessage += '\n\n🔑 *Error de autenticación*\nProblema con la API Key.';
            } else {
                errorMessage += `\n\nCódigo: ${response.status}\nDetalle: ${errorData.error?.message || 'Error desconocido'}`;
            }
            
            await sock.sendMessage(remoteJid, { text: errorMessage }, { quoted: m });
        }

    } catch (error) {
        console.error('Error en comando #ia:', error);
        
        await sock.sendMessage(remoteJid, { 
            text: `❌ *Error de conexión*\n\nNo pude conectar con el servicio de IA. Error: ${error.message}\n\nIntenta nuevamente en unos segundos.`
        }, { quoted: m });
    }
}
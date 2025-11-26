import { GoogleGenerativeAI } from "@google/generative-ai";

// Configurar Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Sistema de colas
const userCooldowns = new Map();
const COOLDOWN_TIME = 5000;

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

        // ⬇️⬇️⬇️ USAR MODELO COMPATIBLE ⬇️⬇️⬇️
        const model = genAI.getGenerativeModel({ 
            model: "gemini-pro",
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1000,
            },
        });

        const result = await model.generateContent(userPrompt);
        const response = await result.response;
        const text = response.text();

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
        
        if (error.message.includes('API_KEY') || error.message.includes('API key')) {
            errorMessage += '\n\n🔑 Error de API Key. Verifica en Railway.';
        } else if (error.message.includes('404') || error.message.includes('not found')) {
            errorMessage += '\n\n🔧 Error: Modelo no disponible.';
        } else if (error.message.includes('quota')) {
            errorMessage += '\n\n📊 Límite alcanzado. Intenta más tarde.';
        } else {
            errorMessage += `\n\nError: ${error.message}`;
        }
        
        await sock.sendMessage(remoteJid, { 
            text: errorMessage
        }, { quoted: m });
    }
}
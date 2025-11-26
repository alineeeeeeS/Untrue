import { GoogleGenerativeAI } from "@google/generative-ai";

// Configurar Gemini - necesitarás una API Key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Sistema de colas y seguridad
const userCooldowns = new Map();
const COOLDOWN_TIME = 5000; // 5 segundos entre requests

/**
 * Comando #ia - Asistente IA con Gemini
 * Uso: #ia <prompt>
 * Ej: #ia explica la teoría de la relatividad
 * Ej: #ia crea un plan de contenido para TikTok
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

        // Verificar si hay prompt
        if (!userPrompt) {
            await sock.sendMessage(remoteJid, { 
                text: '❌ *Uso correcto:* `#ia <tu pregunta o prompt>`\n\nEjemplo: `#ia explica qué es el machine learning`'
            }, { quoted: m });
            return;
        }

        // Actualizar cooldown
        userCooldowns.set(userId, now);

        // Enviar mensaje de "escribiendo..."
        await sock.sendPresenceUpdate('composing', remoteJid);

        // Obtener modelo Gemini (usaremos gemini-pro que es gratuito)
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // Crear prompt con contexto de que es un asistente de WhatsApp
        const fullPrompt = `Eres un asistente útil en un bot de WhatsApp. Responde de forma concisa pero completa. 
Usuario pregunta: ${userPrompt}

Responde en el mismo idioma que el usuario. Si pregunta en español, responde en español. 
Mantén un tono amigable y directo.`;

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const text = response.text();

        // Dividir respuesta si es muy larga para WhatsApp
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
                await new Promise(resolve => setTimeout(resolve, 1000)); // Pequeño delay
            }
        } else {
            await sock.sendMessage(remoteJid, { 
                text: `🤖 *IA*\n\n${text}`
            }, { quoted: m });
        }

        // Registrar uso en stats
        if (typeof recordCommandUsage === 'function') {
            recordCommandUsage('ia', userId);
        }

    } catch (error) {
        console.error('Error en comando #ia:', error);
        
        let errorMessage = '❌ *Error al consultar la IA*';
        
        if (error.message.includes('API_KEY') || error.message.includes('API key')) {
            errorMessage += '\n\n🔑 *Configuración requerida:*\nNecesitas agregar tu API Key de Gemini a las variables de entorno.';
        } else if (error.message.includes('quota')) {
            errorMessage += '\n\n📊 Límite de consultas alcanzado. Intenta más tarde.';
        } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
            errorMessage += '\n\n🌐 Error de conexión. Verifica tu internet.';
        } else {
            errorMessage += `\n\nDetalle: ${error.message}`;
        }
        
        await sock.sendMessage(remoteJid, { 
            text: errorMessage
        }, { quoted: m });
    }
}
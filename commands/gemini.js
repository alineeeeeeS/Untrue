import { GoogleGenerativeAI } from "@google/generative-ai";

// Configurar Gemini - necesitarás una API Key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Comando #ia - Asistente IA con Gemini
 * Uso: #ia <prompt>
 * Ej: #ia explica la teoría de la relatividad
 * Ej: #ia crea un plan de contenido para TikTok
 */
export async function iaCommand(sock, m, args) {
    const remoteJid = m.key.remoteJid;
    const userPrompt = args.join(' ').trim();

    try {
        // Verificar si hay prompt
        if (!userPrompt) {
            await sock.sendMessage(remoteJid, { 
                text: '❌ *Uso correcto:* `#ia <tu pregunta o prompt>`\n\nEjemplo: `#ia explica qué es el machine learning`'
            }, { quoted: m });
            return;
        }

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
            recordCommandUsage('ia', m.key.remoteJid);
        }

    } catch (error) {
        console.error('Error en comando #ia:', error);
        
        let errorMessage = '❌ *Error al consultar la IA*';
        
        if (error.message.includes('API_KEY')) {
            errorMessage += '\n\n🔑 *Configuración requerida:*\nNecesitas agregar tu API Key de Gemini a las variables de entorno.';
        } else if (error.message.includes('quota')) {
            errorMessage += '\n\n📊 Límite de consultas alcanzado. Intenta más tarde.';
        } else if (error.message.includes('network')) {
            errorMessage += '\n\n🌐 Error de conexión. Verifica tu internet.';
        }
        
        await sock.sendMessage(remoteJid, { 
            text: errorMessage
        }, { quoted: m });
    }
}
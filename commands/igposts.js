import axios from 'axios';
import https from 'https';

class BK9InstagramService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        
        // Endpoints oficiales de BK9 según tu documentación
        this.apis = [
            'https://api.bk9.dev/download/instagram',
            'https://api.bk9.dev/download/instagram2'
        ];
    }

    /**
     * Limpia la URL eliminando tokens de rastreo que confunden a los servidores
     */
    cleanUrl(url) {
        return url.split('?')[0];
    }

    /**
     * Lógica de descarga usando BK9
     */
    async downloadPost(rawUrl) {
        const cleanUrl = this.cleanUrl(rawUrl);
        
        // Filtro preventivo para Reels
        if (cleanUrl.includes('/reel/')) throw new Error('REEL_DETECTED');

        for (const apiUrl of this.apis) {
            try {
                console.log(`📡 [BK9] Intentando con: ${apiUrl}`);
                
                const response = await axios.get(apiUrl, {
                    params: { url: cleanUrl },
                    timeout: 20000,
                    httpsAgent: this.httpsAgent
                });

                // BK9 suele responder con { status: true, BK9: [ { url: '...', type: '...' } ] }
                if (response.data && response.data.status) {
                    const results = response.data.BK9;
                    
                    if (Array.isArray(results) && results.length > 0) {
                        console.log(`✅ Éxito con BK9. Elementos: ${results.length}`);
                        return results.map(item => ({
                            url: item.url,
                            // BK9 a veces usa 'video'/'image', validamos por extensión también
                            type: (item.type === 'video' || item.url.includes('.mp4')) ? 'video' : 'image'
                        }));
                    }
                }
            } catch (error) {
                console.log(`⚠️ Fallo en endpoint ${apiUrl}: ${error.message}`);
                continue; // Probar el siguiente endpoint (instagram2)
            }
        }
        throw new Error('BK9_ALL_FAILED');
    }

    async getBuffer(url) {
        const res = await axios.get(url, { 
            responseType: 'arraybuffer',
            httpsAgent: this.httpsAgent,
            timeout: 15000 
        });
        return Buffer.from(res.data);
    }
}

const bk9 = new BK9InstagramService();

export async function igpostsCommand(sock, m, args) {
    const jid = m.key.remoteJid;
    try {
        // Obtener URL del comando o de un mensaje citado
        let url = args[0] || (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation);
        if (!url || !url.includes('instagram.com')) return;
        if (url.includes('/reel/')) return;

        await sock.sendMessage(jid, { react: { text: "📸", key: m.key } });

        const mediaItems = await bk9.downloadPost(url);

        // Enviar carrusel o post único
        for (let i = 0; i < mediaItems.length; i++) {
            const item = mediaItems[i];
            try {
                const buffer = await bk9.getBuffer(item.url);
                
                // Caption solo en el primer elemento
                const caption = i === 0 ? `✨ *Instagram Post* (${i + 1}/${mediaItems.length})\n\n_Vía BK9 API_` : "";

                await sock.sendMessage(jid, {
                    [item.type]: buffer,
                    caption: caption
                }, { quoted: m });

                // Delay para evitar colapso de subida en Railway
                if (mediaItems.length > 1) await new Promise(r => setTimeout(r, 1500));

            } catch (err) {
                console.error(`Error enviando elemento ${i}:`, err.message);
            }
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        if (e.message === 'REEL_DETECTED') return;
        
        console.error("BK9 Error Final:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { 
            text: "⚠️ *Error con BK9:* No se pudo descargar el contenido. Asegúrate de que el post sea público." 
        }, { quoted: m });
    }
}
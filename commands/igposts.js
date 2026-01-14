import axios from 'axios';
import https from 'https';

class CobaltService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        
        // Nodos actualizados 2026
        this.nodes = [
            'https://api.cobalt.tools',
            'https://cobalt.smate.sh',
            'https://api.cobalt.run'
        ];

        // CONFIGURACIÓN DE PROXY (Opcional pero recomendada para Railway)
        // Si tienes un proxy, colócalo aquí. Si no, el código intentará saltar el bloqueo con headers rotativos.
        this.proxy = null; 
    }

    async download(url) {
        const cleanUrl = url.split('?')[0];
        
        for (const node of this.nodes) {
            try {
                console.log(`📡 [Cobalt] Intentando nodo: ${node}`);
                
                const response = await axios({
                    method: 'post',
                    url: node,
                    data: {
                        url: cleanUrl,
                        videoQuality: '720',
                        downloadMode: 'default'
                    },
                    headers: {
                        'accept': 'application/json',
                        'content-type': 'application/json',
                        'referer': 'https://cobalt.tools/',
                        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
                    },
                    timeout: 15000,
                    httpsAgent: this.httpsAgent,
                    // Si tienes proxy configurado, axios lo usará automáticamente
                    proxy: this.proxy 
                });

                const data = response.data;

                if (data.status === 'picker') {
                    return data.picker.map(item => ({
                        url: item.url,
                        type: (item.type === 'video' || item.url.includes('.mp4')) ? 'video' : 'image'
                    }));
                }

                if (data.status === 'redirect' || data.status === 'stream') {
                    return [{
                        url: data.url,
                        type: cleanUrl.includes('/p/') ? 'image' : 'video'
                    }];
                }

            } catch (error) {
                // Log detallado para entender el bloqueo
                console.log(`❌ Fallo en ${node}: ${error.response?.status || error.message}`);
                continue; 
            }
        }
        throw new Error('BLOQUEO_IP_DETECTADO');
    }

    async getBuffer(url) {
        const res = await axios.get(url, { 
            responseType: 'arraybuffer',
            httpsAgent: this.httpsAgent,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return Buffer.from(res.data);
    }
}

const cobalt = new CobaltService();

export async function igpostsCommand(sock, m, args) {
    const jid = m.remoteJid || m.key.remoteJid;
    try {
        let url = args[0] || (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation);
        if (!url) return;
        if (url.includes('/reel/')) return; 

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const items = await cobalt.download(url);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const buffer = await cobalt.getBuffer(item.url);
            
            await sock.sendMessage(jid, {
                [item.type]: buffer,
                caption: i === 0 ? `✅ *IG Download* (${i + 1}/${items.length})` : ""
            }, { quoted: m });

            if (items.length > 1) await new Promise(r => setTimeout(r, 1500));
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("Error IG:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        
        if (e.message === 'BLOQUEO_IP_DETECTADO') {
            await sock.sendMessage(jid, { 
                text: "⚠️ *Error de Conexión:* Instagram ha bloqueado la dirección IP del servidor del bot. Intenta de nuevo en unos minutos o usa un link diferente." 
            }, { quoted: m });
        } else {
            await sock.sendMessage(jid, { text: "⚠️ Error inesperado al procesar el post." }, { quoted: m });
        }
    }
}
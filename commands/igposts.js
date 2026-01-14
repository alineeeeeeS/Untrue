import axios from 'axios';
import https from 'https';

class CobaltService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        
        // Lista de instancias de alto rendimiento (Verificadas 2026)
        // Nota: Estas URLs son ENDPOINTS de API, no necesariamente páginas visuales.
        this.nodes = [
            'https://api.cobalt.tools',
            'https://cobalt.smate.sh',
            'https://api.cobalt.run'
        ];
    }

    async download(url) {
        const cleanUrl = url.split('?')[0];
        
        // Iteramos por los nodos hasta que uno responda
        for (const node of this.nodes) {
            try {
                console.log(`📡 [Cobalt] Intentando conexión con nodo: ${node}`);
                
                const response = await axios.post(node, {
                    url: cleanUrl,
                    videoQuality: '720',
                    downloadMode: 'default'
                }, {
                    headers: {
                        'accept': 'application/json',
                        'content-type': 'application/json',
                        'referer': 'https://cobalt.tools/'
                    },
                    timeout: 15000 // Si no responde en 15s, saltamos al siguiente
                });

                const data = response.data;

                // Interpretación del formato de Cobalt (basado en tu captura JSON)
                if (data.status === 'picker') {
                    // Es un carrusel: extraemos todas las URLs
                    return data.picker.map(item => ({
                        url: item.url,
                        type: (item.type === 'video' || item.url.includes('.mp4')) ? 'video' : 'image'
                    }));
                }

                if (data.status === 'redirect' || data.status === 'stream') {
                    // Es un solo archivo (foto o video único)
                    return [{
                        url: data.url,
                        type: cleanUrl.includes('/p/') ? 'image' : 'video'
                    }];
                }

            } catch (error) {
                console.log(`❌ Nodo ${node} no disponible o bloqueado.`);
                continue; // Probar el siguiente nodo de la lista
            }
        }
        throw new Error('TODOS_LOS_SERVIDORES_SATURADOS');
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
    const jid = m.key.remoteJid;
    try {
        let url = args[0] || (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation);
        if (!url) return;
        if (url.includes('/reel/')) return; 

        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const items = await cobalt.download(url);

        // Procesar y enviar cada elemento encontrado
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const buffer = await cobalt.getBuffer(item.url);
            
            await sock.sendMessage(jid, {
                [item.type]: buffer,
                caption: i === 0 ? `✅ *Contenido extraído* (${i + 1}/${items.length})` : ""
            }, { quoted: m });

            // Pequeña pausa para no saturar la subida de Railway
            if (items.length > 1) await new Promise(r => setTimeout(r, 1200));
        }

        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("Error General IG:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        await sock.sendMessage(jid, { 
            text: "⚠️ *Servicio temporalmente fuera de línea.*\n\nInstagram ha actualizado sus medidas de seguridad. Estamos trabajando en nuevos puentes de conexión." 
        }, { quoted: m });
    }
}
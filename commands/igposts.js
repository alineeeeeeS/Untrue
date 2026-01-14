import axios from 'axios';
import https from 'https';

class BK9InstagramService {
    constructor() {
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
        this.apis = [
            'https://api.bk9.dev/download/instagram',
            'https://api.bk9.dev/download/instagram2'
        ];
    }

    cleanUrl(url) {
        return url.split('?')[0];
    }

    async downloadPost(rawUrl) {
        const cleanUrl = this.cleanUrl(rawUrl);
        
        for (const apiUrl of this.apis) {
            try {
                const response = await axios.get(apiUrl, {
                    params: { url: cleanUrl },
                    timeout: 20000,
                    httpsAgent: this.httpsAgent
                });

                if (response.data && response.data.status) {
                    let results = response.data.BK9;
                    
                    // VALIDACIÓN ANTI-DUPLICADOS:
                    // BK9 a veces devuelve objetos repetidos o con la misma URL.
                    // Usamos un Set para filtrar por URL única.
                    const uniqueUrls = new Set();
                    const filteredResults = [];

                    results.forEach(item => {
                        if (!uniqueUrls.has(item.url)) {
                            uniqueUrls.add(item.url);
                            filteredResults.push({
                                url: item.url,
                                type: (item.type === 'video' || item.url.includes('.mp4')) ? 'video' : 'image'
                            });
                        }
                    });

                    if (filteredResults.length > 0) return filteredResults;
                }
            } catch (error) {
                console.log(`⚠️ Fallo en BK9: ${error.message}`);
                continue;
            }
        }
        throw new Error('FAILED');
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
        // --- 1. LÓGICA DE ARGUMENTOS (Posición + Link) ---
        let pos = null;
        let url = null;

        if (args.length >= 2 && !isNaN(args[0])) {
            // Caso: #post 2 [link]
            pos = parseInt(args[0]);
            url = args[1];
        } else {
            // Caso: #post [link]
            url = args[0] || (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation);
        }

        if (!url || !url.includes('instagram.com')) return;
        if (url.includes('/reel/')) return;

        // --- 2. REACCIÓN INICIAL (Procesando) ---
        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });

        const mediaItems = await bk9.downloadPost(url);

        // --- 3. FILTRADO POR POSICIÓN ---
        let itemsToSend = mediaItems;
        if (pos !== null) {
            // Si el usuario pide la posición 2, es el índice 1 del array
            const index = pos - 1;
            if (mediaItems[index]) {
                itemsToSend = [mediaItems[index]];
            } else {
                throw new Error('POSITION_NOT_FOUND');
            }
        }

        // --- 4. ENVÍO DE CONTENIDO ---
        for (let i = 0; i < itemsToSend.length; i++) {
            const item = itemsToSend[i];
            try {
                const buffer = await bk9.getBuffer(item.url);
                
                // Texto estético
                let caption = "";
                if (pos !== null) {
                    caption = `*Post descargado!*`;
                } else {
                    caption = itemsToSend.length > 1 
                        ? `*Carrusel descargado!* (${i + 1}/${itemsToSend.length})`
                        : `*Post descargado!*`;
                }

                await sock.sendMessage(jid, {
                    [item.type]: buffer,
                    caption: caption
                }, { quoted: m });

                if (itemsToSend.length > 1) await new Promise(r => setTimeout(r, 1500));

            } catch (err) {
                console.error(`Error enviando elemento:`, err.message);
            }
        }

        // --- 5. REACCIÓN FINAL (Éxito) ---
        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

    } catch (e) {
        console.error("Error Post:", e.message);
        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
        
        let errorMsg = "⚠️ *Error:* No se pudo descargar el contenido.";
        if (e.message === 'POSITION_NOT_FOUND') {
            errorMsg = "⚠️ *Error:* La posición solicitada no existe en este carrusel.";
        }
        
        await sock.sendMessage(jid, { text: errorMsg }, { quoted: m });
    }
}
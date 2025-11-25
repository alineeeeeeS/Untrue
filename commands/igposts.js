import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, unlinkSync, existsSync, readdirSync } from 'fs';

const execPromise = promisify(exec);
const ytDlpCommand = '/usr/local/bin/yt-dlp';

export async function igpostsCommand(sock, m, args) {
    let tempDir = null;
    let tempFilePath = null;
    
    try {
        let postUrl = args[0];
        let selectedIndex = null;

        // Verificar si el primer argumento es un número (selección de carrusel)
        if (args.length >= 2 && !isNaN(args[0])) {
            selectedIndex = parseInt(args[0]);
            postUrl = args[1];
            console.log(`🎯 Usuario seleccionó carrusel: ${selectedIndex}`);
        }

        // Obtener URL de mensaje citado
        if (!postUrl && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedText = m.message.extendedTextMessage.contextInfo.quotedMessage.conversation || 
                             m.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text;
            if (quotedText) {
                const urlMatch = quotedText.match(/https?:\/\/[^\s]+/g);
                if (urlMatch) {
                    for (const url of urlMatch) {
                        if (isValidInstagramUrl(url)) {
                            postUrl = url;
                            break;
                        }
                    }
                }
            }
        }

        if (!postUrl) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: `❌ *Uso del comando:*

📸 *Descargar todo el post:*
#post <url_instagram>

🎯 *Descargar carrusel específico:*
#post <número> <url_instagram>

*Ejemplos:*
#post https://instagram.com/p/ABC123...
#post 3 https://instagram.com/p/ABC123...` 
            }, { quoted: m });
            return;
        }

        if (!isValidInstagramUrl(postUrl)) {
            await sock.sendMessage(m.key.remoteJid, { 
                text: '❌ URL de Instagram no válida. Debe ser un Post o Reel público.' 
            }, { quoted: m });
            return;
        }

        // Enviar mensaje de procesamiento
        const processingMsg = await sock.sendMessage(m.key.remoteJid, { 
            text: '🔄 *Descargando contenido de Instagram...*\n⏳ Esto puede tomar unos segundos.' 
        }, { quoted: m });

        // Crear directorio temporal
        tempDir = join(tmpdir(), `instagram_${Date.now()}`);
        tempFilePath = join(tempDir, '%(title)s.%(ext)s');

        console.log(`📥 Descargando Instagram post: ${postUrl}`);

        // COMANDO YT-DLP PARA POSTS (puede tener múltiples medios)
        const command = `"${ytDlpCommand}" --no-playlist --write-info-json --skip-download -o "${tempFilePath}" "${postUrl}"`;

        try {
            // Primero obtener información del post
            await execPromise(command, { timeout: 30000 });
            
            // Buscar archivo de información
            const files = readdirSync(tempDir);
            const infoFile = files.find(f => f.endsWith('.info.json'));
            
            if (!infoFile) {
                throw new Error('No se pudo obtener información del post');
            }

            const infoPath = join(tempDir, infoFile);
            const info = JSON.parse(readFileSync(infoPath, 'utf8'));
            
            console.log(`📊 Post info: ${info.title}, Entries: ${info.entries ? info.entries.length : 1}`);

            // Determinar si es carrusel (múltiples entradas)
            const isCarousel = info.entries && info.entries.length > 1;
            const totalItems = isCarousel ? info.entries.length : 1;

            // Si el usuario seleccionó un carrusel específico
            if (selectedIndex !== null) {
                if (selectedIndex < 1 || selectedIndex > totalItems) {
                    await sock.sendMessage(m.key.remoteJid, { 
                        text: `❌ *Número de carrusel inválido*\n\nEste post tiene ${totalItems} elementos.\nUsa un número entre 1 y ${totalItems}.` 
                    }, { quoted: m });
                    return;
                }

                // Descargar solo el carrusel seleccionado
                const selectedUrl = isCarousel ? info.entries[selectedIndex - 1].url : postUrl;
                await downloadAndSendMedia(sock, m, processingMsg, selectedUrl, `Carrusel ${selectedIndex}/${totalItems}`);
                return;
            }

            // Descargar todo el post
            if (isCarousel) {
                // Enviar mensaje informativo para carrusel
                await sock.sendMessage(m.key.remoteJid, { 
                    text: `📦 *Post con ${totalItems} elementos*\n\n💡 *Tip:* Puedes descargar un carrusel específico usando:\n#post <número> <url>\n*Ejemplo:* #post 3 ${postUrl}` 
                }, { quoted: m });

                // Descargar cada elemento del carrusel
                for (let i = 0; i < totalItems; i++) {
                    const itemUrl = info.entries[i].url;
                    const caption = i === 0 ? `✅ Post descargado! (${i + 1}/${totalItems})` : `(${i + 1}/${totalItems})`;
                    
                    await downloadAndSendMedia(sock, m, i === 0 ? processingMsg : null, itemUrl, caption);
                    
                    if (i < totalItems - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            } else {
                // Post simple (un solo medio)
                await downloadAndSendMedia(sock, m, processingMsg, postUrl, '✅ Post descargado!');
            }

        } catch (error) {
            console.error('Error en yt-dlp:', error);
            
            // FALLBACK: Descargar directamente como video
            console.log('🔄 Intentando descarga directa...');
            await downloadAndSendMedia(sock, m, processingMsg, postUrl, '✅ Post descargado!');
        }

    } catch (error) {
        console.error('Error general:', error);

        let errorMessage = '❌ *Error al descargar el post*\n\n';

        if (error.message.includes('Private') || error.message.includes('privado')) {
            errorMessage += '🔒 *Contenido privado*\n';
            errorMessage += 'Solo funciona con contenido público de Instagram.';
        } else if (error.message.includes('Unsupported') || error.message.includes('No se pudo')) {
            errorMessage += '📱 *URL no soportada o inválida*\n';
            errorMessage += 'Asegúrate de que sea un Post o Reel público.';
        } else {
            errorMessage += `⚠️ *Error:* ${error.message}\n`;
            errorMessage += '🔄 Intenta con otro enlace.';
        }

        await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
    } finally {
        // Limpieza
        if (tempDir && existsSync(tempDir)) {
            try {
                readdirSync(tempDir).forEach(file => {
                    unlinkSync(join(tempDir, file));
                });
                // No eliminar el directorio mismo para evitar errores
            } catch (cleanError) {
                console.warn('Error en limpieza:', cleanError.message);
            }
        }
    }
}

// Función auxiliar para descargar y enviar medios
async function downloadAndSendMedia(sock, m, processingMsg, url, caption) {
    let tempFilePath = null;
    
    try {
        tempFilePath = join(tmpdir(), `instagram_media_${Date.now()}.mp4`);

        // Descargar el medio
        const command = `"${ytDlpCommand}" -f "best[height<=720]" --no-playlist --merge-output-format mp4 -o "${tempFilePath}" "${url}"`;
        await execPromise(command, { timeout: 60000 });

        if (!existsSync(tempFilePath)) {
            throw new Error('No se pudo generar el archivo');
        }

        const mediaBuffer = readFileSync(tempFilePath);
        const fileSizeMB = (mediaBuffer.length / 1024 / 1024).toFixed(2);
        console.log(`📊 Medio descargado: ${fileSizeMB} MB`);

        // Eliminar mensaje de procesamiento solo si es el primero
        if (processingMsg) {
            try {
                await sock.sendMessage(m.key.remoteJid, { delete: processingMsg.key });
            } catch (e) {}
        }

        // Determinar si es video o imagen y enviar
        const isVideo = fileSizeMB > 0.5; // Heurística simple
        
        if (isVideo) {
            await sock.sendMessage(m.key.remoteJid, {
                video: mediaBuffer,
                caption: caption,
                fileName: 'instagram_media.mp4'
            }, processingMsg ? { quoted: m } : undefined);
        } else {
            await sock.sendMessage(m.key.remoteJid, {
                image: mediaBuffer,
                caption: caption
            }, processingMsg ? { quoted: m } : undefined);
        }

        console.log('✅ Medio enviado correctamente');

    } catch (error) {
        console.error('Error descargando medio:', error);
        throw error;
    } finally {
        if (tempFilePath && existsSync(tempFilePath)) {
            try {
                unlinkSync(tempFilePath);
            } catch (e) {}
        }
    }
}

function isValidInstagramUrl(url) {
    const regex = /https?:\/\/(www\.)?instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)/;
    return regex.test(url);
}

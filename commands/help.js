import { readFileSync, existsSync } from 'fs';

const BANNER_IMAGE_PATH = './assets/untrue_banner.jpg'; 

export async function helpCommand(sock, m) {
    const helpText = `
*UntrueBot | MENÚ DE AYUDA*

🎥 *DESCARGA - REDES SOCIALES*
  • #tt [link] ▸ Videos/imágenes de TikTok
  • #ttaud [link] ▸ Audio de un TikTok
  • #ytvid [link/prompt] ▸ Videos de YouTube
  • #ytaud [link/prompt] ▸ Audio de YouTube
  • #reel [link] ▸ Reel de Instagram
  • #post [link] ▸ Post específico o carrusel entero de Instagram
  • #fb [link] ▸ Videos de Facebook
  • #pin [link] ▸ Contenido de Pinterest
  • #tw [link] ▸ Videos de X/Twitter

🎵 *FUNCIONES - MÚSICA*
  • #music [artista] [canción] ▸ Música desde YouTube
  • #letra [artista] [canción]

🧰 *UTILIDADES*
  • #traducir [idioma] ▸ Texto a traducir
  • #qr [texto/link] ▸ Generar códigos QR
  • #bcv ▸ Tasa del dólar BCV
  • #todos ▸ Menciona a todos en un grupo
  
💾 *CONVERTIDORES*
  • #s ▸ Imagen/video para crear un sticker
  • #smedia ▸ Sticker a imagen/video
  • #toaud ▸ Extraer audio de video
  • #totext ▸ Extraer texto de imagen/audio
  • #toimg ▸ Documentos convertidos a imágenes

🔧 *INFOBOT*
  • #ping ▸ Latencia del bot
  • #menu ▸ Ver este mensaje
  
>|< _Desarrollado por: @josentss_ >|<
    `.trim();

    try {
        let messageOptions = {
            text: helpText,
            quoted: m
        };

        // 1. Verificar si el archivo de la imagen existe
        if (existsSync(BANNER_IMAGE_PATH)) {
            const imageBuffer = readFileSync(BANNER_IMAGE_PATH);
            
            // 2. Cambiar a mensaje de imagen + caption
            messageOptions = {
                image: imageBuffer,
                caption: helpText,
                quoted: m
            };
            console.log('🖼️ Enviando menú con banner de imagen.');
        } else {
            console.warn(`⚠️ Advertencia: No se encontró la imagen del banner en la ruta: ${BANNER_IMAGE_PATH}. Enviando solo texto.`);
            messageOptions.text = helpText;
        }

        // Enviar el mensaje
        await sock.sendMessage(m.key.remoteJid, messageOptions);

    } catch (error) {
        console.error('❌ Error enviando el mensaje de ayuda:', error);
        await sock.sendMessage(m.key.remoteJid, { text: '❌ Error al mostrar el menú de ayuda.' }, { quoted: m });
    }
}

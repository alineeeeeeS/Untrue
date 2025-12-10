import { readFileSync, existsSync } from 'fs';

const BANNER_IMAGE_PATH = './assets/untrue_banner.jpg'; 

export async function helpCommand(sock, m) {
    const helpText = `
*UntrueBot | MENÚ DE AYUDA*

🎥 *DESCARGAS*
  • #tt [link] ▸ Videos/imágenes de TikTok
  • #tta [link] ▸ Audio de un TikTok
  • #ytv [link/prompt] ▸ Videos de YouTube
  • #yta [link/prompt] ▸ Audio de YouTube
  • #reel [link] ▸ Reel de Instagram
  • #post [link] ▸ Post específico o carrusel entero de Instagram
  • #fb [link] ▸ Videos de Facebook
  • #pin [link] ▸ Contenido de Pinterest
  • #tw [link] ▸ Videos de X/Twitter
  • #dl [link] ▸ Distintos tipos de descargas

🎵 *FUNCIONES - MÚSICA*
  • #music [artista] [canción] ▸ Música desde YouTube
  • #letra [artista] [canción]

🧰 *UTILIDADES*
  • #ia [prompt] ▸ Consultar con la IA
  • #trans [idioma] ▸ Texto a traducir
  • #qr [texto/link] ▸ Generar códigos QR
  • #bcv ▸ Tasa del dólar/euro BCV
  • #usdt ▸ Precio promedio del USDT
  • #calc ▸ Conversor de monedas
  • #todos ▸ Menciona a todos en un grupo
  
💾 *CONVERTIDORES*
  • #s ▸ Imagen/video para crear un sticker
  • #sm ▸ Sticker a imagen/video
  • #toa ▸ Extraer audio de video
  • #tot ▸ Extraer texto de imagen/audio
  • #toi ▸ Documentos convertidos a imágenes

🔧 *INFOBOT*
  • #ping ▸ Latencia del bot
  • #menu ▸ Ver este mensaje
  
*>|<* _Desarrollado por: @josentss_
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

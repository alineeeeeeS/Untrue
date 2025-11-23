import { readFileSync, existsSync } from 'fs';

const BANNER_IMAGE_PATH = './assets/untrue_banner.jpg'; 

export async function helpCommand(sock, m) {
    const helpText = `
*UntrueBot - MENÚ DE AYUDA*

🎥 *DESCARGA - REDES SOCIALES*
  • #tt [enlace] - Videos/imágenes de TikTok
  • #ttaud [enlace] - Solo el audio de un TikTok
  • #ytvid [enlace/búsqueda] - Videos de YouTube
  • #ytaud [enlace/búsqueda] - Solo audio de YouTube
  • #reel [enlace] - Reel de Instagram
  • #post [enlace] - Post (o carrusel entero) de Instagram
  • #post [número] [enlace] - Post específico de un carrusel
  • #fb [enlace] - Videos de Facebook
  • #pin [enlace] - Contenido de Pinterest
  • #tw [enlace] - Videos de Twitter/X

🎵 *FUNCIONES - MÚSICA*
  • #music [búsqueda] - Música desde YouTube
  • #letra [artista] [canción]

🧰 *UTILIDADES*
  • #traducir [idioma] - Responde a un texto para traducir
  • #qr [texto/link] - Generar código QR
  • #bcv - Ver tasa del dólar BCV
  • #todos - Menciona a todos en un grupo
  
💾 *CONVERSIÓN MULTIMEDIA*
  • #s o #sticker - Respondiendo a una imagen/video para crearlo
  • #smedia - Sticker a imagen/video
  • #toaud - Convertir video a audio
  • #totext - Extraer texto de imágenes
  • #toimg - Convertir documentos a imágenes

🔧 *COMANDOS - BOT*
  • #ping - Probar latencia del bot
  • #help o #menu - Ver este menú
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
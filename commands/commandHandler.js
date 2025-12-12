import { pingCommand } from "./ping.js"; // Ver latencia del bot
import { statsCommand } from "./stats.js"; // Ver estadísticas del bot
import { tiktokCommand } from "./tiktok.js"; // Descargar un tiktok
import { tiktokAudioCommand } from "./tiktokAudio.js"; // Descargar solo audio de un tiktok
import { igreelsCommand } from "./igreels.js"; // Descargar reels de instagram
import { igpostsCommand } from "./igposts.js"; // Descargar posts/carruseles de instagram
import { facebookCommand } from "./facebook.js"; // Descargar contenido desde facebook
import { twitterCommand } from "./twitter.js"; // Descargar contenido desde X/Twitter
import { pinterestCommand } from "./pinterest.js" // Descargar contenido desde pinterest
import { helpCommand } from "./help.js"; // Menú de ayuda
import { mediaToStickerCommand } from "./mediaToSticker.js"; // Convertir imagen/video a sticker
import { youtubeCommand } from "./youtube.js"; // Descargar video desde youtube
import { youtubeAudioCommand } from "./youtubeAudio.js"; // Descargar audio desde youtube
import { dlCommand } from './downloader.js'; // Descargas de cualquier tipo de link directo
import { stickerToMediaCommand } from "./stickerToMedia.js"; // Convertir un sticker a imagen/video
import { lyricsCommand } from "./lyrics.js"; // Buscar letra de canciones desde letras.com
import { bcvCommand } from "./bcv.js"; // Consultar tasa del dólar diaria del bcv.org.ve
import { usdtCommand } from "./usdt.js"; // Consultar precio promedio del USDT desde el p2p de Binance
import { calcCommand } from "./calc.js"; // Conversión de monedas utilizando las tasas
import { qrGeneratorCommand } from "./qrGenerator.js"; // Texto/link a QR
import { iaCommand } from "./ia.js"; // Preguntas a la ia (Groq AI)
import { toAudioCommand } from "./toAudio.js"; // Extraer el audio de un video
import { todosCommand } from "./todos.js"; // Mencionar a todos en un grupo
import { totextCommand } from "./totext.js"; // Audio/imagen a texto
import { toimgCommand } from "./toimg.js"; // Documentos docx/xlsx/pdf a imagen
import { traducirCommand } from "./traducir.js"; // Traducir textos a multiples idiomas (es,en,ja,it,fr...)
import { blackjackCommand } from './blackjack.js'; // Juego de cartas sencillo para el chat
import { ruletaCommand } from './ruleta.js'; // Juego de ruleta sencillo
import { slotsCommand } from './slots.js'; // Juego de tragamonedas
import { balCommand } from './bal.js'; // Estadísticas del jugador (dinero, partidas ganadas/perdidas...)
import { dailyCommand } from './daily.js'; // Recompensa diaria para jugadores 

// Importación de variable para recopilar estadísticas de uso de comandos
import { recordCommandUsage } from "./stats.js";

// Mapeo de comandos
const commands = {
	
    // COMANDOS BÁSICOS
    ping: pingCommand,
    help: helpCommand,
    menu: helpCommand,
    info: helpCommand,
    stats: statsCommand,

    // COMANDOS DE DESCARGA
    tt: tiktokCommand,
    ttaud: tiktokAudioCommand,
	tta: tiktokAudioCommand,
    reel: igreelsCommand,
	r: igreelsCommand,
    post: igpostsCommand,
	p: igpostsCommand,
    fb: facebookCommand,
    tw: twitterCommand,
    pin: pinterestCommand,
    ytvid: youtubeCommand,  
    ytaud: youtubeAudioCommand,
	ytv: youtubeCommand,  
	yta: youtubeAudioCommand,
    music: youtubeAudioCommand,
	dl: dlCommand,

	// ECONOMÍA
	bj: blackjackCommand,
	ruleta: ruletaCommand,
	rul: ruletaCommand,
	slots: slotsCommand,
	sl: slotsCommand,
	bal: balCommand,
	daily: dailyCommand,
	
    // UTILIDADES VARIAS
    letra: lyricsCommand,
    bcv: bcvCommand,
    usdt: usdtCommand,
	calc: calcCommand,
    qr: qrGeneratorCommand,
    todos: todosCommand,
    traducir: traducirCommand,
    trans: traducirCommand,
	ia: iaCommand,

    // COMANDOS DE CONVERSIÓN
    s: mediaToStickerCommand,
    sticker: mediaToStickerCommand,
    smedia: stickerToMediaCommand,
	sm: stickerToMediaCommand,
    toaud: toAudioCommand,
	toa: toAudioCommand,
    totext: totextCommand,
	tot: totextCommand,
    toimg: toimgCommand,
	toi: toimgCommand,
};

async function handleInvalidCommand(sock, m, invalidCommandName) {
    const remoteJid = m.key.remoteJid;
    const fullCommand = `#${invalidCommandName}`; 
    
    const customErrorMessage = `
❌ *ERROR: Comando no reconocido*
El comando *${fullCommand}* no existe o está mal escrito.

▸ Asegúrate de no tener errores tipográficos.
▸ Para ver la lista de comandos, usa *#menu*.
    `.trim();

    try {
        await sock.sendMessage(remoteJid, {
            text: customErrorMessage
        }, { quoted: m });
    } catch (error) {
        console.error('❌ Error enviando mensaje de comando inválido:', error);
    }
}

export async function handleCommand(sock, m, commandName, args) {
    const userId = m.key.remoteJid;
    
    // REGISTRAR USO DEL COMANDO (excepto comandos básicos/metadatos)
    const excludedCommands = ['ping', 'stats', 'help', 'menu', 'info'];
    if (!excludedCommands.includes(commandName)) {
        recordCommandUsage(commandName, userId);
    }
    
    if (commands[commandName]) {
        try {
            await commands[commandName](sock, m, args);
        } catch (error) {
            console.error(`Error ejecutando el comando ${commandName}:`, error);
            await sock.sendMessage(
                m.key.remoteJid,
                { text: `⚠️ Error al ejecutar el comando *#${commandName}*` },
                { quoted: m },
            );
        }
    } else {
        await handleInvalidCommand(sock, m, commandName);
    }
}
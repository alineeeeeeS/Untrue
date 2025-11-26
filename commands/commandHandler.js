import { pingCommand } from "./ping.js";
import { statsCommand } from "./stats.js";
import { tiktokCommand } from "./tiktok.js";
import { tiktokAudioCommand } from "./tiktokAudio.js";
import { igreelsCommand } from "./igreels.js";
import { igpostsCommand } from "./igposts.js";
//import { igaudioCommand } from "./igaudio.js";
import { facebookCommand } from "./facebook.js";
import { twitterCommand } from "./twitter.js";
import { pinterestCommand } from "./pinterest.js"
import { helpCommand } from "./help.js";
import { mediaToStickerCommand } from "./mediaToSticker.js";
import { youtubeCommand } from "./youtube.js";
import { youtubeAudioCommand } from "./youtubeAudio.js";
import { stickerToMediaCommand } from "./stickerToMedia.js";
import { lyricsCommand } from "./lyrics.js";
import { bcvCommand } from "./bcv.js";
import { qrGeneratorCommand } from "./qrGenerator.js";
import { geminiCommand } from "./gemini.js";
import { toAudioCommand } from "./toAudio.js";
import { todosCommand } from "./todos.js";
import { totextCommand } from "./totext.js"
import { toimgCommand } from "./toimg.js"
import { traducirCommand } from "./traducir.js"
// Sistema de estadísticas
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
    reel: igreelsCommand,
    post: igpostsCommand,
    //igaud: igaudioCommand,
    fb: facebookCommand,
    tw: twitterCommand,
    pin: pinterestCommand,
    ytvid: youtubeCommand,  
    ytaud: youtubeAudioCommand,
	ytv: youtubeCommand,  
	yta: youtubeAudioCommand,
    music: youtubeAudioCommand,

    // OTROS COMANDOS
    letra: lyricsCommand,
    bcv: bcvCommand,
    qr: qrGeneratorCommand,
    todos: todosCommand,
    traducir: traducirCommand,
    trans: traducirCommand,
	gemini: geminiCommand,

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
        // Si el comando no existe, mostrar ayuda
        await helpCommand(sock, m);
    }
}

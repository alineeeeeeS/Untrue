import { pingCommand } from "./ping.js";
import { statsCommand } from "./stats.js";
import { rotateCommand } from "./rotate.js";
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
import { toAudioCommand } from "./toAudio.js";
import { todosCommand } from "./todos.js";
import { totextCommand } from "./totext.js"
import { toimgCommand } from "./toimg.js"
import { traducirCommand } from "./traducir.js"

// Mapeo de comandos (nombre: función)
const commands = {
    // COMANDOS BÁSICOS
    ping: pingCommand,
    help: helpCommand,
    menu: helpCommand,
    info: helpCommand,
    rotate: rotateCommand,
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
    music: youtubeAudioCommand,

    // OTROS COMANDOS
    letra: lyricsCommand,
    bcv: bcvCommand,
    qr: qrGeneratorCommand,
    todos: todosCommand,
    traducir: traducirCommand,
    trans: traducirCommand,

    // COMANDOS DE CONVERSIÓN
    s: mediaToStickerCommand,
    sticker: mediaToStickerCommand,
    smedia: stickerToMediaCommand,
    toaud: toAudioCommand,
    totext: totextCommand,
    toimg: toimgCommand,
};

export async function handleCommand(sock, m, commandName, args) {
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
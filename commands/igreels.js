import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, unlinkSync, existsSync } from 'fs';

const execPromise = promisify(exec);
const ytDlpCommand = '/usr/local/bin/yt-dlp';
const cookiesPath = '/app/cookies.txt';

export async function igreelsCommand(sock, m, args) {
  let tempFilePath = null;

  try {
    let reelUrl = args[0]?.trim();

    if (!reelUrl && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      const quotedText =
        m.message.extendedTextMessage.contextInfo.quotedMessage.conversation ||
        m.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text;
      if (quotedText) {
        const urlMatch = quotedText.match(/https?:\/\/[^\s]+/g);
        if (urlMatch) {
          for (const url of urlMatch) {
            if (isValidInstagramUrl(url)) {
              reelUrl = url;
              break;
            }
          }
        }
      }
    }

    if (!reelUrl || !isValidInstagramUrl(reelUrl)) {
      await sock.sendMessage(
        m.key.remoteJid,
        { text: 'Uso correcto:\n#reel [link]' },
        { quoted: m }
      );
      return;
    }

    reelUrl = reelUrl.split('?')[0];

    tempFilePath = join(tmpdir(), `instagram_reel_${Date.now()}.mp4`);

    let cookiesArg = '';
    if (existsSync(cookiesPath)) {
      cookiesArg = `--cookies "${cookiesPath}"`;
    }

    const command = `"${ytDlpCommand}" ${cookiesArg} -f "bv*+ba/b" --no-playlist --merge-output-format mp4 -o "${tempFilePath}" "${reelUrl}"`;

    await execPromise(command, { timeout: 60000 });

    if (!existsSync(tempFilePath)) {
      throw new Error('No se pudo generar el archivo de video');
    }

    const videoBuffer = readFileSync(tempFilePath);

    await sock.sendMessage(
      m.key.remoteJid,
      {
        video: videoBuffer,
        caption: 'Reel descargado!',
        fileName: 'instagram_reel.mp4'
      },
      { quoted: m }
    );
  } catch (error) {
    console.error('=== yt-dlp ERROR ===');
    console.error('message:', error.message);
    console.error('stdout:', error.stdout);
    console.error('stderr:', error.stderr);

    const stderr = (error.stderr || '').toLowerCase();
    const stdout = (error.stdout || '').toLowerCase();
    const fullError = `${error.message} ${stderr} ${stdout}`.toLowerCase();

    let errorMessage = 'Error al descargar el reel.\n\n';

    if (/login|sign in|rate-limit|401|403|authentication|cookie/.test(fullError)) {
      errorMessage += 'Bloqueo de Instagram: el servidor pide autenticación. Revisa o actualiza cookies.txt.';
    } else if (/private|privado/.test(fullError)) {
      errorMessage += 'Contenido privado: solo funciona con contenido público.';
    } else if (/ffmpeg|merge|postprocessing/.test(fullError)) {
      errorMessage += 'Falta ffmpeg o falló la fusión de video/audio. Instala ffmpeg en el servidor.';
    } else if (/unsupported url|no video formats|unable to download webpage|no formats/.test(fullError)) {
      errorMessage += 'yt-dlp no reconoce ese enlace o no encontró formatos. Actualiza yt-dlp o prueba otro enlace.';
    } else {
      errorMessage += `No se pudo procesar el enlace.\nDetalle: ${stderr || stdout || error.message}`;
    }

    await sock.sendMessage(m.key.remoteJid, { text: errorMessage }, { quoted: m });
  } finally {
    if (tempFilePath && existsSync(tempFilePath)) {
      try {
        unlinkSync(tempFilePath);
      } catch (e) {}
    }
  }
}

function isValidInstagramUrl(url) {
  const regex = /https?:\/\/(www\.)?instagram\.com\/(reel|p|stories)\/([A-Za-z0-9_-]+)/;
  return regex.test(url);
}

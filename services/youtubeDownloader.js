import { exec } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import fs from 'fs';
import { promisify } from 'util';

const execPromise = promisify(exec);

const ytDlpCommand = '/home/runner/workspace/.pythonlibs/bin/yt-dlp';
const ffmpegCommand = '/home/runner/workspace/node_modules/ffmpeg-static/ffmpeg';

// Estrategias de descarga para evitar detección como bot
const downloadStrategies = [
  '--extractor-args "youtube:player_client=android"',
  '--extractor-args "youtube:player_client=ios"', 
  '--extractor-args "youtube:player_client=web"',
  '--extractor-args "youtube:player_client=android_embedded"'
];

/**
 * Obtiene información del video con reintentos
 */
export async function getYouTubeVideoInfo(queryOrUrl) {
  const strategies = [
    `"${ytDlpCommand}" --dump-json --no-playlist "${queryOrUrl}"`,
    `"${ytDlpCommand}" --dump-json --no-playlist --extractor-args "youtube:player_client=android" "${queryOrUrl}"`,
    `"${ytDlpCommand}" --dump-json --no-playlist --extractor-args "youtube:player_client=ios" "${queryOrUrl}"`
  ];

  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`🔍 Intentando obtener info (estrategia ${i + 1})...`);
      const { stdout } = await execPromise(strategies[i]);
      const info = JSON.parse(stdout);

      const uploadDate = info.upload_date ? 
        `${info.upload_date.substring(6, 8)}/${info.upload_date.substring(4, 6)}/${info.upload_date.substring(0, 4)}` : 
        'N/A';

      return {
        title: info.title || 'Título Desconocido',
        author: info.channel || info.uploader || 'Autor Desconocido',
        duration: info.duration || 0,
        uploadDate: uploadDate,
        thumbnail: info.thumbnail || null,
        url: info.webpage_url || queryOrUrl
      };
    } catch (error) {
      console.error(`❌ Estrategia ${i + 1} falló:`, error.message);
      if (i === strategies.length - 1) {
        console.error("❌ Todas las estrategias fallaron al obtener info");
        return getDefaultVideoInfo();
      }
    }
  }
}

function getDefaultVideoInfo() {
  return {
    title: 'YouTube Video',
    author: 'Desconocido',
    duration: 0,
    uploadDate: 'N/A',
    thumbnail: null,
    url: null
  };
}

/**
 * Descarga audio de YouTube con múltiples estrategias
 */
export async function downloadYoutubeAudio(args) {
  const isSearch = !args[0].startsWith('http');
  const queryOrUrl = isSearch ? `ytsearch1:${args.join(' ')}` : args[0];
  
  let videoInfo = getDefaultVideoInfo();

  console.log(`🎵 Descargando Audio: ${isSearch ? 'Búsqueda' : 'URL'}`);

  try {
    videoInfo = await getYouTubeVideoInfo(queryOrUrl);
    console.log(`🔍 Info: ${videoInfo.title}`);
  } catch (error) {
    console.error("Error obteniendo información:", error);
  }

  const tempFileName = `youtube-audio-${Date.now()}`;
  const tempFilePath = join(tmpdir(), tempFileName);

  // Estrategias de descarga con diferentes configuraciones
  const audioStrategies = [
    // Estrategia 1: Android client + formato específico
    `"${ytDlpCommand}" -f "bestaudio[ext=m4a]/bestaudio" --no-playlist --extractor-args "youtube:player_client=android" --output "${tempFilePath}" "${queryOrUrl}"`,
    
    // Estrategia 2: iOS client
    `"${ytDlpCommand}" -f "bestaudio" --no-playlist --extractor-args "youtube:player_client=ios" --output "${tempFilePath}" "${queryOrUrl}"`,
    
    // Estrategia 3: Web client con throttling
    `"${ytDlpCommand}" -f "bestaudio" --no-playlist --extractor-args "youtube:player_client=web" --throttled-rate 100K --output "${tempFilePath}" "${queryOrUrl}"`,
    
    // Estrategia 4: Sin cliente específico (fallback)
    `"${ytDlpCommand}" -f "bestaudio" --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`
  ];

  for (let i = 0; i < audioStrategies.length; i++) {
    try {
      console.log(`🎵 Intentando estrategia de audio ${i + 1}...`);
      await execPromise(audioStrategies[i]);

      // Verificar archivos posibles
      const possibleFiles = [
        tempFilePath,
        tempFilePath + '.m4a', 
        tempFilePath + '.mp3',
        tempFilePath + '.webm',
        tempFilePath + '.opus'
      ];
      
      for (const file of possibleFiles) {
        if (fs.existsSync(file) && fs.statSync(file).size > 1024) {
          const stats = fs.statSync(file);
          console.log(`✅ Audio descargado (estrategia ${i + 1}): ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          
          return {
            filePath: file,
            videoInfo: videoInfo,
            strategyUsed: i + 1
          };
        }
      }
      
      console.log(`❌ Estrategia ${i + 1} no produjo archivo válido`);
      
    } catch (error) {
      console.error(`❌ Estrategia de audio ${i + 1} falló:`, error.message);
      
      // Si es la última estrategia, lanzar error
      if (i === audioStrategies.length - 1) {
        throw new Error(`No se pudo descargar el audio después de ${audioStrategies.length} intentos: ${error.message}`);
      }
    }
  }

  cleanUpFile(tempFilePath);
  return null;
}

/**
 * Descarga video de YouTube con múltiples estrategias
 */
export async function downloadYoutubeVideo(args) {
  const isSearch = !args[0].startsWith('http');
  const queryOrUrl = isSearch ? `ytsearch1:${args.join(' ')}` : args[0];

  const tempFileName = `youtube-video-${Date.now()}.mp4`;
  const tempFilePath = join(tmpdir(), tempFileName);

  let videoInfo = getDefaultVideoInfo();

  console.log(`📥 Descargando Video: ${isSearch ? 'Búsqueda' : 'URL'}`);

  try {
    videoInfo = await getYouTubeVideoInfo(queryOrUrl);
    console.log(`🔍 Info: ${videoInfo.title}`);
  } catch (error) {
    console.error("Error obteniendo información:", error);
  }

  // Estrategias para video
  const videoStrategies = [
    // Estrategia 1: Android client + resolución media
    `"${ytDlpCommand}" -f "best[height<=480]" --no-playlist --extractor-args "youtube:player_client=android" --output "${tempFilePath}" "${queryOrUrl}"`,
    
    // Estrategia 2: iOS client
    `"${ytDlpCommand}" -f "best[height<=720]" --no-playlist --extractor-args "youtube:player_client=ios" --output "${tempFilePath}" "${queryOrUrl}"`,
    
    // Estrategia 3: Formato mp4 específico
    `"${ytDlpCommand}" -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`,
    
    // Estrategia 4: Fallback simple
    `"${ytDlpCommand}" -f "best" --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`
  ];

  for (let i = 0; i < videoStrategies.length; i++) {
    try {
      console.log(`📥 Intentando estrategia de video ${i + 1}...`);
      await execPromise(videoStrategies[i]);

      if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
        const stats = fs.statSync(tempFilePath);
        console.log(`✅ Video descargado (estrategia ${i + 1}): ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        return {
          filePath: tempFilePath,
          videoInfo: videoInfo,
          strategyUsed: i + 1
        };
      }
      
      console.log(`❌ Estrategia ${i + 1} no produjo archivo válido`);
      
    } catch (error) {
      console.error(`❌ Estrategia de video ${i + 1} falló:`, error.message);
      
      if (i === videoStrategies.length - 1) {
        throw new Error(`No se pudo descargar el video después de ${videoStrategies.length} intentos: ${error.message}`);
      }
    }
  }

  cleanUpFile(tempFilePath);
  return null;
}

/**
 * Limpieza de archivos temporales
 */
export function cleanUpFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`🧹 Archivo temporal eliminado: ${filePath}`);
    } catch (error) {
      console.error("Error eliminando archivo temporal:", error.message);
    }
  }
}

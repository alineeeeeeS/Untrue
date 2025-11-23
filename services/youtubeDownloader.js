import { exec } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import fs from 'fs';
import { promisify } from 'util';

const execPromise = promisify(exec);

const ytDlpCommand = '/home/runner/workspace/.pythonlibs/bin/yt-dlp';

/**
 * Estrategias avanzadas para evitar detección
 */
const getAdvancedStrategies = (queryOrUrl, tempFilePath, type = 'audio') => {
  const baseStrategies = [
    // Estrategia 1: Client TV HTML5 + throttling
    `"${ytDlpCommand}" --extractor-args "youtube:player_client=android,web" --throttled-rate 512K --force-ipv4 --sleep-requests 1 --sleep-interval 5 --max-sleep-interval 10 ${type === 'audio' ? '-f "bestaudio[ext=m4a]"' : '-f "best[height<=360]"'} --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`,
    
    // Estrategia 2: Client Android sin throttling
    `"${ytDlpCommand}" --extractor-args "youtube:player_client=android" ${type === 'audio' ? '-f "bestaudio"' : '-f "best[height<=480]"'} --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`,
    
    // Estrategia 3: Client iOS + formato específico
    `"${ytDlpCommand}" --extractor-args "youtube:player_client=ios" ${type === 'audio' ? '-f "bestaudio[ext=m4a]/bestaudio"' : '-f "best[height<=720]"'} --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`,
    
    // Estrategia 4: Client TV HTML5 simple
    `"${ytDlpCommand}" --extractor-args "youtube:player_client=tv_html5" ${type === 'audio' ? '-f "bestaudio"' : '-f "best"'} --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`,
    
    // Estrategia 5: Sin cliente específico (fallback original)
    `"${ytDlpCommand}" ${type === 'audio' ? '-f "bestaudio"' : '-f "best[height<=480]"'} --no-playlist --output "${tempFilePath}" "${queryOrUrl}"`
  ];
  
  return baseStrategies;
};

/**
 * Obtiene información del video con estrategias mejoradas
 */
export async function getYouTubeVideoInfo(queryOrUrl) {
  const strategies = [
    `"${ytDlpCommand}" --dump-json --no-playlist --extractor-args "youtube:player_client=tv_html5" "${queryOrUrl}"`,
    `"${ytDlpCommand}" --dump-json --no-playlist --extractor-args "youtube:player_client=android_embedded" "${queryOrUrl}"`,
    `"${ytDlpCommand}" --dump-json --no-playlist --extractor-args "youtube:player_client=web" "${queryOrUrl}"`,
    `"${ytDlpCommand}" --dump-json --no-playlist "${queryOrUrl}"`
  ];

  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`🔍 Obteniendo info (estrategia ${i + 1})...`);
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
      // Continuar con la siguiente estrategia
    }
  }
  
  // Si todas fallan, retornar info por defecto
  return getDefaultVideoInfo();
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
 * Descarga audio de YouTube con estrategias avanzadas
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

  const strategies = getAdvancedStrategies(queryOrUrl, tempFilePath, 'audio');

  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`🎵 Intentando estrategia de audio ${i + 1}...`);
      await execPromise(strategies[i]);

      // Verificar archivos posibles
      const possibleFiles = [
        tempFilePath,
        tempFilePath + '.m4a', 
        tempFilePath + '.mp3',
        tempFilePath + '.webm',
        tempFilePath + '.opus',
        tempFilePath + '.mka'
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
      if (i === strategies.length - 1) {
        throw new Error(`No se pudo descargar el audio después de ${strategies.length} intentos. YouTube está bloqueando las descargas.`);
      }
      
      // Esperar un poco antes del siguiente intento
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  cleanUpFile(tempFilePath);
  return null;
}

/**
 * Descarga video de YouTube con estrategias avanzadas
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

  const strategies = getAdvancedStrategies(queryOrUrl, tempFilePath, 'video');

  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`📥 Intentando estrategia de video ${i + 1}...`);
      await execPromise(strategies[i]);

      if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
        const stats = fs.statSync(tempFilePath);
        console.log(`✅ Video descargado (estrategia ${i + 1}): ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        return {
          filePath: tempFilePath,
          videoInfo: videoInfo,
          strategyUsed: i + 1
        };
      }
      
      // Verificar también sin extensión
      const fileWithoutExt = tempFilePath.replace('.mp4', '');
      if (fs.existsSync(fileWithoutExt) && fs.statSync(fileWithoutExt).size > 0) {
        const stats = fs.statSync(fileWithoutExt);
        console.log(`✅ Video descargado (estrategia ${i + 1}): ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        return {
          filePath: fileWithoutExt,
          videoInfo: videoInfo,
          strategyUsed: i + 1
        };
      }
      
      console.log(`❌ Estrategia ${i + 1} no produjo archivo válido`);
      
    } catch (error) {
      console.error(`❌ Estrategia de video ${i + 1} falló:`, error.message);
      
      if (i === strategies.length - 1) {
        throw new Error(`No se pudo descargar el video después de ${strategies.length} intentos. YouTube está bloqueando las descargas.`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
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

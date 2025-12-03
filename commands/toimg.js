import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, readdirSync, existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Comandos para Replit
const LIBREOFFICE_COMMAND = 'libreoffice';
const CONVERT_COMMAND = 'convert';

/**
 * Función para convertir documentos (PDF, DOCX, XLSX) a imágenes
 */
export async function toimgCommand(sock, m, args) {
    let tempDir, tempDocumentPath;

    try {
        // Verificar dependencias primero
        await checkDependencies();

        // Verificar si hay un mensaje respondido con documento
        const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMessage) {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *Uso incorrecto*\n\nPara extraer todas las páginas del documento:\n▸ #toimg\n\nPara extraer una página específica del documento:\n▸ #toimg _número_\n\n🗂️ _Formatos soportados:_ PDF, DOCX y XLSX` 
                },
                { quoted: m }
            );
            return;
        }

        const documentMessage = quotedMessage.documentMessage;
        if (!documentMessage) {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *NO ES UN DOCUMENTO*\n\nEl mensaje al que respondiste no contiene un documento válido.` 
                },
                { quoted: m }
            );
            return;
        }

        const fileName = documentMessage.fileName || 'documento';
        const fileExtension = fileName.split('.').pop().toLowerCase();

        const supportedFormats = ['pdf', 'docx', 'doc', 'xlsx', 'xls'];
        if (!supportedFormats.includes(fileExtension)) {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *FORMATO NO SOPORTADO*\n\nFormatos soportados: PDF, DOCX, XLSX\n\nTu archivo: ${fileExtension.toUpperCase()}` 
                },
                { quoted: m }
            );
            return;
        }

        const requestedPage = args[0] ? parseInt(args[0]) : null;

        if (requestedPage !== null && (isNaN(requestedPage) || requestedPage < 1)) {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `❌ *PÁGINA INVÁLIDA*\n\nLa página debe ser un número mayor a 0.\nEjemplo: #toimg 2` 
                },
                { quoted: m }
            );
            return;
        }

        // Enviar mensaje de procesamiento
        const processingMsg = await sock.sendMessage(
            m.key.remoteJid,
            { 
                text: `🔄 *Convirtiendo documento...*\n\n📄 Archivo: ${fileName}\n⏳ Esto puede tomar unos segundos...` 
            },
            { quoted: m }
        );

        // Descargar el documento
        const documentBuffer = await downloadDocument(documentMessage);

        if (!documentBuffer || documentBuffer.length === 0) {
            throw new Error('No se pudo descargar el documento');
        }

        console.log(`📥 Documento descargado: ${fileName} (${(documentBuffer.length / 1024).toFixed(2)} KB)`);

        // Crear directorio temporal
        tempDir = join(tmpdir(), `doc-to-img-${Date.now()}`);
        const fs = await import('fs');
        if (!existsSync(tempDir)) {
            await fs.promises.mkdir(tempDir, { recursive: true });
        }

        // Guardar documento temporalmente
        tempDocumentPath = join(tempDir, `documento.${fileExtension}`);
        await fs.promises.writeFile(tempDocumentPath, documentBuffer);

        console.log(`🔧 Convirtiendo ${fileExtension.toUpperCase()} a imágenes...`);

        // Convertir documento a imágenes
        const imagePaths = await convertDocumentToImages(tempDocumentPath, tempDir, fileExtension);

        if (!imagePaths || imagePaths.length === 0) {
            throw new Error('No se pudieron generar imágenes del documento');
        }

        const totalPages = imagePaths.length;

        // Determinar qué páginas enviar
        let pagesToSend = [];
        if (requestedPage) {
            if (requestedPage > totalPages) {
                throw new Error(`El documento solo tiene ${totalPages} página(s)`);
            }
            pagesToSend = [requestedPage - 1];
        } else {
            pagesToSend = Array.from({ length: totalPages }, (_, i) => i);
        }

        console.log(`📄 Enviando ${pagesToSend.length} página(s) de ${totalPages} totales`);

        // Enviar las imágenes
        for (const pageIndex of pagesToSend) {
            const imagePath = imagePaths[pageIndex];
            const pageNumber = pageIndex + 1;

            try {
                const imageBuffer = await fs.promises.readFile(imagePath);
                const fileSizeMB = (imageBuffer.length / 1024 / 1024).toFixed(2);

                console.log(`📊 Tamaño imagen página ${pageNumber}: ${fileSizeMB} MB`);

                // Optimizar tamaño si es muy grande (>2MB)
                let finalBuffer = imageBuffer;
                if (imageBuffer.length > 2 * 1024 * 1024) { // >2MB
                    console.log(`🔄 Optimizando tamaño de página ${pageNumber}...`);
                    finalBuffer = await optimizeImageSize(imageBuffer);
                    console.log(`✅ Imagen optimizada: ${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB`);
                }

                await sock.sendMessage(
                    m.key.remoteJid,
                    {
                        image: finalBuffer,
                        caption: `📄 ${fileName} - Página ${pageNumber}/${totalPages}`
                    },
                    { quoted: pageIndex === pagesToSend[0] ? m : undefined }
                );

                console.log(`✅ Página ${pageNumber} enviada`);

                // Pequeña pausa entre envíos
                if (pagesToSend.length > 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (sendError) {
                console.error(`Error enviando página ${pageNumber}:`, sendError);
            }
        }

        // Enviar resumen si son múltiples páginas
        if (pagesToSend.length > 1) {
            await sock.sendMessage(
                m.key.remoteJid,
                { 
                    text: `✅ *CONVERSIÓN COMPLETADA*\n\n📄 ${fileName}\n📊 ${pagesToSend.length} páginas convertidas a PNG\n\n💡 Usa #toimg <número> para una página específica` 
                }
            );
        }

        console.log(`✅ Conversión completada: ${pagesToSend.length} página(s) enviada(s)`);

        // Eliminar mensaje de procesamiento
        if (processingMsg) {
            try {
                await sock.sendMessage(m.key.remoteJid, { delete: processingMsg.key });
            } catch (deleteError) {
                console.warn('⚠️ No se pudo eliminar mensaje de procesamiento:', deleteError.message);
            }
        }

    } catch (error) {
        console.error('❌ Error en toimgCommand:', error);
        await sock.sendMessage(
            m.key.remoteJid,
            { 
                text: `❌ *ERROR AL CONVERTIR*\n\n${error.message}\n\n💡 Asegúrate de que el documento no esté corrupto o protegido.` 
            },
            { quoted: m }
        );
    } finally {
        // Limpieza de archivos temporales
        await cleanupTempFiles(tempDocumentPath, tempDir);
    }
}

/**
 * Optimizar tamaño de imagen para WhatsApp
 */
async function optimizeImageSize(imageBuffer) {
    const fs = await import('fs');
    const tempInput = join(tmpdir(), `input-${Date.now()}.png`);
    const tempOutput = join(tmpdir(), `optimized-${Date.now()}.png`);

    try {
        // Guardar imagen temporal
        await fs.promises.writeFile(tempInput, imageBuffer);

        // Optimizar con ImageMagick para reducir tamaño manteniendo calidad
        const optimizeCommand = `"${CONVERT_COMMAND}" "${tempInput}" -strip -quality 85% -define png:compression-level=9 -define png:compression-strategy=1 -define png:exclude-chunk=all -resize 80% "${tempOutput}"`;

        await execPromise(optimizeCommand);

        // Leer imagen optimizada
        const optimizedBuffer = await fs.promises.readFile(tempOutput);
        return optimizedBuffer;

    } catch (error) {
        console.error('Error optimizando imagen:', error);
        return imageBuffer; // Devolver original si falla
    } finally {
        // Limpiar temporales
        try {
            if (existsSync(tempInput)) unlinkSync(tempInput);
            if (existsSync(tempOutput)) unlinkSync(tempOutput);
        } catch (e) {
            console.warn('Error limpiando temporales de optimización:', e.message);
        }
    }
}

/**
 * Verificar que las dependencias estén instaladas
 */
async function checkDependencies() {
    try {
        // Verificar LibreOffice
        await execPromise(`${LIBREOFFICE_COMMAND} --version`);
        console.log('✅ LibreOffice disponible');

        // Verificar ImageMagick
        await execPromise(`${CONVERT_COMMAND} --version`);
        console.log('✅ ImageMagick disponible');

    } catch (error) {
        console.error('❌ Dependencias no disponibles:', error.message);
        throw new Error('Las herramientas de conversión no están disponibles. Instala LibreOffice e ImageMagick en System Dependencies.');
    }
}

/**
 * Convertir documento a imágenes
 */
async function convertDocumentToImages(documentPath, outputDir, fileExtension) {
    const fs = await import('fs');

    try {
        // Para PDFs usar ImageMagick directamente
        if (fileExtension === 'pdf') {
            return await convertPDFToImages(documentPath, outputDir);
        }

        // Para archivos Excel (XLSX, XLS) usar método especial
        if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            return await convertExcelToImages(documentPath, outputDir, fileExtension);
        }

        // Para DOCX usar conversión directa
        console.log(`🔄 Convirtiendo ${fileExtension} directamente a imágenes...`);
        return await convertOfficeToImagesDirectly(documentPath, outputDir, fileExtension);

    } catch (error) {
        console.error('Error en conversión directa:', error);

        // Si falla la conversión directa, intentar con PDF intermedio
        console.log('🔄 Intentando conversión mediante PDF...');
        return await convertViaPDF(documentPath, outputDir, fileExtension);
    }
}

/**
 * Convertir archivos Excel con parámetros optimizados
 */
async function convertExcelToImages(documentPath, outputDir, fileExtension) {
    const fs = await import('fs');

    try {
        console.log(`📊 Convirtiendo Excel con parámetros balanceados...`);

        // Usar método balanceado (calidad vs peso)
        return await convertExcelBalanced(documentPath, outputDir, fileExtension);

    } catch (error) {
        console.error('Error en conversión de Excel:', error);

        // Intentar método alternativo
        console.log('🔄 Intentando método alternativo para Excel...');
        return await convertExcelAlternative(documentPath, outputDir, fileExtension);
    }
}

/**
 * Método balanceado para Excel (calidad vs peso)
 */
async function convertExcelBalanced(documentPath, outputDir, fileExtension) {
    const fs = await import('fs');

    try {
        console.log('🔄 Usando método balanceado para Excel...');

        // Convertir a PDF primero con resolución balanceada
        const pdfCommand = `"${LIBREOFFICE_COMMAND}" --headless --norestore --nodefault --nologo --convert-to "pdf:calc_pdf_Export:{\\\"Quality\\\":{\\\"type\\\":\\\"long\\\",\\\"value\\\":90},\\\"ReduceImageResolution\\\":{\\\"type\\\":\\\"boolean\\\",\\\"value\\\":true},\\\"MaxImageResolution\\\":{\\\"type\\\":\\\"long\\\",\\\"value\\\":200}}" --outdir "${outputDir}" "${documentPath}"`;

        console.log('Convirtiendo Excel a PDF balanceado...');
        await execPromise(pdfCommand, { timeout: 60000 });

        const pdfFiles = readdirSync(outputDir).filter(file => file.endsWith('.pdf'));
        if (pdfFiles.length === 0) {
            throw new Error('No se pudo generar PDF desde Excel');
        }

        const generatedPdfPath = join(outputDir, pdfFiles[0]);
        console.log('✅ Excel convertido a PDF balanceado');

        // Convertir PDF a imágenes con densidad balanceada
        return await convertPDFToImagesBalanced(generatedPdfPath, outputDir);

    } catch (error) {
        console.error('Error en método balanceado Excel:', error);
        throw error;
    }
}

/**
 * Convertir PDF a imágenes con densidad balanceada para Excel
 */
async function convertPDFToImagesBalanced(pdfPath, outputDir) {
    const fs = await import('fs');

    try {
        console.log('🔄 Convirtiendo PDF de Excel con densidad balanceada...');

        // Densidad balanceada para Excel (200 DPI + resize moderado)
        const convertCommand = `"${CONVERT_COMMAND}" -density 200 -background white -alpha remove -alpha off -quality 90 -resize 125% "${pdfPath}" "${join(outputDir, 'excel-balanced-page-%d.png')}"`;
        await execPromise(convertCommand);

        // Leer archivos generados
        const files = readdirSync(outputDir)
            .filter(file => file.startsWith('excel-balanced-page-') && file.endsWith('.png'))
            .sort((a, b) => {
                const numA = parseInt(a.match(/excel-balanced-page-(\d+)\.png/)?.[1] || 0);
                const numB = parseInt(b.match(/excel-balanced-page-(\d+)\.png/)?.[1] || 0);
                return numA - numB;
            })
            .map(file => join(outputDir, file));

        console.log(`✅ PDF de Excel convertido a ${files.length} imagen(es) balanceadas`);
        return files;

    } catch (error) {
        console.error('Error convirtiendo PDF balanceado:', error);
        throw error;
    }
}

/**
 * Método alternativo para conversión de Excel
 */
async function convertExcelAlternative(documentPath, outputDir, fileExtension) {
    const fs = await import('fs');

    try {
        console.log('🔄 Usando método alternativo para Excel...');

        // Conversión directa simple
        const convertCommand = `"${LIBREOFFICE_COMMAND}" --headless --convert-to png --outdir "${outputDir}" "${documentPath}"`;
        await execPromise(convertCommand, { timeout: 60000 });

        const files = readdirSync(outputDir)
            .filter(file => file.endsWith('.png'))
            .sort()
            .map(file => join(outputDir, file));

        if (files.length === 0) {
            throw new Error('No se generaron imágenes');
        }

        console.log(`✅ Excel convertido simple a ${files.length} imagen(es)`);

        // Aplicar optimización balanceada
        return await optimizeExcelImagesBalanced(files, outputDir);

    } catch (error) {
        console.error('Error en método alternativo Excel:', error);
        throw new Error('No se pudo convertir el archivo Excel con ningún método');
    }
}

/**
 * Optimización balanceada para Excel
 */
async function optimizeExcelImagesBalanced(imagePaths, outputDir) {
    const fs = await import('fs');
    const optimizedPaths = [];

    for (let i = 0; i < imagePaths.length; i++) {
        const originalPath = imagePaths[i];
        const optimizedPath = join(outputDir, `balanced-excel-${i + 1}.png`);

        try {
            // Optimización balanceada para Excel
            const optimizeCommand = `"${CONVERT_COMMAND}" "${originalPath}" -resize 150% -sharpen 0x1 -quality 85 -strip "${optimizedPath}"`;
            await execPromise(optimizeCommand);

            optimizedPaths.push(optimizedPath);
            console.log(`✅ Imagen de Excel optimizada balanceada: ${i + 1}`);

        } catch (error) {
            console.error(`Error optimización balanceada ${i + 1}:`, error);
            optimizedPaths.push(originalPath);
        }
    }

    return optimizedPaths;
}

// ... (las otras funciones convertOfficeToImagesDirectly, convertViaPDF, convertPDFToImages, downloadDocument, etc. se mantienen igual) ...

/**
 * Convertir documentos de Office directamente a imágenes
 */
async function convertOfficeToImagesDirectly(documentPath, outputDir, fileExtension) {
    const fs = await import('fs');

    try {
        const convertCommand = `"${LIBREOFFICE_COMMAND}" --headless --convert-to png --outdir "${outputDir}" "${documentPath}"`;
        console.log('Ejecutando:', convertCommand);

        await execPromise(convertCommand);

        // Buscar archivos PNG generados
        const files = readdirSync(outputDir)
            .filter(file => file.endsWith('.png'))
            .sort()
            .map(file => join(outputDir, file));

        if (files.length === 0) {
            throw new Error('No se generaron imágenes');
        }

        console.log(`✅ ${fileExtension.toUpperCase()} convertido directamente a ${files.length} imagen(es)`);
        return files;

    } catch (error) {
        console.error('Error en conversión directa:', error);
        throw error;
    }
}

/**
 * Convertir mediante PDF (método de respaldo)
 */
async function convertViaPDF(documentPath, outputDir, fileExtension) {
    const fs = await import('fs');

    try {
        const pdfPath = join(outputDir, 'converted.pdf');

        console.log(`🔄 Convirtiendo ${fileExtension} a PDF...`);
        const libreofficeCommand = `"${LIBREOFFICE_COMMAND}" --headless --convert-to pdf:writer_pdf_Export --outdir "${outputDir}" "${documentPath}"`;
        await execPromise(libreofficeCommand);

        // Verificar si se generó el PDF
        const pdfFiles = readdirSync(outputDir).filter(file => file.endsWith('.pdf'));
        if (pdfFiles.length === 0) {
            throw new Error('No se pudo generar el PDF intermedio');
        }

        const generatedPdfPath = join(outputDir, pdfFiles[0]);
        console.log('✅ Documento convertido a PDF');

        // Convertir el PDF a imágenes
        return await convertPDFToImages(generatedPdfPath, outputDir);

    } catch (error) {
        console.error('Error en conversión via PDF:', error);
        throw new Error(`No se pudo convertir el documento ${fileExtension.toUpperCase()}`);
    }
}

/**
 * Convertir PDF a imágenes con fondo blanco
 */
async function convertPDFToImages(pdfPath, outputDir) {
    const fs = await import('fs');

    try {
        console.log('🔄 Convirtiendo PDF a imágenes con fondo blanco...');

        // Usar ImageMagick con fondo blanco explícito
        const convertCommand = `"${CONVERT_COMMAND}" -density 150 -background white -alpha remove -alpha off -quality 90 "${pdfPath}" "${join(outputDir, 'page-%d.png')}"`;
        await execPromise(convertCommand);

        // Leer archivos generados y ordenarlos
        const files = readdirSync(outputDir)
            .filter(file => file.startsWith('page-') && file.endsWith('.png'))
            .sort((a, b) => {
                const numA = parseInt(a.match(/page-(\d+)\.png/)?.[1] || 0);
                const numB = parseInt(b.match(/page-(\d+)\.png/)?.[1] || 0);
                return numA - numB;
            })
            .map(file => join(outputDir, file));

        console.log(`✅ PDF convertido a ${files.length} imagen(es) con fondo blanco`);
        return files;

    } catch (error) {
        console.error('Error convirtiendo PDF:', error);
        throw new Error('Error al convertir PDF a imágenes');
    }
}

/**
 * Descargar documento del mensaje
 */
async function downloadDocument(documentMessage) {
    try {
        const stream = await downloadContentFromMessage(documentMessage, 'document');
        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        return Buffer.concat(chunks);
    } catch (error) {
        console.error('Error descargando documento:', error);
        return null;
    }
}

/**
 * Función auxiliar para descargar contenido
 */
async function downloadContentFromMessage(message, type) {
    const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
    return downloadContentFromMessage(message, type);
}

/**
 * Limpieza de archivos temporales
 */
async function cleanupTempFiles(documentPath, tempDir) {
    try {
        if (documentPath && existsSync(documentPath)) {
            unlinkSync(documentPath);
        }
        if (tempDir && existsSync(tempDir)) {
            const fs = await import('fs');
            await fs.promises.rm(tempDir, { recursive: true, force: true });
            console.log('🧹 Archivos temporales eliminados');
        }
    } catch (cleanError) {
        console.warn('⚠️ Error en limpieza:', cleanError.message);
    }
}
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { writeFile, unlink, existsSync, mkdirSync, readFileSync } from 'fs';
import { promisify } from 'util';
import ffmpeg from 'fluent-ffmpeg';
import WebP from 'node-webpmux';
import sharp from 'sharp';

const { Image } = WebP;
const writeFileAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);

function getFfmpegPath() {
    return process.env.FFMPEG_PATH || 'ffmpeg';
}

class StickerToMediaService {
    constructor() {
        this.tempDir = './temp';
        ffmpeg.setFfmpegPath(getFfmpegPath());
        this.ensureTempDir();
    }

    ensureTempDir() {
        if (!existsSync(this.tempDir)) {
            mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async convertStickerToMedia(m, sock) {
        if (!m.message?.stickerMessage) {
            throw new Error('El mensaje no contiene un sticker');
        }

        const isAnimated = m.message.stickerMessage.isAnimated || false;

        const mediaBuffer = await downloadMediaMessage(m, 'buffer', {}, {
            logger: console,
            reuploadRequest: sock.updateMediaMessage
        });

        if (!mediaBuffer) {
            throw new Error('No se pudo descargar el sticker');
        }

        if (isAnimated) {
            return await this.convertAnimated(mediaBuffer);
        }
        return await this.convertStatic(mediaBuffer);
    }

    async convertStatic(stickerBuffer) {
        const tempInput = `${this.tempDir}/sticker_${Date.now()}.webp`;
        const tempOutput = `${this.tempDir}/image_${Date.now()}.jpg`;

        try {
            await writeFileAsync(tempInput, stickerBuffer);

            await new Promise((resolve, reject) => {
                ffmpeg(tempInput)
                    .output(tempOutput)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });

            if (!existsSync(tempOutput)) {
                throw new Error('No se generó la imagen');
            }

            const imageBuffer = readFileSync(tempOutput);
            await this.cleanup([tempInput, tempOutput]);

            return { buffer: imageBuffer, type: 'image', mimetype: 'image/jpeg' };
        } catch {
            return await this.convertStaticSimple(stickerBuffer);
        }
    }

    async convertAnimated(stickerBuffer) {
        let tempGif, tempMp4;

        try {
            const gifBuffer = await sharp(stickerBuffer, { animated: true })
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toFormat('gif')
                .toBuffer();

            tempGif = `${this.tempDir}/animated_${Date.now()}.gif`;
            tempMp4 = `${this.tempDir}/video_${Date.now()}.mp4`;
            await writeFileAsync(tempGif, gifBuffer);

            await new Promise((resolve, reject) => {
                ffmpeg(tempGif)
                    .inputOptions(['-ignore_loop 0'])
                    .outputOptions([
                        '-c:v libx264',
                        '-pix_fmt yuv420p',
                        '-movflags +faststart',
                        '-r 15',
                        '-crf 28',
                        '-preset ultrafast',
                        '-t 8'
                    ])
                    .output(tempMp4)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });

            if (!existsSync(tempMp4)) {
                throw new Error('No se generó el video');
            }

            const videoBuffer = readFileSync(tempMp4);
            await this.cleanup([tempGif, tempMp4]);

            return { buffer: videoBuffer, type: 'video', mimetype: 'video/mp4' };
        } catch (error) {
            await this.cleanup([tempGif, tempMp4].filter(Boolean));

            try {
                const gifBuffer = await sharp(stickerBuffer, { animated: true })
                    .toFormat('gif')
                    .toBuffer();
                return { buffer: gifBuffer, type: 'image', mimetype: 'image/gif' };
            } catch {
                throw new Error(`No se pudo convertir el sticker: ${error.message}`);
            }
        }
    }

    async convertStaticSimple(stickerBuffer) {
        const tempFile = `${this.tempDir}/simple_${Date.now()}.webp`;
        await writeFileAsync(tempFile, stickerBuffer);

        const img = new Image();
        await img.load(tempFile);
        const frameBuffer = await img.frames[0].toBuffer('image/png');
        await this.cleanup([tempFile]);

        return { buffer: frameBuffer, type: 'image', mimetype: 'image/png' };
    }

    async cleanup(files) {
        for (const file of files) {
            if (file && existsSync(file)) {
                try { await unlinkAsync(file); } catch {}
            }
        }
    }
}

const service = new StickerToMediaService();

export async function stickerToMediaCommand(sock, m) {
    try {
        let target = m;

        if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            target = {
                ...m,
                message: m.message.extendedTextMessage.contextInfo.quotedMessage
            };
        }

        if (!target.message?.stickerMessage) {
            await sock.sendMessage(m.key.remoteJid, {
                text: 'Responde a un sticker con #sm'
            }, { quoted: m });
            return;
        }

        const result = await service.convertStickerToMedia(target, sock);

        const options = {};
        if (result.type === 'image') {
            options.image = result.buffer;
            options.mimetype = result.mimetype;
        } else {
            options.video = result.buffer;
            options.mimetype = result.mimetype;
        }

        await sock.sendMessage(m.key.remoteJid, options, { quoted: m });

    } catch (error) {
        console.error('Error in stickerToMedia:', error.message);
        await sock.sendMessage(m.key.remoteJid, {
            text: `Error: ${error.message}`
        }, { quoted: m });
    }
}

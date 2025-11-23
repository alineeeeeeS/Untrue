FROM node:20-alpine

# Instalar dependencias del sistema CRÍTICAS para tu bot
RUN apk update && apk add --no-cache \
    ffmpeg \
    python3 \
    yt-dlp \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    libjpeg-turbo-dev \
    giflib-dev \
    librsvg \
    ghostscript \
    imagemagick \
    libreoffice \
    tesseract-ocr \
    tesseract-ocr-data-spa \
    tesseract-ocr-data-eng

# Crear symlinks para compatibilidad con rutas antiguas de Replit
RUN mkdir -p /home/runner/workspace/.pythonlibs/bin && \
    ln -sf /usr/bin/yt-dlp /home/runner/workspace/.pythonlibs/bin/yt-dlp && \
    mkdir -p /home/runner/workspace/node_modules/ffmpeg-static && \
    ln -sf /usr/bin/ffmpeg /home/runner/workspace/node_modules/ffmpeg-static/ffmpeg

WORKDIR /app

# Copiar package.json primero para mejor cache
COPY package*.json ./
RUN npm install

# Copiar todo el código
COPY . .

# Crear carpetas necesarias para el bot
RUN mkdir -p sessions temp logs assets

EXPOSE 3000

CMD ["npm", "start"]

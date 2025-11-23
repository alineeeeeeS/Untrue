FROM node:20-alpine

# Instalar dependencias del sistema CRÍTICAS para tu bot
RUN apk update && apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
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

# Instalar yt-dlp para descargas de videos
RUN pip3 install yt-dlp

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

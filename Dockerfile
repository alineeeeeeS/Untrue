FROM node:18-alpine

# Instalar dependencias del sistema
RUN apk update && apk add --no-cache \
    ffmpeg \
    python3 \
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

WORKDIR /app

# Copiar package.json primero para mejor cache
COPY package*.json ./
RUN npm install

# Copiar todo el código
COPY . .

# Crear carpetas necesarias
RUN mkdir -p sessions temp logs assets

EXPOSE 3000

CMD ["npm", "start"]

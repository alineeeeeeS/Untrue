FROM node:18-alpine

# Instalar dependencias del sistema CRÍTICAS para tu bot
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    libjpeg-turbo-dev \
    giflib-dev \
    librsvg \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copiar package.json primero para mejor cache
COPY package*.json ./
RUN npm install --production

# Copiar todo el código
COPY . .

# Crear carpetas necesarias para el bot
RUN mkdir -p sessions temp logs assets

EXPOSE 3000

CMD ["npm", "start"]
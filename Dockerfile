FROM node:20-alpine

RUN apk update && apk add --no-cache git
RUN npm install -g npm@latest

# Instalar dependencias CRÍTICAS
RUN apk update && apk add --no-cache \
    ffmpeg \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    libjpeg-turbo-dev \
    giflib-dev \
    wget \
    libreoffice \
    imagemagick \
    ghostscript \
    ttf-freefont \
    openjdk11-jre

# DESCARGAR YT-DLP MÁS RECIENTE DIRECTAMENTE
RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Crear symlinks para compatibilidad
RUN mkdir -p /home/runner/workspace/.pythonlibs/bin && \
    ln -sf /usr/local/bin/yt-dlp /home/runner/workspace/.pythonlibs/bin/yt-dlp && \
    ln -sf /usr/local/bin/yt-dlp /usr/bin/yt-dlp && \
    mkdir -p /home/runner/workspace/node_modules/ffmpeg-static && \
    ln -sf /usr/bin/ffmpeg /home/runner/workspace/node_modules/ffmpeg-static/ffmpeg

# Configurar políticas de ImageMagick para permitir PDF
RUN echo "<policymap>" > /etc/ImageMagick-7/policy.xml && \
    echo "<policy domain=\"coder\" rights=\"read|write\" pattern=\"PDF\" />" >> /etc/ImageMagick-7/policy.xml && \
    echo "<policy domain=\"coder\" rights=\"read|write\" pattern=\"LABEL\" />" >> /etc/ImageMagick-7/policy.xml && \
    echo "</policymap>" >> /etc/ImageMagick-7/policy.xml

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p sessions temp logs assets

EXPOSE 3000

CMD ["npm", "start"]

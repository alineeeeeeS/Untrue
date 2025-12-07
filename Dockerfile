FROM node:20-slim

# Instalamos las dependencias CRÍTICAS (Ahora usando 'apt' de Debian)
RUN apt update && apt install -y --no-install-recommends \
    # Dependencias de compilación básicas (incluye make, g++, etc.)
    build-essential \
    python3 \
    # Librerías de desarrollo para Canvas
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    libfreetype6-dev \
    librsvg2-dev \
    # Otros paquetes del bot
    ffmpeg \
    wget \
    libreoffice \
    imagemagick \
    ghostscript \
    # Fuentes y Java (CORRECCIÓN APLICADA: Usamos el JRE por defecto)
    fonts-freefont-ttf \
    default-jre-headless \
    # Limpiar caché de apt
    && rm -rf /var/lib/apt/lists/*

# DESCARGAR YT-DLP MÁS RECIENTE DIRECTAMENTE
RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Crear symlinks para compatibilidad
RUN mkdir -p /home/runner/workspace/.pythonlibs/bin && \
    ln -sf /usr/local/bin/yt-dlp /home/runner/workspace/.pythonlibs/bin/yt-dlp && \
    ln -sf /usr/local/bin/yt-dlp /usr/bin/yt-dlp && \
    mkdir -p /home/runner/workspace/node_modules/ffmpeg-static && \
    ln -sf /usr/bin/ffmpeg /home/runner/workspace/node_modules/ffmpeg-static/ffmpeg

# Configurar políticas de ImageMagick para permitir PDF (usando sed para editar el archivo de política)
RUN POLICY_FILE=$(find /etc/ImageMagick-* -name policy.xml | head -n 1) ; \
    if [ ! -z "$POLICY_FILE" ]; then \
        # Elimina la línea que restringe el uso de PDF
        sed -i '/<policy domain="coder" rights="none" pattern="PDF" \/>/d' "$POLICY_FILE" ; \
        # Elimina la línea que restringe el uso de LABEL
        sed -i '/<policy domain="coder" rights="none" pattern="LABEL" \/>/d' "$POLICY_FILE" ; \
    fi

WORKDIR /app

COPY package*.json ./

# La instalación de Canvas ahora debería funcionar gracias al cambio de Alpine a Slim/Debian
RUN npm install

COPY . .

RUN mkdir -p sessions temp logs assets

EXPOSE 3000

CMD ["npm", "start"]
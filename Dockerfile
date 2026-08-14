FROM node:20-slim

# dependencias críticas
RUN apt update && apt install -y --no-install-recommends \
    git \
    build-essential \
    python3 \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    libfreetype6-dev \
    librsvg2-dev \
    ffmpeg \
    wget \
    libreoffice \
    imagemagick \
    ghostscript \
    fonts-freefont-ttf \
    default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp descargado directo
RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# symlinks para compatibilidad
RUN mkdir -p /home/runner/workspace/.pythonlibs/bin && \
    ln -sf /usr/local/bin/yt-dlp /home/runner/workspace/.pythonlibs/bin/yt-dlp && \
    ln -sf /usr/local/bin/yt-dlp /usr/bin/yt-dlp && \
    mkdir -p /home/runner/workspace/node_modules/ffmpeg-static && \
    ln -sf /usr/bin/ffmpeg /home/runner/workspace/node_modules/ffmpeg-static/ffmpeg

# políticas de imagemagick para permitir pdf
RUN POLICY_FILE=$(find /etc/ImageMagick-* -name policy.xml | head -n 1) ; \
    if [ ! -z "$POLICY_FILE" ]; then \
        sed -i '/<policy domain="coder" rights="none" pattern="PDF" \/>/d' "$POLICY_FILE" ; \
        sed -i '/<policy domain="coder" rights="none" pattern="LABEL" \/>/d' "$POLICY_FILE" ; \
    fi

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN mkdir -p sessions temp logs assets

EXPOSE 3000

CMD ["npm", "start"]

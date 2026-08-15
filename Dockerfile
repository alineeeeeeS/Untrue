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
    curl \
    ca-certificates \
    libopus0 \
    libvpx7 \
    && rm -rf /var/lib/apt/lists/*

# symlinks para compatibilidad
RUN mkdir -p /home/runner/workspace/.pythonlibs/bin && \
    mkdir -p /home/runner/workspace/node_modules/ffmpeg-static && \
    ln -sf /usr/bin/ffmpeg /home/runner/workspace/node_modules/ffmpeg-static/ffmpeg && \
    ln -sf /usr/bin/ffmpeg /usr/local/bin/ffmpeg

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

RUN mkdir -p sessions temp logs assets /tmp && \
    chmod -R 777 /tmp

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["npm", "start"]

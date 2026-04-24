# Build / test environment for Fathom's JS & native layers. Not a runtime.
# See docs/DOCKER.md for details.

FROM node:22-bookworm

# Electron's native-module rebuilds (better-sqlite3) want a C++ toolchain and
# python. git is pulled in for npm's git-dep resolution.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      python3 \
      pkg-config \
      git \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Electron itself needs X11 / GTK sonames to even load, even when we're only
# running npm scripts that don't open a window. These let `npm install` and
# `npm run build` finish inside the container.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libx11-6 libxkbfile1 libsecret-1-0 libgtk-3-0 libnss3 libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Cache deps separately from source for faster iteration.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

# Copy runtime pdf.js assets the renderer expects at /pdfjs-*.
RUN npm run copy-pdfjs-assets || true

CMD ["bash"]

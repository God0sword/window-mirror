FROM ubuntu:24.04 AS builder

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libssl-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app
COPY . .

WORKDIR /app/src-tauri
RUN cargo build --release

FROM ubuntu:24.04
RUN apt-get update && apt-get install -y \
    libwebkit2gtk-4.1-0 \
    libgtk-3-0 \
    libayatana-appindicator3-1 \
    librsvg2-2 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/src-tauri/target/release/window-mirror /usr/local/bin/window-mirror

ENTRYPOINT ["window-mirror"]
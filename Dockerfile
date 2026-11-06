FROM oven/bun:1-slim
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY public ./public
ENV DB_PATH=/data/store.db
CMD ["bun", "run", "src/index.ts"]

# executa app sem privilegio (DS-0002)
RUN groupadd -g 10001 app && useradd -u 10001 -m -g app -s /bin/sh app
USER app

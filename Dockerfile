FROM oven/bun:1-slim
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
ENV DB_PATH=/data/store.db
CMD ["bun", "run", "src/index.ts"]

FROM oven/bun:1.2-alpine
WORKDIR /app
# The lockfile is written by a newer Bun locally; resolve dependencies from package.json here.
COPY package.json ./
RUN bun install --production
COPY . .
RUN rm -f bun.lock
ENV NODE_ENV=production
CMD ["bun", "server.ts"]

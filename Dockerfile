FROM oven/bun:1.2-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production
CMD ["bun", "server.ts"]

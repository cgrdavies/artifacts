FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
COPY client/ ./client/
COPY scripts/ ./scripts/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
RUN mkdir -p /app/data
EXPOSE 3000
ENV DB_PATH=/app/data/artifacts.db
CMD ["node", "dist/index.js"]

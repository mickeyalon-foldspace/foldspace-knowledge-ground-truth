FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src/server ./src/server

RUN npx tsc

EXPOSE 3001

CMD ["node", "dist/server/index.js"]

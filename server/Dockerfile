FROM node:18-slim

RUN apt-get update && apt-get install -y default-jdk-headless && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3001
CMD ["node", "index.js"]

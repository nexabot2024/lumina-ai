FROM node:18-alpine

WORKDIR /app

# Binarios requeridos por la edición, compilación y descarga de vídeo. Alpine y
# Node publican imágenes multi-arquitectura, por lo que Docker Desktop usará ARM64
# automáticamente en Apple Silicon.
RUN apk add --no-cache ffmpeg python3 py3-pip make g++ \
  && pip3 install --no-cache-dir --break-system-packages yt-dlp

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]

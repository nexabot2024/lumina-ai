# Ejecutar Lumina AI en Mac (local)

Guía para correr el sistema de forma nativa en un Mac, igual que en Windows —
sin depender de ningún servidor remoto. El backend y el frontend corren los dos en
tu propia máquina.

## 1. Herramientas necesarias

Con [Homebrew](https://brew.sh) instalado:

```bash
brew install node ffmpeg yt-dlp
```

Opcional, solo si vas a usar subtítulos automáticos (`capcut-cli caption`) o la
exportación a CapCut:

```bash
brew install openai-whisper
```

## 2. Clonar el proyecto

```bash
git clone https://github.com/nexabot2024/lumina-ai.git
cd lumina-ai
```

## 3. Configurar las claves

```bash
cp backend/.env.example backend/.env
```

Abre `backend/.env` y rellena las claves que vayas a usar (`ANTHROPIC_API_KEY`,
`AI33PRO_API_KEY`/`AI84PRO_API_KEY` para la voz, `PIXABAY_API_KEY`/`PEXELS_API_KEY`
y `BRAVE_API_KEY` para buscar material). No hace falta tocar `FFMPEG_PATH` ni
`YTDLP_PATH` — en Mac el sistema los encuentra solo en el PATH una vez instalados
con Homebrew.

**Nota:** este repo no incluye NanoBanana/SnapGen (generación de imágenes/video por
IA vía G-Labs) — esa parte dependía de una app de Windows (`G-LabsAutomation.exe`)
sin equivalente en Mac, así que se quitó del sistema entero, no solo de esta guía.

## 4. Arrancar

```bash
bash iniciar-sistema-mac.sh
```

Ese script instala las dependencias de `backend/` y `frontend/` la primera vez
(con `npm install` — las reinstala en vez de copiarlas desde Windows, porque la
base de datos SQLite usa un módulo nativo que hay que compilar para cada sistema
operativo) y levanta los dos servidores a la vez.

Abre **http://localhost:5174**.

## Alternativa: Docker Desktop

Si prefieres no instalar nada a mano:

```bash
docker compose up --build
```

Carga las claves desde `backend/.env` y persiste `uploads`/`outputs` en el
proyecto. Las imágenes corren nativas en ARM64 en Apple Silicon.

## Nota de rendimiento

La edición de video usa FFmpeg. En Windows el sistema detecta Quick Sync de Intel
para acelerar por hardware; en Apple Silicon no se usa esa ruta y se cae a CPU
(VideoToolbox no está integrado todavía) — los trabajos largos (Secuencia de
Imágenes, Cola de Edición) tardarán más que en el PC hasta que se añada ese
perfil.

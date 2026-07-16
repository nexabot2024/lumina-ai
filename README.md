# 🎬 AI Video Generator

Sistema profesional para crear videos, imágenes y audio con inteligencia artificial. Interfaz moderna con colores vibrantes, integración de APIs de IA y búsqueda de videos de stock.

## ✨ Características

- **🎨 Generador de Imágenes**: DALL-E 3 y Stable Diffusion
- **🔊 Generador de Audio**: AI33Pro (TTS profesional)
- **📹 Videos de Stock**: Integración Pixabay + Pexels
- **✍️ Parser Automático**: Crea prompts por párrafo del guion
- **💎 UI Moderna**: Colores llamativos con glasmorphism
- **🚀 Full Stack**: React + TypeScript + Node.js + Express

## 🏗️ Arquitectura

```
ai-video-generator/
├── backend/                  # API Node.js + Express
│   ├── src/
│   │   ├── services/        # Lógica de APIs (IA, stock)
│   │   ├── routes/          # Endpoints REST
│   │   ├── utils/           # Utilidades
│   │   └── server.ts        # Servidor principal
│   └── uploads/             # Archivos generados
│
└── frontend/                # React + TypeScript + Vite
    ├── src/
    │   ├── components/      # Componentes reutilizables
    │   ├── pages/          # Páginas principales
    │   ├── services/       # Servicios HTTP
    │   └── styles/         # CSS global + Tailwind
    └── index.html
```

## 🚀 Setup Rápido

### Prerequisites
- Node.js 18+
- npm o yarn

### 1. Backend Setup

```bash
cd backend
npm install

# Crear archivo .env
cp .env.example .env

# Configurar variables
# - OPENAI_API_KEY=sk-...
# - AI33PRO_API_KEY=...
# - PIXABAY_API_KEY=...
# - PEXELS_API_KEY=...

# Iniciar servidor
npm run dev
# Servidor en http://localhost:5000
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
# App en http://localhost:5173
```

## 🔑 APIs Requeridas

### 1. **OpenAI (Generación de Prompts)**
- Crea cuenta en https://platform.openai.com
- API Key: `OPENAI_API_KEY`
- Precio: Pay-as-you-go (~$0.03 por prompt)

### 2. **DALL-E 3 (Imágenes)**
- Incluida en OpenAI API
- $0.04 por imagen HD (1024x1024)

### 3. **AI33Pro (Audio TTS)**
- API Key: `AI33PRO_API_KEY`
- Precio: Varía según plan

### 4. **Pixabay (Videos/Imágenes Stock)**
- API Key gratuita: https://pixabay.com/api/
- Completamente gratis

### 5. **Pexels (Videos/Imágenes Stock)**
- API Key gratuita: https://www.pexels.com/api/
- Completamente gratis

## 📖 Cómo Usar

### Workflow Típico

1. **Carga tu Guion**
   - Sube un archivo `.txt` o pega tu guion
   - El sistema separa automáticamente por párrafos

2. **Genera Prompts**
   - Elige estilo (cinemático, fotorrealista, etc.)
   - Elige tono (profesional, casual, dramático)
   - Click en "Generar Prompts"
   - Sistema crea automáticamente 1 prompt por párrafo

3. **Personaliza Prompts**
   - Edita cualquier prompt si necesitas
   - Copia prompts al portapapeles
   - Mejora con botón "Mejorar Prompts"

4. **Genera Imágenes**
   - Selecciona prompts individuales o todos
   - Elige servicio (DALL-E recomendado)
   - Click "Generar" o "Generar Lote"
   - Descarga imágenes cuando estén listas

5. **Genera Audio**
   - Ajusta: voz, velocidad, idioma
   - Genera audio individual o por lotes
   - Escucha preview y descarga

6. **Busca Videos de Stock**
   - Busca palabras clave relevantes
   - Filtra por fuente (Pixabay/Pexels)
   - Descarga videos para intercalar

## 🎨 Personalización de Colores

Edita `frontend/tailwind.config.js`:

```js
colors: {
  primary: { /* Morado */ },
  accent: { /* Rosa */ },
  gradient: { /* Gradientes */ },
}
```

## 📁 Estructura de Prompts Generados

Cada prompt contiene:

```json
{
  "id": "prompt-1",
  "section": 1,
  "text": "Texto original del guion",
  "imagePrompt": "Descripción detallada para IA",
  "videoKeywords": ["keyword1", "keyword2"]
}
```

## 🔌 Endpoints API

### Prompts
- `POST /api/prompts/parse` - Parsear guion y generar prompts
- `POST /api/prompts/enhance` - Mejorar un prompt
- `POST /api/prompts/batch-enhance` - Mejorar múltiples prompts

### Imágenes
- `POST /api/images/generate` - Generar imagen individual
- `POST /api/images/batch` - Generar lote de imágenes

### Audio
- `POST /api/audio/generate` - Generar audio
- `POST /api/audio/batch` - Generar lote de audio
- `GET /api/audio/voices` - Listar voces disponibles

### Videos Stock
- `POST /api/videos/search-videos` - Buscar videos
- `POST /api/videos/search-images` - Buscar imágenes de stock
- `POST /api/videos/search-stock` - Buscar por palabras clave

## 🛠️ Troubleshooting

### Error: "No API Key"
```bash
# Verifica que .env existe y tiene las variables
cat backend/.env
```

### Error: CORS
```bash
# Verifica que FRONTEND_URL está correcto en .env
FRONTEND_URL=http://localhost:5173
```

### Timeout en generación de imágenes
- Los primeros requests pueden tardar 30-60s
- Es normal, espera a que Complete

### Videos no se descargan
- Verifica que tienes internet activo
- Algunos navegadores necesitan permitir descargas

## 📊 Costos Estimados

| Servicio | Precio | Uso Típico |
|----------|--------|-----------|
| OpenAI Prompts | $0.03/c | 100 prompts = $3 |
| DALL-E Imágenes | $0.04/img | 50 imágenes = $2 |
| AI33Pro Audio | Variable | Depende plan |
| Pixabay/Pexels | Gratis | ∞ |
| **Total aproximado** | **$5-10** | **Proyecto 1hr video** |

## 🚀 Deployment

### Docker (Próximamente)
```bash
docker-compose up
```

### Vercel (Frontend)
```bash
vercel deploy frontend
```

### Heroku (Backend)
```bash
cd backend
heroku create
git push heroku main
```

## 📝 Licencia

MIT - Libre para usar y modificar

## 🤝 Contribuciones

Pull requests bienvenidos. Para cambios mayores, abre un issue primero.

## 📞 Soporte

- Docs: Ver `/docs`
- Issues: GitHub Issues
- Email: nexabot.2024@gmail.com

---

**Hecho con ❤️ y mucha IA**

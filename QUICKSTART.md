# ⚡ Quick Start - AI Video Generator

## 📦 Instalación en 5 minutos

### Paso 1: Clonar y entrar
```bash
cd ai-video-generator
```

### Paso 2: Instalar dependencias
```bash
npm run setup
```

### Paso 3: Configurar APIs

#### Backend .env
```bash
cd backend
cp .env.example .env
```

**Edita `backend/.env`:**
```
OPENAI_API_KEY=sk-your-key-here
AI33PRO_API_KEY=your-api-key
PIXABAY_API_KEY=your-free-key
PEXELS_API_KEY=your-free-key
```

**Dónde obtener las keys:**
- 🔑 OpenAI: https://platform.openai.com/api-keys
- 🎤 AI33Pro: Tu panel de control
- 📷 Pixabay: https://pixabay.com/api/ (Free)
- 📷 Pexels: https://www.pexels.com/api/ (Free)

### Paso 4: Iniciar

**Opción A: Terminal única (requiere concurrently)**
```bash
npm install -g concurrently
npm run dev
```

**Opción B: Dos terminales**
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

### ✅ Listo
- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Health check: http://localhost:5000/api/health

---

## 🎬 Primer Video en 10 minutos

### 1. Carga tu Guion (30 seg)
```
Pestaña "Guion" → Pega tu texto
```

**Ejemplo guion:**
```
La inteligencia artificial es el futuro de la tecnología.

Permite automatizar tareas complejas y tomar decisiones más rápido.

Desde medicina hasta entretenimiento, la IA está transformando todo.
```

### 2. Genera Prompts (1 min)
```
Pestaña "Prompts" → Elige estilo + tono → Click "Generar Prompts"
```

El sistema automáticamente crea prompts visuales para cada párrafo.

### 3. Genera Imágenes (3-5 min)
```
Pestaña "Imágenes" → Selecciona prompts → Click "Generar Lote"
```

Espera a que DALL-E genere las imágenes (primera vez ~30s por imagen).

### 4. Genera Audio (2-3 min)
```
Pestaña "Audio" → Ajusta voz/velocidad → Click "Generar Todo"
```

AI33Pro crea audio profesional de tu guion.

### 5. Busca Videos Stock (1 min)
```
Pestaña "Videos Stock" → Busca "naturaleza" → Descarga videos
```

Intercala videos de Pixabay/Pexels entre tus imágenes.

### 🎬 ¡Listo para editar!
Tienes:
- ✅ Imágenes generadas con IA
- ✅ Audio profesional
- ✅ Videos de stock gratuitos

Usa FFmpeg o tu editor favorito (DaVinci Resolve, Adobe Premiere) para compilar.

---

## 🎨 Personalizar Colores

### Cambiar paleta de colores
Edita `frontend/tailwind.config.js`:

```js
colors: {
  primary: {
    600: '#FF6B35',  // Tu color principal
  },
  accent: {
    500: '#004E89',  // Tu color secundario
  },
}
```

Recarga el navegador y ¡listo!

---

## 🔥 Tips Pro

### 💡 Mejores Prompts
```
Malo:   "Paisaje bonito"
Bueno: "Paisaje montañoso cinemático, luz dorada al atardecer, 
        estilo película IMAX, ultra HD 4K, profesional"
```

### 💰 Ahorrar dinero
- Usa DALL-E solo para imágenes principales
- Complementa con Pixabay/Pexels (gratis)
- Reutiliza imágenes en múltiples videos

### ⚡ Más rápido
- Genera prompts en lote
- Genera imágenes en lote
- Genera audios en lote
- ¡El paralelismo es tu amigo!

---

## ❌ Troubleshooting Rápido

| Problema | Solución |
|----------|----------|
| "API Key error" | Verifica `backend/.env` existe y tiene las keys |
| CORS error | Recarga la página, limpia caché |
| Imagen tarda mucho | Normal, DALL-E tarda 30-60s primera vez |
| Audio no se descarga | Verifica que tienes conexión activa |
| Frontend no carga | ¿Corriste `cd frontend && npm install`? |

---

## 📚 Guía Completa

Ver [README.md](./README.md) para documentación detallada.

---

**¡A crear videos increíbles! 🚀**

# 📥 Instalación de FFmpeg - Guía Rápida

## ⚡ Forma más Rápida (2 minutos)

### Paso 1: Descarga el archivo
**Haz clic aquí:** https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full.zip

El archivo se descargará automáticamente (~150 MB)

### Paso 2: Extrae en C:\ffmpeg

1. Abre **Explorador de Archivos**
2. Ve a tu carpeta **Descargas**
3. Busca `ffmpeg-release-full.zip`
4. Haz **click derecho** → **Extraer todo...**
5. Escribe: `C:\ffmpeg`
6. Haz click en **Extraer**

Espera a que termine (1-2 min)

### Paso 3: Verifica la estructura

Abre PowerShell y ejecuta:
```powershell
dir C:\ffmpeg\bin\ffmpeg.exe
```

Deberías ver:
```
Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        16/07/2026  12:00 PM    12345678 ffmpeg.exe
```

✅ **¡FFmpeg instalado!**

---

## 🔧 Agregar al PATH (Opcional pero recomendado)

Esto permite usar `ffmpeg` desde cualquier lugar en PowerShell.

### Opción A: Automático (1 click)

Abre PowerShell **como Administrador** y ejecuta:

```powershell
setx PATH "C:\ffmpeg\bin;%PATH%"
```

Luego reinicia PowerShell completamente (cierra y abre de nuevo).

Verifica:
```powershell
ffmpeg -version
```

### Opción B: Manual

1. Presiona `Win + X` → **Sistema**
2. Busca **"Variables de entorno"** → Click
3. Click en **"Variables de entorno"**
4. Click en **"Nuevo..."** en "Variables del sistema"
5. Nombre: `FFMPEG_PATH`
6. Valor: `C:\ffmpeg\bin`
7. Click **OK**

Reinicia PowerShell y verifica:
```powershell
ffmpeg -version
```

---

## ✅ Verificación Final

En PowerShell, ejecuta:

```powershell
ffmpeg -version
```

Deberías ver algo como esto:

```
ffmpeg version 6.0 Copyright (c) 2000-2023 the FFmpeg developers
  built with gcc 12.2.0 (GCC)
...
```

Si ves eso, ✅ **¡FFmpeg está listo!**

---

## ❓ ¿Problemas?

### "ffmpeg: no se reconoce..."

Significa que FFmpeg **no está en el PATH** todavía.

**Solución:**
```powershell
# Cierra PowerShell completamente
# Abre una NUEVA ventana de PowerShell
# Y ejecuta:
ffmpeg -version
```

Si sigue sin funcionar:
```powershell
# Usa la ruta completa:
C:\ffmpeg\bin\ffmpeg.exe -version
```

### "No se encontró C:\ffmpeg"

Asegúrate de que:
1. El archivo se extrajo en `C:\ffmpeg` (no en carpeta Descargas)
2. Adentro existe: `C:\ffmpeg\bin\ffmpeg.exe`

Verifica:
```powershell
Test-Path "C:\ffmpeg\bin\ffmpeg.exe"
```

Deberías ver: `True`

### El archivo ZIP no se extrae

Intenta:
1. Click derecho en el ZIP
2. **Extraer todo...**
3. Escribe exactamente: `C:\ffmpeg`
4. Marca **"Mostrar archivos extraídos cuando se complete"**

O usa PowerShell:
```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\ffmpeg-release-full.zip" -DestinationPath "C:\ffmpeg" -Force
```

---

## 🎉 Una vez instalado

Tu proyecto está **100% listo** para crear videos:

```bash
cd "C:\Users\danir\.claude\ai-video-generator"

# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev

# Abre: http://localhost:5173
```

**¡Listo para crear videos!** 🚀

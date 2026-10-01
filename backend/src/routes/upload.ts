import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';

const router = Router();

const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

// Crear directorio si no existe
const ensureUploadDir = async () => {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
  } catch (error) {
    console.error('Error creating upload directory:', error);
  }
};

ensureUploadDir();

// Get real duration from media files
async function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.warn(`⚠️ Could not detect duration for ${path.basename(filePath)}: ${err.message}`);
        resolve(0); // Return 0 if unable to detect
        return;
      }

      const duration = metadata.format?.duration || 0;
      resolve(Math.round(duration * 10) / 10); // Round to 1 decimal
    });
  });
}

// Busboy (usado por multer) decodifica el nombre del archivo del multipart/form-data
// como latin1 por defecto, aunque el navegador lo mande en UTF-8 — con nombres con
// acentos o símbolos ("¡", "ñ", etc.) esto corrompe el texto de forma silenciosa
// ("¡" termina como "Â¡"), y ese nombre corrupto queda grabado en disco para siempre.
// Se re-decodifica reinterpretando los bytes como UTF-8 real.
function fixFilenameEncoding(originalname: string): string {
  return Buffer.from(originalname, 'latin1').toString('utf8');
}

// Configurar multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const filename = `${timestamp}-${fixFilenameEncoding(file.originalname)}`;
    cb(null, filename);
  },
});

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '', 10) || 5 * 1024 * 1024 * 1024; // 5GB por defecto

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    // Acepta cualquier imagen/video/audio por categoría general en vez de mantener
    // una lista de formatos específicos, que queda desactualizada con cada formato
    // nuevo (avif, heic, etc.) que agregan las cámaras/apps.
    const isMedia = /^(image|video|audio)\//.test(file.mimetype);

    if (isMedia) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no soportado: ${file.mimetype}`));
    }
  },
});

// Formatos de imagen que los binarios de ffmpeg disponibles (el de G-Labs y el del
// sistema) no saben decodificar de forma fiable. En vez de esperar a que la
// compilación del video falle más adelante, se normalizan a PNG aquí mismo, justo
// después de subir — así el resto del pipeline nunca depende del formato original.
const FFMPEG_UNFRIENDLY_IMAGE_TYPES = new Set([
  'image/avif',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Algunos orígenes remotos o descargas interrumpidas llegan al navegador como
    // un archivo de 0 bytes. Multer puede guardarlo sin error, pero FFmpeg falla más
    // tarde con "Invalid data found". Se rechaza aquí para que el usuario pueda
    // volver a descargar/subir el archivo correcto antes de iniciar un render largo.
    if (req.file.size === 0) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        error: 'El archivo está vacío (0 bytes). Vuelve a descargarlo o selecciónalo de nuevo.',
      });
    }

    const fileType = req.file.mimetype.startsWith('video/')
      ? 'video'
      : req.file.mimetype.startsWith('image/')
      ? 'image'
      : 'audio';

    let filename = req.file.filename;
    let fullPath = path.join(uploadDir, filename);
    let originalName = fixFilenameEncoding(req.file.originalname);

    // Verificación de integridad para toda imagen, no solo AVIF/HEIC. `accept`
    // y el MIME del navegador no garantizan que el contenido sea realmente una imagen.
    if (fileType === 'image') {
      try {
        const metadata = await sharp(fullPath).metadata();
        if (!metadata.width || !metadata.height) {
          throw new Error('Imagen sin dimensiones válidas');
        }
      } catch (validationError) {
        await fs.unlink(fullPath).catch(() => {});
        return res.status(400).json({
          error: 'La imagen está dañada o no contiene datos de imagen válidos. Descárgala de nuevo e inténtalo otra vez.',
        });
      }
    }

    if (fileType === 'image' && FFMPEG_UNFRIENDLY_IMAGE_TYPES.has(req.file.mimetype)) {
      const convertedFilename = `${filename.replace(/\.[^.]+$/, '')}.png`;
      const convertedPath = path.join(uploadDir, convertedFilename);
      try {
        await sharp(fullPath).png().toFile(convertedPath);
        await fs.unlink(fullPath);
        filename = convertedFilename;
        fullPath = convertedPath;
        originalName = originalName.replace(/\.[^.]+$/, '.png');
        console.log(`🔄 Convertido ${req.file.mimetype} → PNG: ${filename}`);
      } catch (conversionError) {
        console.error(`Error convirtiendo ${req.file.originalname} a PNG:`, conversionError);
        return res.status(400).json({
          error: `No se pudo procesar la imagen (${req.file.mimetype}). El archivo puede estar dañado.`,
        });
      }
    }

    const filePath = `/uploads/${filename}`;

    // Get real duration for video/audio files
    let duration: number | undefined;
    if (fileType === 'video' || fileType === 'audio') {
      duration = await getMediaDuration(fullPath);
      if (duration && duration > 0) {
        console.log(`⏱️ ${fileType} duration detected: ${duration}s`);
      }
    }

    res.json({
      success: true,
      file: {
        name: originalName,
        type: fileType,
        size: req.file.size,
        path: filePath,
        filename,
        duration, // Include real duration
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Failed to upload file',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

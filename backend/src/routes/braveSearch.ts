import { Router, Request, Response } from 'express';
import axios from 'axios';
import sharp from 'sharp';
import { getBraveImageDownloadSource, searchBraveImages, searchBraveWeb } from '../services/braveSearchService.js';

const router = Router();

router.get('/search', async (req: Request, res: Response) => {
  const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
  if (!query) {
    return res.status(400).json({ error: 'El parámetro query es obligatorio' });
  }
  if (query.length > 600 || query.split(/\s+/).length > 75) {
    return res.status(400).json({ error: 'La búsqueda supera el límite permitido' });
  }

  const requestedCount = Number(req.query.count);
  const count = Number.isFinite(requestedCount) ? requestedCount : 10;
  const country = typeof req.query.country === 'string' ? req.query.country.toUpperCase() : 'ES';
  const searchLang = typeof req.query.searchLang === 'string' ? req.query.searchLang.toLowerCase() : 'es';

  try {
    const results = await searchBraveWeb({ query, count, country, searchLang });
    res.json({ success: true, query, count: results.length, results });
  } catch (error) {
    const status = (error as any)?.response?.status;
    const detail = (error as any)?.response?.data?.error?.detail;
    console.error('Error en Brave Search:', status || '', detail || (error as Error).message);
    res.status(status && status >= 400 && status < 600 ? status : 502).json({
      error: 'No se pudo realizar la búsqueda con Brave',
      details: detail || (error as Error).message,
    });
  }
});

router.get('/images', async (req: Request, res: Response) => {
  const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
  if (!query) return res.status(400).json({ error: 'El parámetro query es obligatorio' });
  if (query.length > 400 || query.split(/\s+/).length > 50) {
    return res.status(400).json({ error: 'La búsqueda supera el límite permitido' });
  }

  try {
    const results = await searchBraveImages({
      query,
      count: Number(req.query.count) || 30,
      country: typeof req.query.country === 'string' ? req.query.country.toUpperCase() : 'ES',
      searchLang: typeof req.query.searchLang === 'string' ? req.query.searchLang.toLowerCase() : 'es',
      minWidth: Math.max(0, Math.min(10000, Number(req.query.minWidth) || 0)),
      minHeight: Math.max(0, Math.min(10000, Number(req.query.minHeight) || 0)),
    });
    res.json({ success: true, query, count: results.length, results });
  } catch (error) {
    const status = (error as any)?.response?.status;
    const detail = (error as any)?.response?.data?.error?.detail;
    console.error('Error en Brave Image Search:', status || '', detail || (error as Error).message);
    res.status(status && status >= 400 && status < 600 ? status : 502).json({
      error: 'No se pudieron obtener imágenes con Brave',
      details: detail || (error as Error).message,
    });
  }
});

router.get('/images/download/:id', async (req: Request, res: Response) => {
  const source = getBraveImageDownloadSource(req.params.id);
  if (!source) return res.status(404).json({ error: 'La imagen ya no está disponible. Vuelve a buscarla.' });

  const fetchValidImage = async (url: string) => {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30_000,
      headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', 'User-Agent': 'Mozilla/5.0' },
    });
    const data = Buffer.from(response.data);
    if (data.length === 0) throw new Error('El origen respondió con un archivo vacío');
    const metadata = await sharp(data).metadata();
    if (!metadata.width || !metadata.height || !metadata.format) throw new Error('El origen no devolvió una imagen válida');

    // El buscador puede encontrar HEIF/HEIC, AVIF, TIFF o GIF aunque el nombre de
    // la URL termine en .jpg. FFmpeg no los maneja igual de bien en todas sus builds.
    // Se conservan JPEG/PNG/WebP tal cual y todo lo demás se normaliza a JPEG, sin
    // ocultar resultados de Brave por su formato original.
    const safeFormats = new Set(['jpeg', 'png', 'webp']);
    if (safeFormats.has(metadata.format)) {
      return { data, format: metadata.format };
    }
    const converted = await sharp(data, { animated: false }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    return { data: converted, format: 'jpeg' };
  };

  try {
    // Primero se intenta el original; si el sitio bloquea hotlinking o entrega un
    // archivo vacío, la miniatura proxy de Brave mantiene la descarga utilizable.
    let image;
    try {
      image = await fetchValidImage(source.originalUrl);
    } catch (originalError) {
      console.warn('No se pudo descargar la imagen original de Brave; usando miniatura:', (originalError as Error).message);
      image = await fetchValidImage(source.thumbnailUrl);
    }

    const extension = image.format === 'jpeg' ? 'jpg' : image.format;
    res.setHeader('Content-Type', `image/${image.format}`);
    res.setHeader('Content-Length', image.data.length);
    res.setHeader('Content-Disposition', `attachment; filename="brave-image-${req.params.id}.${extension}"`);
    res.send(image.data);
  } catch (error) {
    console.error('Error descargando imagen de Brave:', (error as Error).message);
    res.status(502).json({ error: 'No se pudo descargar una imagen válida desde Brave ni desde su origen' });
  }
});

export default router;

// Subida de imágenes desde el panel: se convierten a WebP optimizado (grande + miniatura).
// En Vercel se guardan en Vercel Blob (BLOB_READ_WRITE_TOKEN); en local, en data/uploads.
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { DATA_DIR } = require('../db');
const { token } = require('./util');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  // El tipo real se comprueba al procesar la imagen con sharp.
  fileFilter: (req, file, cb) => cb(null, /^(image\/|application\/octet-stream)/.test(file.mimetype)),
});

async function store(name, buffer) {
  if (useBlob()) {
    const { put } = require('@vercel/blob');
    const r = await put(`uploads/${name}`, buffer, { access: 'public', contentType: 'image/webp', addRandomSuffix: false, allowOverwrite: true });
    return r.url;
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
  return `/uploads/${name}`;
}

async function saveImage(file, { width = 1600 } = {}) {
  if (!file || !file.buffer) return null;
  const img = sharp(file.buffer, { failOn: 'error' }).rotate();
  try {
    await img.metadata();
  } catch {
    return null; // no es una imagen válida
  }
  const name = `${Date.now().toString(36)}-${token(4)}`;
  const [big, small] = await Promise.all([
    img.clone().resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    img.clone().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 74 }).toBuffer(),
  ]);
  const [url] = await Promise.all([store(`${name}.webp`, big), store(`${name}-sm.webp`, small)]);
  return url;
}

// ".../x.webp" -> ".../x-sm.webp" (miniatura generada al subir)
const thumb = (url) => (url && /\.webp$/.test(url) && !/-sm\.webp$/.test(url) ? url.replace(/\.webp$/, '-sm.webp') : url);

module.exports = { upload, saveImage, thumb, UPLOAD_DIR };

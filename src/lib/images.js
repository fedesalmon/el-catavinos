// Subida de imágenes desde el panel: se convierten a WebP optimizado.
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { DATA_DIR } = require('../db');
const { token } = require('./util');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  // El tipo real se comprueba al procesar la imagen con sharp.
  fileFilter: (req, file, cb) => cb(null, /^(image\/|application\/octet-stream)/.test(file.mimetype)),
});

async function saveImage(file, { width = 1600 } = {}) {
  if (!file || !file.buffer) return null;
  const name = `${Date.now().toString(36)}-${token(4)}`;
  const img = sharp(file.buffer, { failOn: 'error' }).rotate();
  try {
    await img.metadata();
  } catch {
    return null; // no es una imagen válida
  }
  await img.clone().resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 })
    .toFile(path.join(UPLOAD_DIR, `${name}.webp`));
  await img.clone().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 74 })
    .toFile(path.join(UPLOAD_DIR, `${name}-sm.webp`));
  return `/uploads/${name}.webp`;
}

// "/img/x.webp" -> "/img/x-sm.webp" (miniatura generada al subir)
const thumb = (url) => (url && /\.webp$/.test(url) && !/-sm\.webp$/.test(url) ? url.replace(/\.webp$/, '-sm.webp') : url);

module.exports = { upload, saveImage, thumb, UPLOAD_DIR };

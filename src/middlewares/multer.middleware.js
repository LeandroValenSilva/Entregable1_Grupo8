const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs/promises');
const { HttpError, PUBLIC_DIR } = require('../utils/fileStorage');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Crea un multer.diskStorage que guarda en public/img/<folder>
 * y renombra cada archivo para evitar colisiones.
 */
function createStorage(folder, prefix) {
  const destinationDir = path.join(PUBLIC_DIR, 'img', folder);

  return multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdir(destinationDir, { recursive: true })
        .then(() => cb(null, destinationDir))
        .catch((err) => cb(err));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const baseName = path
        .basename(file.originalname, path.extname(file.originalname))
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 50);
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      cb(null, `${prefix}-${unique}-${baseName}${ext}`);
    },
  });
}

function imageFilter(req, file, cb) {
  if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
  cb(new HttpError(400, `Archivo "${file.originalname}" no permitido. Solo se aceptan imágenes (jpg, png, gif, webp, avif).`));
}

const uploadUser = multer({
  storage: createStorage('users', 'avatar'),
  fileFilter: imageFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

const uploadPet = multer({
  storage: createStorage('pets', 'pet'),
  fileFilter: imageFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

module.exports = { uploadUser, uploadPet };

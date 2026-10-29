const express = require('express');
const path = require('node:path');
const multer = require('multer');
const fs = require('node:fs/promises');

const usersRouter = require('./routes/users.router');
const petsRouter = require('./routes/pets.router');
const { HttpError } = require('./utils/fileStorage');

const app = express();
const PORT = process.env.PORT || 8080;

// Body parsers (JSON y formularios simples). multipart/form-data lo procesa multer en cada ruta.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// RE-01: archivos estáticos -> GET http://localhost:8080/img/users/<archivo>
app.use(express.static(path.join(__dirname, '../public')));

// Routers
app.use('/api/users', usersRouter);
app.use('/api/pets', petsRouter);

// 404 para rutas inexistentes
app.use((req, res, next) => {
  next(new HttpError(404, `Ruta ${req.method} ${req.originalUrl} no encontrada`));
});

// Manejador central de errores
app.use(async (err, req, res, next) => {
  // Si la petición falló, se borran los archivos que multer alcanzó a guardar para no dejar huérfanos
  const uploaded = [req.file, ...(Array.isArray(req.files) ? req.files : [])].filter(Boolean);
  await Promise.all(uploaded.map((file) => fs.unlink(file.path).catch(() => {})));

  let status = 500;
  let message = 'Error interno del servidor';

  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
  } else if (err instanceof multer.MulterError) {
    status = 400;
    const messages = {
      LIMIT_FILE_SIZE: 'El archivo supera el tamaño máximo permitido (5 MB)',
      LIMIT_FILE_COUNT: 'Se superó la cantidad máxima de archivos permitidos',
      LIMIT_UNEXPECTED_FILE: `Campo de archivo inesperado "${err.field}" o demasiados archivos (usa "avatar" para usuarios y "img" (máx. 5) para mascotas)`,
    };
    message = messages[err.code] || err.message;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'El cuerpo de la petición no es un JSON válido';
  } else {
    console.error(err);
  }

  res.status(status).json({ error: message });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
  });
}

module.exports = app;

const fs = require('node:fs/promises');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, '../../public');
const DATA_DIR = path.join(__dirname, '../data');

/**
 * Error con código de estado HTTP, lo procesa el manejador de errores de app.js
 */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Cola por archivo para que dos peticiones simultáneas no se pisen al escribir el JSON
const locks = new Map();

/**
 * Lee un archivo JSON de src/data de forma asíncrona (fs.promises.readFile).
 * Si el archivo no existe lo crea con un arreglo vacío.
 */
async function readJSON(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trim() ? JSON.parse(content) : [];
  } catch (err) {
    if (err.code === 'ENOENT') {
      await writeJSON(fileName, []);
      return [];
    }
    throw err;
  }
}

/**
 * Escribe un arreglo en un archivo JSON de src/data (fs.promises.writeFile).
 */
async function writeJSON(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Ejecuta fn(data) con el contenido del JSON de forma exclusiva y guarda lo que retorne en `data`.
 * fn puede modificar el arreglo recibido; al terminar se persiste.
 */
function updateJSON(fileName, fn) {
  const previous = locks.get(fileName) || Promise.resolve();
  const run = previous.catch(() => {}).then(async () => {
    const data = await readJSON(fileName);
    const result = await fn(data);
    await writeJSON(fileName, data);
    return result;
  });
  locks.set(fileName, run);
  return run;
}

/**
 * Convierte la ruta física de un archivo subido en la URL pública servida por express.static
 * Ej: C:\...\public\img\users\123-foto.png -> /img/users/123-foto.png
 */
function toPublicUrl(filePath) {
  return '/' + path.relative(PUBLIC_DIR, filePath).split(path.sep).join('/');
}

/**
 * Elimina un archivo a partir de su URL pública (/img/...). Ignora si ya no existe.
 */
async function removePublicFile(publicUrl) {
  if (!publicUrl || typeof publicUrl !== 'string') return;
  const filePath = path.join(PUBLIC_DIR, publicUrl);
  // Evita borrar archivos fuera de public/img
  if (!filePath.startsWith(path.join(PUBLIC_DIR, 'img'))) return;
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = { HttpError, readJSON, writeJSON, updateJSON, toPublicUrl, removePublicFile, PUBLIC_DIR };

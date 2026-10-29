const { Router } = require('express');
const { uploadUser } = require('../middlewares/multer.middleware');
const { hashPassword } = require('../utils/crypto');
const { HttpError, readJSON, updateJSON, toPublicUrl, removePublicFile } = require('../utils/fileStorage');

const router = Router();
const FILE = 'users.json';
const REQUIRED_FIELDS = ['firstname', 'lastname', 'username', 'password'];

// Quita el password antes de responder (RE-03)
function sanitize(user) {
  const { password, ...rest } = user;
  return rest;
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'El id debe ser un número entero positivo');
  return id;
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

// GET /api/users -> lista todos los usuarios (sin password)
router.get('/', async (req, res) => {
  const users = await readJSON(FILE);
  res.status(200).json(users.map(sanitize));
});

// GET /api/users/:id -> un usuario por id
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const users = await readJSON(FILE);
  const user = users.find((u) => u.id === id);
  if (!user) throw new HttpError(404, `Usuario con id ${id} no encontrado`);
  res.status(200).json(sanitize(user));
});

// POST /api/users -> crea un usuario (multipart/form-data con campo "avatar")
router.post('/', uploadUser.single('avatar'), async (req, res) => {
  const body = req.body ?? {};
  const data = {};
  for (const field of REQUIRED_FIELDS) data[field] = cleanString(body[field]);

  const missing = REQUIRED_FIELDS.filter((f) => !data[f]);
  if (missing.length) throw new HttpError(400, `Faltan campos obligatorios: ${missing.join(', ')}`);
  if (data.password.length < 4) throw new HttpError(400, 'La contraseña debe tener al menos 4 caracteres');

  const password = await hashPassword(data.password);

  const created = await updateJSON(FILE, (users) => {
    if (users.some((u) => u.username.toLowerCase() === data.username.toLowerCase())) {
      throw new HttpError(400, `El username "${data.username}" ya está registrado`);
    }
    const newUser = {
      id: users.reduce((max, u) => Math.max(max, u.id), 0) + 1,
      firstname: data.firstname,
      lastname: data.lastname,
      username: data.username,
      password,
      avatar: req.file ? toPublicUrl(req.file.path) : null,
    };
    users.push(newUser);
    return newUser;
  });

  res.status(201).json(sanitize(created));
});

// PUT /api/users/:id -> actualiza datos, contraseña (re-hash) y/o avatar (reemplaza el anterior)
router.put('/:id', uploadUser.single('avatar'), async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body ?? {};

  const changes = {};
  for (const field of ['firstname', 'lastname', 'username']) {
    if (body[field] !== undefined) {
      const value = cleanString(body[field]);
      if (!value) throw new HttpError(400, `El campo "${field}" no puede estar vacío`);
      changes[field] = value;
    }
  }
  if (body.password !== undefined) {
    const value = cleanString(body.password);
    if (!value || value.length < 4) throw new HttpError(400, 'La contraseña debe tener al menos 4 caracteres');
    changes.password = await hashPassword(value);
  }
  if (req.file) changes.avatar = toPublicUrl(req.file.path);

  if (Object.keys(changes).length === 0) {
    throw new HttpError(400, 'No se envió ningún campo para actualizar (firstname, lastname, username, password o avatar)');
  }

  let oldAvatar = null;
  const updated = await updateJSON(FILE, (users) => {
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) throw new HttpError(404, `Usuario con id ${id} no encontrado`);
    if (
      changes.username &&
      users.some((u) => u.id !== id && u.username.toLowerCase() === changes.username.toLowerCase())
    ) {
      throw new HttpError(400, `El username "${changes.username}" ya está registrado`);
    }
    if (changes.avatar) oldAvatar = users[index].avatar;
    users[index] = { ...users[index], ...changes };
    return users[index];
  });

  // Borra el avatar anterior del disco una vez guardado el nuevo
  if (oldAvatar && oldAvatar !== updated.avatar) await removePublicFile(oldAvatar);

  res.status(200).json(sanitize(updated));
});

// DELETE /api/users/:id -> elimina el usuario de users.json (y su avatar del disco)
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);

  const deleted = await updateJSON(FILE, (users) => {
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) throw new HttpError(404, `Usuario con id ${id} no encontrado`);
    return users.splice(index, 1)[0];
  });

  await removePublicFile(deleted.avatar);
  res.status(200).json({ message: `Usuario con id ${id} eliminado`, user: sanitize(deleted) });
});

module.exports = router;

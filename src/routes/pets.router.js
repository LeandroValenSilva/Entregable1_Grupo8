const { Router } = require('express');
const { uploadPet } = require('../middlewares/multer.middleware');
const { HttpError, readJSON, updateJSON, toPublicUrl, removePublicFile } = require('../utils/fileStorage');

const router = Router();
const FILE = 'pets.json';
const MAX_IMAGES = 5;
const SEXOS = ['macho', 'hembra'];

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'El id debe ser un número entero positivo');
  return id;
}

/**
 * Valida y normaliza los campos de una mascota.
 * partial = true (PUT) -> solo valida los campos enviados.
 */
function validatePet(body, partial) {
  const result = {};

  for (const field of ['especie', 'color']) {
    if (body[field] === undefined) {
      if (!partial) throw new HttpError(400, `Falta el campo obligatorio: ${field}`);
      continue;
    }
    const value = String(body[field]).trim();
    if (!value) throw new HttpError(400, `El campo "${field}" no puede estar vacío`);
    result[field] = value.toLowerCase();
  }

  if (body.edad === undefined) {
    if (!partial) throw new HttpError(400, 'Falta el campo obligatorio: edad');
  } else {
    const edad = Number(body.edad);
    if (String(body.edad).trim() === '' || !Number.isInteger(edad) || edad < 0) {
      throw new HttpError(400, 'El campo "edad" debe ser un número entero mayor o igual a 0');
    }
    result.edad = edad;
  }

  if (body.sexo === undefined) {
    if (!partial) throw new HttpError(400, 'Falta el campo obligatorio: sexo');
  } else {
    const sexo = String(body.sexo).trim().toLowerCase();
    if (!SEXOS.includes(sexo)) throw new HttpError(400, `El campo "sexo" debe ser: ${SEXOS.join(' o ')}`);
    result.sexo = sexo;
  }

  return result;
}

// Acepta un string, varios campos repetidos o un JSON array: ["/img/pets/a.jpg", ...]
function toArray(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // no es JSON, se toma como un único valor
  }
  return [value];
}

// GET /api/pets -> todas las mascotas
router.get('/', async (req, res) => {
  const pets = await readJSON(FILE);
  res.status(200).json(pets);
});

// GET /api/pets/:id -> una mascota por id
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const pets = await readJSON(FILE);
  const pet = pets.find((p) => p.id === id);
  if (!pet) throw new HttpError(404, `Mascota con id ${id} no encontrada`);
  res.status(200).json(pet);
});

// POST /api/pets -> crea una mascota (multipart/form-data con hasta 5 archivos en el campo "img")
router.post('/', uploadPet.array('img', MAX_IMAGES), async (req, res) => {
  const data = validatePet(req.body ?? {}, false);
  const images = (req.files ?? []).map((file) => toPublicUrl(file.path));

  const created = await updateJSON(FILE, (pets) => {
    const newPet = {
      id: pets.reduce((max, p) => Math.max(max, p.id), 0) + 1,
      ...data,
      img: images,
    };
    pets.push(newPet);
    return newPet;
  });

  res.status(201).json(created);
});

/**
 * PUT /api/pets/:id -> actualiza datos y/o imágenes.
 *  - Archivos nuevos en "img"           -> se AGREGAN al arreglo existente.
 *  - replaceImg = true                   -> las imágenes nuevas REEMPLAZAN a todas las anteriores.
 *  - removeImg = ruta o ["ruta", ...]    -> elimina esas imágenes concretas.
 */
router.put('/:id', uploadPet.array('img', MAX_IMAGES), async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body ?? {};
  const changes = validatePet(body, true);
  const newImages = (req.files ?? []).map((file) => toPublicUrl(file.path));
  const replaceImg = String(body.replaceImg).toLowerCase() === 'true';
  const removeImg = toArray(body.removeImg);

  if (Object.keys(changes).length === 0 && newImages.length === 0 && removeImg.length === 0 && !replaceImg) {
    throw new HttpError(
      400,
      'No se envió ningún campo para actualizar (especie, color, edad, sexo, img, replaceImg o removeImg)'
    );
  }

  let discarded = [];
  const updated = await updateJSON(FILE, (pets) => {
    const index = pets.findIndex((p) => p.id === id);
    if (index === -1) throw new HttpError(404, `Mascota con id ${id} no encontrada`);

    const current = pets[index].img ?? [];
    let kept;
    if (replaceImg) {
      kept = [];
    } else {
      const notFound = removeImg.filter((img) => !current.includes(img));
      if (notFound.length) throw new HttpError(400, `Las imágenes no pertenecen a la mascota: ${notFound.join(', ')}`);
      kept = current.filter((img) => !removeImg.includes(img));
    }

    const finalImages = [...kept, ...newImages];
    if (finalImages.length > MAX_IMAGES) {
      throw new HttpError(400, `Una mascota puede tener máximo ${MAX_IMAGES} imágenes (quedaría con ${finalImages.length})`);
    }

    discarded = current.filter((img) => !kept.includes(img));
    pets[index] = { ...pets[index], ...changes, img: finalImages };
    return pets[index];
  });

  // Borra del disco las imágenes que ya no se usan
  await Promise.all(discarded.map(removePublicFile));

  res.status(200).json(updated);
});

// DELETE /api/pets/:id -> elimina la mascota de pets.json (y sus imágenes del disco)
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);

  const deleted = await updateJSON(FILE, (pets) => {
    const index = pets.findIndex((p) => p.id === id);
    if (index === -1) throw new HttpError(404, `Mascota con id ${id} no encontrada`);
    return pets.splice(index, 1)[0];
  });

  await Promise.all((deleted.img ?? []).map(removePublicFile));
  res.status(200).json({ message: `Mascota con id ${id} eliminada`, pet: deleted });
});

module.exports = router;

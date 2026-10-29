/**
 * Prueba de humo de toda la API: levanta el servidor en un puerto libre,
 * recorre todos los endpoints y al final elimina lo que creó.
 * Ejecutar con: npm test
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const app = require('../src/app');

// PNG de 1x1 px
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const png = () => new Blob([PNG], { type: 'image/png' });

let passed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    console.error(`  ✘ ${name}\n    ${err.message}`);
    process.exitCode = 1;
    throw err;
  }
}

async function main() {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const api = (p, opts) => fetch(base + p, opts);
  const publicFile = (url) => path.join(__dirname, '../public', url);

  try {
    console.log('Usuarios');
    let user;
    await step('POST /api/users crea usuario con avatar (201) y no devuelve password', async () => {
      const fd = new FormData();
      fd.append('firstname', 'Wilmer');
      fd.append('lastname', 'Patiño');
      fd.append('username', `w.patino.test${Date.now()}`);
      fd.append('password', 'secreto123');
      fd.append('avatar', png(), 'mi foto.png');
      const res = await api('/api/users', { method: 'POST', body: fd });
      assert.equal(res.status, 201);
      user = await res.json();
      assert.equal(user.password, undefined);
      assert.match(user.avatar, /^\/img\/users\/avatar-\d+-\d+-mi_foto\.png$/);
    });

    await step('El avatar guardado es accesible por express.static', async () => {
      const res = await api(user.avatar);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
    });

    await step('La contraseña se guarda hasheada en users.json', async () => {
      const users = JSON.parse(await fs.readFile(path.join(__dirname, '../src/data/users.json'), 'utf-8'));
      const stored = users.find((u) => u.id === user.id);
      assert.notEqual(stored.password, 'secreto123');
      assert.match(stored.password, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
    });

    await step('POST /api/users sin campos obligatorios -> 400', async () => {
      const fd = new FormData();
      fd.append('firstname', 'Solo nombre');
      const res = await api('/api/users', { method: 'POST', body: fd });
      assert.equal(res.status, 400);
    });

    await step('POST /api/users con archivo que no es imagen -> 400', async () => {
      const fd = new FormData();
      fd.append('firstname', 'A');
      fd.append('lastname', 'B');
      fd.append('username', 'ab');
      fd.append('password', '1234');
      fd.append('avatar', new Blob(['hola'], { type: 'text/plain' }), 'nota.txt');
      const res = await api('/api/users', { method: 'POST', body: fd });
      assert.equal(res.status, 400);
    });

    await step('GET /api/users lista usuarios sin password (200)', async () => {
      const res = await api('/api/users');
      assert.equal(res.status, 200);
      const list = await res.json();
      assert.ok(list.some((u) => u.id === user.id));
      assert.ok(list.every((u) => u.password === undefined));
    });

    await step('GET /api/users/:id (200) / inexistente (404) / inválido (400)', async () => {
      assert.equal((await api(`/api/users/${user.id}`)).status, 200);
      assert.equal((await api('/api/users/999999')).status, 404);
      assert.equal((await api('/api/users/abc')).status, 400);
    });

    await step('PUT /api/users/:id cambia password y reemplaza avatar (borra el anterior)', async () => {
      const oldAvatar = user.avatar;
      const fd = new FormData();
      fd.append('firstname', 'Wilmer Andrés');
      fd.append('password', 'nueva456');
      fd.append('avatar', png(), 'nuevo.png');
      const res = await api(`/api/users/${user.id}`, { method: 'PUT', body: fd });
      assert.equal(res.status, 200);
      user = await res.json();
      assert.equal(user.firstname, 'Wilmer Andrés');
      assert.notEqual(user.avatar, oldAvatar);
      assert.equal((await api(user.avatar)).status, 200);
      assert.equal((await api(oldAvatar)).status, 404);
    });

    await step('PUT /api/users/:id también acepta JSON', async () => {
      const res = await api(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastname: 'Patiño R.' }),
      });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).lastname, 'Patiño R.');
    });

    await step('PUT /api/users/:id sin datos -> 400, inexistente -> 404', async () => {
      assert.equal((await api(`/api/users/${user.id}`, { method: 'PUT' })).status, 400);
      const fd = new FormData();
      fd.append('firstname', 'X');
      assert.equal((await api('/api/users/999999', { method: 'PUT', body: fd })).status, 404);
    });

    console.log('Mascotas');
    let pet;
    await step('POST /api/pets crea mascota con 2 imágenes (201)', async () => {
      const fd = new FormData();
      fd.append('especie', 'perro');
      fd.append('color', 'negro con manchas blancas');
      fd.append('edad', '4');
      fd.append('sexo', 'macho');
      fd.append('img', png(), 'a.png');
      fd.append('img', png(), 'b.png');
      const res = await api('/api/pets', { method: 'POST', body: fd });
      assert.equal(res.status, 201);
      pet = await res.json();
      assert.equal(pet.edad, 4);
      assert.equal(pet.img.length, 2);
      for (const url of pet.img) assert.equal((await api(url)).status, 200);
    });

    await step('POST /api/pets con datos inválidos -> 400', async () => {
      const fd = new FormData();
      fd.append('especie', 'gato');
      fd.append('color', 'gris');
      fd.append('edad', '-2');
      fd.append('sexo', 'macho');
      assert.equal((await api('/api/pets', { method: 'POST', body: fd })).status, 400);
    });

    await step('POST /api/pets con más de 5 imágenes -> 400', async () => {
      const fd = new FormData();
      fd.append('especie', 'gato');
      fd.append('color', 'gris');
      fd.append('edad', '2');
      fd.append('sexo', 'hembra');
      for (let i = 0; i < 6; i++) fd.append('img', png(), `${i}.png`);
      assert.equal((await api('/api/pets', { method: 'POST', body: fd })).status, 400);
    });

    await step('GET /api/pets y GET /api/pets/:id (200 / 404)', async () => {
      const res = await api('/api/pets');
      assert.equal(res.status, 200);
      assert.ok((await res.json()).some((p) => p.id === pet.id));
      assert.equal((await api(`/api/pets/${pet.id}`)).status, 200);
      assert.equal((await api('/api/pets/999999')).status, 404);
    });

    await step('PUT /api/pets/:id agrega una imagen y actualiza la edad', async () => {
      const fd = new FormData();
      fd.append('edad', '5');
      fd.append('img', png(), 'c.png');
      const res = await api(`/api/pets/${pet.id}`, { method: 'PUT', body: fd });
      assert.equal(res.status, 200);
      pet = await res.json();
      assert.equal(pet.edad, 5);
      assert.equal(pet.img.length, 3);
    });

    await step('PUT /api/pets/:id elimina una imagen concreta (removeImg)', async () => {
      const removed = pet.img[0];
      const res = await api(`/api/pets/${pet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeImg: [removed] }),
      });
      assert.equal(res.status, 200);
      pet = await res.json();
      assert.equal(pet.img.length, 2);
      assert.equal((await api(removed)).status, 404);
    });

    await step('PUT /api/pets/:id reemplaza todas las imágenes (replaceImg=true)', async () => {
      const old = pet.img;
      const fd = new FormData();
      fd.append('replaceImg', 'true');
      fd.append('img', png(), 'nueva.png');
      const res = await api(`/api/pets/${pet.id}`, { method: 'PUT', body: fd });
      assert.equal(res.status, 200);
      pet = await res.json();
      assert.equal(pet.img.length, 1);
      for (const url of old) assert.equal((await api(url)).status, 404);
    });

    console.log('Eliminación y errores generales');
    await step('DELETE /api/pets/:id (200) y luego 404', async () => {
      assert.equal((await api(`/api/pets/${pet.id}`, { method: 'DELETE' })).status, 200);
      assert.equal((await api(`/api/pets/${pet.id}`)).status, 404);
      await assert.rejects(fs.access(publicFile(pet.img[0])));
    });

    await step('DELETE /api/users/:id (200) y luego 404', async () => {
      assert.equal((await api(`/api/users/${user.id}`, { method: 'DELETE' })).status, 200);
      assert.equal((await api(`/api/users/${user.id}`, { method: 'DELETE' })).status, 404);
      await assert.rejects(fs.access(publicFile(user.avatar)));
    });

    await step('Ruta inexistente -> 404 JSON', async () => {
      const res = await api('/api/nada');
      assert.equal(res.status, 404);
      assert.ok((await res.json()).error);
    });

    console.log(`\n${passed} pruebas OK`);
  } finally {
    server.close();
  }
}

main().catch(() => {
  console.error(`\nFallaron pruebas (${passed} OK antes del fallo)`);
  process.exitCode = 1;
});

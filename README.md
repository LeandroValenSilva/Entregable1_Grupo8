# API REST de Usuarios y Mascotas

API REST modular en **Node.js + Express** que gestiona dos recursos independientes, **usuarios** y **mascotas**, guardados en archivos JSON locales.

| Requisito | Implementación |
|---|---|
| Persistencia asíncrona | `fs/promises` (`readFile` / `writeFile`) con `async/await` — `src/utils/fileStorage.js` |
| Hashing de contraseñas | `crypto.scrypt` con *salt* aleatorio (formato `salt:hash`) — `src/utils/crypto.js` |
| Carga de archivos | `multer.diskStorage({ destination, filename })` — `src/middlewares/multer.middleware.js` |
| Archivos estáticos | `app.use(express.static(path.join(__dirname, '../public')))` — `src/app.js` |

## Requisitos

- Node.js 18 o superior

## Instalación y ejecución

```bash
npm install
npm start
```

El servidor queda en `http://localhost:8080` (puerto configurable con la variable `PORT`).
Para desarrollo con recarga automática: `npm run dev`.

## Cliente web

Con el servidor encendido, abre **http://localhost:8080/** en el navegador. La página `public/index.html` la sirve el mismo `express.static` y consume la API con `fetch`:

- Pestañas **Usuarios** y **Mascotas**, cada una con un formulario y la lista de registros en tarjetas.
- Crear, editar y eliminar, con subida de avatar o de hasta 5 imágenes por mascota y vista previa.
- Al editar una mascota se pueden marcar imágenes para quitar (`removeImg`) o reemplazarlas todas (`replaceImg`).
- El panel **Última petición a la API** muestra el método, la URL, el código de estado y el JSON de respuesta.

No hace falta configurar CORS ni levantar otro servidor, porque la página y la API comparten el mismo origen.

## Pruebas

```bash
npm test
```

Levanta la API en un puerto libre y comprueba todos los endpoints, los códigos de estado, el hashing, el acceso estático a las imágenes y el borrado de archivos. Al terminar elimina todo lo que creó.

## Estructura

```
├── public/
│   ├── index.html          ← cliente web que consume la API
│   └── img/
│       ├── users/          ← avatares subidos
│       └── pets/           ← imágenes de mascotas subidas
├── src/
│   ├── app.js              ← configuración de Express, estáticos, routers y manejo de errores
│   ├── middlewares/
│   │   └── multer.middleware.js
│   ├── routes/
│   │   ├── users.router.js
│   │   └── pets.router.js
│   ├── utils/
│   │   ├── crypto.js       ← hash y verificación de contraseñas
│   │   └── fileStorage.js  ← lectura/escritura de los JSON con fs.promises
│   └── data/
│       ├── users.json
│       └── pets.json
├── test/
│   └── smoke.test.js
├── package.json
└── README.md
```

## Modelos

**Usuario** (`users.json`)

```json
{
  "id": 1,
  "firstname": "Wilmer",
  "lastname": "Patiño",
  "username": "w.patino",
  "password": "<salt>:<hash scrypt>",
  "avatar": "/img/users/avatar-1710000000-123456-foto.png"
}
```

**Mascota** (`pets.json`)

```json
{
  "id": 1,
  "especie": "perro",
  "color": "negro con manchas blancas",
  "edad": 4,
  "sexo": "macho",
  "img": ["/img/pets/pet-1710000001-123456-a.jpg", "/img/pets/pet-1710000002-654321-b.jpg"]
}
```

Las rutas de `avatar` e `img` son URLs públicas: se pueden abrir directamente, por ejemplo `http://localhost:8080/img/users/avatar-1710000000-123456-foto.png`.

## Endpoints

### Usuarios — `/api/users`

| Método | Ruta | Descripción | Éxito |
|---|---|---|---|
| GET | `/api/users` | Lista todos los usuarios (sin `password`) | 200 |
| GET | `/api/users/:id` | Usuario por id (sin `password`) | 200 |
| POST | `/api/users` | `multipart/form-data`: `firstname`, `lastname`, `username`, `password` (obligatorios) y `avatar` (archivo, opcional) | 201 |
| PUT | `/api/users/:id` | Cualquier campo anterior. Si llega `password` se vuelve a hashear; si llega `avatar` reemplaza al anterior y lo borra del disco | 200 |
| DELETE | `/api/users/:id` | Elimina el usuario y su avatar | 200 |

### Mascotas — `/api/pets`

| Método | Ruta | Descripción | Éxito |
|---|---|---|---|
| GET | `/api/pets` | Lista todas las mascotas | 200 |
| GET | `/api/pets/:id` | Mascota por id | 200 |
| POST | `/api/pets` | `multipart/form-data`: `especie`, `color`, `edad` (entero ≥ 0), `sexo` (`macho`/`hembra`) obligatorios, y hasta 5 archivos en el campo `img` | 201 |
| PUT | `/api/pets/:id` | Actualiza cualquier campo. Imágenes: ver abajo | 200 |
| DELETE | `/api/pets/:id` | Elimina la mascota y sus imágenes | 200 |

Manejo de imágenes en `PUT /api/pets/:id`:

- Archivos nuevos en `img` → se **agregan** a las existentes.
- `replaceImg=true` → las imágenes nuevas **reemplazan** a todas las anteriores (las viejas se borran del disco).
- `removeImg` → ruta (o arreglo JSON de rutas) de imágenes concretas a eliminar, ej. `["/img/pets/pet-...jpg"]`.
- Una mascota puede tener como máximo 5 imágenes.

### Códigos de estado

| Código | Cuándo |
|---|---|
| 200 | Consultas, actualizaciones y eliminaciones exitosas |
| 201 | Creación (POST) |
| 400 | Campos faltantes o inválidos, id no numérico, username repetido, archivo que no es imagen, más de 5 imágenes o archivo mayor a 5 MB |
| 404 | El recurso o la ruta no existe |
| 500 | Error de lectura/escritura o del servidor |

Los errores siempre responden JSON: `{ "error": "mensaje" }`. Si una petición con archivos falla, los archivos que alcanzó a subir se eliminan para no dejar basura en `public/img`.

## Ejemplos con curl

```bash
# Crear usuario con avatar
curl -F firstname=Wilmer -F lastname=Patiño -F username=w.patino -F password=secreto123 -F avatar=@foto.png http://localhost:8080/api/users

# Listar usuarios
curl http://localhost:8080/api/users

# Cambiar contraseña y avatar
curl -X PUT -F password=nueva456 -F avatar=@otra.png http://localhost:8080/api/users/1

# Eliminar usuario
curl -X DELETE http://localhost:8080/api/users/1

# Crear mascota con dos imágenes
curl -F especie=perro -F "color=negro con manchas blancas" -F edad=4 -F sexo=macho -F img=@a.jpg -F img=@b.jpg http://localhost:8080/api/pets

# Agregar una imagen y cambiar la edad
curl -X PUT -F edad=5 -F img=@c.jpg http://localhost:8080/api/pets/1

# Reemplazar todas las imágenes
curl -X PUT -F replaceImg=true -F img=@nueva.jpg http://localhost:8080/api/pets/1
```

En Postman: Body → **form-data**, los campos de texto como *Text* y `avatar` / `img` como *File* (para varias imágenes repite la clave `img`).

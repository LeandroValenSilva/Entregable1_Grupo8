const crypto = require('node:crypto');

const KEY_LENGTH = 64;

/**
 * Genera un hash seguro de la contraseña usando scrypt + salt aleatorio.
 * Formato almacenado: "<salt_hex>:<hash_hex>"
 */
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifica una contraseña en texto plano contra el hash almacenado.
 */
function verifyPassword(password, storedHash) {
  return new Promise((resolve, reject) => {
    const [salt, key] = String(storedHash).split(':');
    if (!salt || !key) return resolve(false);
    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      const keyBuffer = Buffer.from(key, 'hex');
      resolve(keyBuffer.length === derivedKey.length && crypto.timingSafeEqual(keyBuffer, derivedKey));
    });
  });
}

module.exports = { hashPassword, verifyPassword };

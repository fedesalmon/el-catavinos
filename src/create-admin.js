// Crea un usuario del panel o restablece su contraseña:
//   npm run create-admin -- correo@ejemplo.com NuevaContraseña
require('./load-env');
const { db } = require('./db');
const { hashPassword } = require('./lib/auth');

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Uso: npm run create-admin -- correo@ejemplo.com contraseña (mínimo 8 caracteres)');
  process.exit(1);
}
const e = email.trim().toLowerCase();
const exists = db.prepare('SELECT id FROM admins WHERE email = ?').get(e);
if (exists) {
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(password), exists.id);
  db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(exists.id);
  console.log(`Contraseña actualizada para ${e}`);
} else {
  db.prepare('INSERT INTO admins (email, name, password_hash) VALUES (?, ?, ?)').run(e, '', hashPassword(password));
  console.log(`Usuario creado: ${e}`);
}

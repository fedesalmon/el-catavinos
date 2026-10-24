// Crea un usuario del panel o restablece su contraseña:
//   npm run create-admin -- correo@ejemplo.com NuevaContraseña
// (usa la base de datos de MONGODB_URI si está definida en .env)
require('./load-env');
const { col } = require('./db');
const { hashPassword, createAdmin } = require('./lib/auth');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.error('Uso: npm run create-admin -- correo@ejemplo.com contraseña (mínimo 8 caracteres)');
    process.exit(1);
  }
  const e = email.trim().toLowerCase();
  const admins = await col('admins');
  const exists = await admins.findOne({ email: e });
  if (exists) {
    await admins.updateOne({ id: exists.id }, { $set: { password_hash: hashPassword(password) } });
    await (await col('sessions')).deleteMany({ admin_id: exists.id });
    console.log(`Contraseña actualizada para ${e}`);
  } else {
    await createAdmin(e, password);
    console.log(`Usuario creado: ${e}`);
  }
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });

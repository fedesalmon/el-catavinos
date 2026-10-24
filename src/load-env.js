// Carga variables desde .env si existe (Node >= 20.12).
const path = require('path');
const fs = require('fs');

const file = path.join(__dirname, '..', '.env');
if (fs.existsSync(file) && typeof process.loadEnvFile === 'function') process.loadEnvFile(file);

require('./src/load-env');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { getSettings } = require('./src/db');
const { seedIfEmpty } = require('./src/seed');
const { loadAdmin } = require('./src/lib/auth');
const { rawCart } = require('./src/lib/cart');
const { UPLOAD_DIR, thumb } = require('./src/lib/images');
const { expireUnpaidCardOrders, STATUS_LABELS, PAYMENT_LABELS, DELIVERY_LABELS } = require('./src/lib/orders');
const util = require('./src/lib/util');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
  });
  next();
});

// El webhook de Stripe necesita el cuerpo sin procesar.
app.use('/stripe/webhook', express.raw({ type: 'application/json' }), require('./src/routes/webhook'));

app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));

// Redirecciones permanentes desde las URLs de la web anterior (conserva el SEO).
const LEGACY = {
  '/maridaje-en-madrid': '/catas',
  '/vinoteca-en-madrid': '/tienda',
  '/vinoteca-en-madrid-2': '/sobre-nosotros',
  '/vinos-veganos-madrid': '/blog',
  '/feed': '/blog',
  '/comments/feed': '/blog',
};
app.use((req, res, next) => {
  const p = req.path.replace(/\/+$/, '') || '/';
  if (LEGACY[p]) return res.redirect(301, LEGACY[p]);
  if (req.path.length > 1 && req.path.endsWith('/') && req.method === 'GET') {
    return res.redirect(301, p + (req.url.slice(req.path.length) || ''));
  }
  next();
});

// Primera petición de cada instancia: carga el contenido inicial si la base de datos está vacía.
let ready;
app.use(async (req, res, next) => {
  ready = ready || seedIfEmpty().catch((err) => { ready = null; throw err; });
  await ready;
  expireUnpaidCardOrders().catch((err) => console.error(err));
  next();
});

app.use(loadAdmin);
app.use(async (req, res, next) => {
  const settings = await getSettings();
  const cart = rawCart(req);
  Object.assign(res.locals, util, {
    s: settings,
    thumb, STATUS_LABELS, PAYMENT_LABELS, DELIVERY_LABELS,
    path: req.path,
    admin: req.admin,
    cartCount: Object.values(cart).reduce((a, b) => a + b, 0),
    baseUrl: process.env.BASE_URL || `${req.protocol}://${req.get('host')}`,
    meta: {},
    flash: req.query.ok ? String(req.query.ok) : null,
  });
  next();
});

app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/shop'));
app.use('/', require('./src/routes/public'));

app.use((req, res) => res.status(404).render('pages/404', { meta: { title: 'Página no encontrada' } }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).render('pages/404', { meta: { title: 'Ha ocurrido un error' }, error: true });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`El Catavinos en http://localhost:${PORT}  (panel: /admin)`));
}

module.exports = app;

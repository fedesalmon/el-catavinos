const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { col, find, findOne, nextId, now, getSettings, setSetting } = require('../db');
const auth = require('../lib/auth');
const { upload, saveImage } = require('../lib/images');
const { parseEuros, uniqueSlug, isEmail, clampInt, escapeRegex } = require('../lib/util');
const orders = require('../lib/orders');
const { parseCsv, toCsv } = require('../lib/csv');
const { mailEnabled } = require('../lib/mail');
const { cardEnabled } = require('../lib/payments');
const { withCategories } = require('../lib/catalog');

const router = express.Router();
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

const back = (res, url, msg) => res.redirect(303, `${url}${url.includes('?') ? '&' : '?'}ok=${encodeURIComponent(msg)}`);
const chk = (v) => (v ? 1 : 0);
const str = (v, n = 5000) => String(v ?? '').trim().slice(0, n);
const intId = (v) => parseInt(v, 10) || 0;
const categoriesSorted = () => find('categories', {}, { sort: { sort: 1, name: 1 } });

router.use(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.locals.section = req.path.split('/')[1] || 'inicio';
  res.locals.counts = {};
  if (req.admin) {
    const [o, b, m] = await Promise.all([
      (await col('orders')).countDocuments({ $or: [{ status: 'pagado' }, { status: 'pendiente_pago', payment_method: { $ne: 'tarjeta' } }] }),
      (await col('bookings')).countDocuments({ status: 'pendiente' }),
      (await col('messages')).countDocuments({ is_read: 0 }),
    ]);
    res.locals.counts = { orders: o, bookings: b, messages: m };
  }
  next();
});

// ---- Login ------------------------------------------------------------------

const noAdminsYet = async () => (await (await col('admins')).countDocuments()) === 0;

router.get('/login', async (req, res) => {
  if (req.admin) return res.redirect('/admin');
  if (await noAdminsYet()) return res.render('admin/setup', { error: null, form: {} });
  res.render('admin/login', { error: null, next: req.query.next || '/admin' });
});

// Primera vez: si todavía no existe ningún usuario, se crea la cuenta del panel desde aquí.
router.post('/setup', async (req, res) => {
  if (!(await noAdminsYet())) return res.redirect(303, '/admin/login');
  const form = { name: str(req.body.name, 80), email: str(req.body.email, 160).toLowerCase() };
  const password = String(req.body.password || '');
  let error = null;
  if (!isEmail(form.email)) error = 'Indica un email válido.';
  else if (password.length < 8) error = 'La contraseña debe tener al menos 8 caracteres.';
  else if (password !== String(req.body.password2 || '')) error = 'Las contraseñas no coinciden.';
  if (error) return res.status(422).render('admin/setup', { error, form });
  try {
    await auth.createAdmin(form.email, password, form.name);
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
  await auth.login(req, res, form.email, password);
  back(res, '/admin', 'Cuenta creada. ¡Bienvenido al panel!');
});

router.post('/login', async (req, res) => {
  const nextUrl = String(req.body.next || '/admin').startsWith('/admin') ? req.body.next : '/admin';
  if (auth.loginThrottle(req)) return res.status(429).render('admin/login', { error: 'Demasiados intentos. Espera 15 minutos.', next: nextUrl });
  if (!(await auth.login(req, res, req.body.email, req.body.password))) {
    auth.recordFailedLogin(req);
    return res.status(401).render('admin/login', { error: 'Email o contraseña incorrectos.', next: nextUrl });
  }
  res.redirect(303, nextUrl);
});

router.post('/logout', async (req, res) => { await auth.logout(req, res); res.redirect(303, '/admin/login'); });

router.use(auth.requireAdmin);

// ---- Inicio -----------------------------------------------------------------

router.get('/', async (req, res) => {
  const [sales, products, lowStock, recentOrders, pendingBookings, unread] = await Promise.all([
    (await col('orders')).aggregate([
      { $match: { status: { $nin: ['cancelado', 'pendiente_pago'] }, created_at: { $gte: now(-30 * 864e5) } } },
      { $group: { _id: null, s: { $sum: '$total_cents' }, n: { $sum: 1 } } },
    ]).toArray(),
    (await col('products')).countDocuments({ active: 1 }),
    find('products', { active: 1, stock: { $lte: 3 } }, { sort: { stock: 1 }, limit: 8, projection: { id: 1, name: 1, stock: 1 } }),
    find('orders', {}, { sort: { id: -1 }, limit: 6 }),
    find('bookings', { status: 'pendiente' }, { sort: { date: 1 }, limit: 6 }),
    find('messages', { is_read: 0 }, { sort: { id: -1 }, limit: 5 }),
  ]);
  const stats = { sales30: sales[0] || { s: 0, n: 0 }, products, lowStock };
  res.render('admin/dashboard', { stats, recentOrders, pendingBookings, unread, setup: { mail: mailEnabled(), card: cardEnabled() } });
});

// ---- Productos --------------------------------------------------------------

router.get('/productos', async (req, res) => {
  const q = str(req.query.q, 80);
  const cat = intId(req.query.cat);
  const where = {};
  if (q) { const rx = new RegExp(escapeRegex(q), 'i'); where.$or = [{ name: rx }, { region: rx }]; }
  if (cat) where.category_id = cat;
  if (req.query.estado === 'ocultos') where.active = 0;
  if (req.query.estado === 'agotados') where.stock = { $lte: 0 };
  const [products, categories] = await Promise.all([find('products', where).then(withCategories), categoriesSorted()]);
  const catSort = new Map(categories.map((c, i) => [c.id, i]));
  products.sort((a, b) => ((catSort.get(a.category_id) ?? 999) - (catSort.get(b.category_id) ?? 999)) || (a.sort - b.sort) || a.name.localeCompare(b.name, 'es'));
  res.render('admin/products', { products, categories, q, cat, estado: req.query.estado || '' });
});

router.get('/productos/nuevo', async (req, res) => {
  res.render('admin/product-form', { product: { active: 1, shippable: 1, stock: 10, category_id: intId(req.query.cat) || null }, categories: await categoriesSorted(), errors: [] });
});

router.get('/productos/:id', async (req, res, next) => {
  const p = await findOne('products', { id: intId(req.params.id) });
  if (!p) return next();
  res.render('admin/product-form', { product: p, categories: await categoriesSorted(), errors: [] });
});

router.post(['/productos/nuevo', '/productos/:id'], upload.single('image_file'), async (req, res, next) => {
  const b = req.body;
  const id = req.params.id ? intId(req.params.id) : null;
  const products = await col('products');
  const existing = id ? await findOne('products', { id }) : null;
  if (id && !existing) return next();
  const data = {
    name: str(b.name, 200),
    category_id: intId(b.category_id) || null,
    short_desc: str(b.short_desc, 400),
    description: str(b.description, 10000),
    price_cents: parseEuros(b.price),
    compare_cents: parseEuros(b.compare_price),
    stock: clampInt(b.stock, 0, 100000, 0),
    region: str(b.region, 120), grape: str(b.grape, 160), vintage: str(b.vintage, 20), volume: str(b.volume, 40), pairing: str(b.pairing, 300),
    vegan: chk(b.vegan), featured: chk(b.featured), shippable: chk(b.shippable), active: chk(b.active),
    sort: clampInt(b.sort, -9999, 9999, 0),
    image: existing ? existing.image : '',
  };
  const errors = [];
  if (!data.name) errors.push('El nombre es obligatorio.');
  if (data.price_cents === null || data.price_cents < 0) errors.push('Indica un precio válido (ej. 12,50).');
  if (errors.length) return res.status(422).render('admin/product-form', { product: { ...existing, ...data, id }, categories: await categoriesSorted(), errors });
  if (req.file) data.image = (await saveImage(req.file)) || data.image;
  if (b.remove_image) data.image = '';
  data.slug = b.slug ? await uniqueSlug(products, b.slug, id) : (existing ? existing.slug : await uniqueSlug(products, data.name));
  data.updated_at = now();
  if (existing) {
    await products.updateOne({ id }, { $set: data });
    return back(res, `/admin/productos/${id}`, 'Producto guardado');
  }
  const newId = await nextId('products');
  await products.insertOne({ ...data, id: newId, created_at: now() });
  back(res, `/admin/productos/${newId}`, 'Producto creado');
});

router.post('/productos/:id/eliminar', async (req, res) => {
  await (await col('products')).deleteOne({ id: intId(req.params.id) });
  back(res, '/admin/productos', 'Producto eliminado');
});

router.post('/productos/:id/duplicar', async (req, res, next) => {
  const p = await findOne('products', { id: intId(req.params.id) });
  if (!p) return next();
  const products = await col('products');
  const copy = { ...p, id: await nextId('products'), name: `${p.name} (copia)`, active: 0, created_at: now(), updated_at: now() };
  copy.slug = await uniqueSlug(products, copy.name);
  await products.insertOne(copy);
  back(res, `/admin/productos/${copy.id}`, 'Copia creada (oculta hasta que la actives)');
});

// Edición rápida de stock / precio / visibilidad desde el listado.
router.post('/productos/:id/rapido', async (req, res) => {
  const b = req.body;
  const set = {};
  if (b.stock !== undefined) set.stock = clampInt(b.stock, 0, 100000, 0);
  if (b.price !== undefined && parseEuros(b.price) !== null) set.price_cents = parseEuros(b.price);
  if (b.active !== undefined) set.active = b.active === '1' ? 1 : 0;
  if (Object.keys(set).length) await (await col('products')).updateOne({ id: intId(req.params.id) }, { $set: { ...set, updated_at: now() } });
  if (req.get('accept')?.includes('json')) return res.json({ ok: true });
  back(res, req.get('referer')?.replace(/[?&]ok=[^&]*/, '') || '/admin/productos', 'Cambios guardados');
});

// ---- Importar / exportar CSV --------------------------------------------------

const CSV_COLS = ['nombre', 'categoria', 'precio', 'precio_anterior', 'stock', 'region', 'uva', 'anada', 'formato', 'maridaje', 'descripcion_corta', 'descripcion', 'vegano', 'destacado', 'activo', 'imagen_url'];
const absUrl = (base, u) => (!u ? '' : /^https?:/.test(u) ? u : base + u);

router.get('/productos-exportar.csv', async (req, res) => {
  const rows = await find('products', {}, { sort: { id: 1 } }).then(withCategories);
  const base = res.locals.baseUrl;
  const data = rows.map((p) => [p.name, p.category_slug || '', (p.price_cents / 100).toFixed(2), p.compare_cents ? (p.compare_cents / 100).toFixed(2) : '',
    p.stock, p.region, p.grape, p.vintage, p.volume, p.pairing, p.short_desc, p.description, p.vegan ? 'si' : 'no', p.featured ? 'si' : 'no',
    p.active ? 'si' : 'no', absUrl(base, p.image)]);
  res.type('text/csv; charset=utf-8').attachment('productos-elcatavinos.csv').send('﻿' + toCsv([CSV_COLS, ...data]));
});

router.get('/productos-importar', (req, res) => res.render('admin/import', { result: null, cols: CSV_COLS }));

router.post('/productos-importar', csvUpload.single('csv'), async (req, res) => {
  if (!req.file) return res.render('admin/import', { result: { errors: ['Selecciona un archivo CSV.'], created: 0, updated: 0 }, cols: CSV_COLS });
  const rows = parseCsv(req.file.buffer.toString('utf8').replace(/^﻿/, ''));
  const header = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(CSV_COLS.map((c) => [c, header.indexOf(c)]));
  const result = { created: 0, updated: 0, errors: [] };
  if (idx.nombre < 0 || idx.precio < 0) result.errors.push('El CSV debe tener al menos las columnas "nombre" y "precio".');
  const cats = new Map((await find('categories')).flatMap((c) => [[c.slug, c.id], [c.name.toLowerCase(), c.id]]));
  const yes = (v, d) => (v === undefined || v === '' ? d : /^(s|si|sí|y|yes|1|true|x)$/i.test(v.trim()) ? 1 : 0);
  const products = await col('products');
  for (const [n, r] of (result.errors.length ? [] : rows.entries())) {
    const g = (c) => (idx[c] >= 0 ? (r[idx[c]] ?? '').trim() : undefined);
    if (!r.some((x) => x && x.trim())) continue;
    const name = g('nombre');
    const price = parseEuros(g('precio'));
    if (!name || price === null) { result.errors.push(`Fila ${n + 2}: falta nombre o precio.`); continue; }
    let image;
    const url = g('imagen_url');
    if (url && /^https?:\/\//.test(url) && !url.startsWith(res.locals.baseUrl)) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        image = await saveImage({ buffer: Buffer.from(await resp.arrayBuffer()) });
        if (!image) throw new Error('no es una imagen válida');
      } catch (e) { result.errors.push(`Fila ${n + 2}: no se pudo descargar la imagen (${e.message}).`); }
    }
    const data = {
      name, price_cents: price, compare_cents: parseEuros(g('precio_anterior')),
      stock: clampInt(g('stock'), 0, 100000, 0),
      region: g('region') || '', grape: g('uva') || '', vintage: g('anada') || '', volume: g('formato') || '', pairing: g('maridaje') || '',
      short_desc: g('descripcion_corta') || '', description: g('descripcion') || '',
      vegan: yes(g('vegano'), 0), featured: yes(g('destacado'), 0), active: yes(g('activo'), 1), updated_at: now(),
    };
    const catId = cats.get((g('categoria') || '').toLowerCase());
    if (catId) data.category_id = catId;
    if (image) data.image = image;
    const existing = await findOne('products', { name });
    if (existing) {
      await products.updateOne({ id: existing.id }, { $set: data });
      result.updated++;
    } else {
      await products.insertOne({
        category_id: null, image: '', shippable: 1, sort: 0, ...data,
        id: await nextId('products'), slug: await uniqueSlug(products, name), created_at: now(),
      });
      result.created++;
    }
  }
  res.render('admin/import', { result, cols: CSV_COLS });
});

router.get('/productos-plantilla.csv', (req, res) => {
  const example = ['Protos Roble', 'tintos', '12,50', '', '24', 'D.O. Ribera del Duero', 'Tinto Fino', '2023', '75 cl', 'Carnes a la brasa', 'Ribera fresco y frutal', '', 'no', 'si', 'si', 'https://ejemplo.com/foto.jpg'];
  res.type('text/csv; charset=utf-8').attachment('plantilla-productos.csv').send('﻿' + toCsv([CSV_COLS, example]));
});

// ---- Categorías -------------------------------------------------------------

router.get('/categorias', async (req, res) => {
  const [categories, counts] = await Promise.all([
    categoriesSorted(),
    (await col('products')).aggregate([{ $group: { _id: '$category_id', n: { $sum: 1 } } }]).toArray(),
  ]);
  const n = new Map(counts.map((c) => [c._id, c.n]));
  categories.forEach((c) => { c.n = n.get(c.id) || 0; });
  res.render('admin/categories', { categories });
});

router.post('/categorias', async (req, res) => {
  const name = str(req.body.name, 100);
  if (name) {
    const cats = await col('categories');
    await cats.insertOne({ id: await nextId('categories'), name, slug: await uniqueSlug(cats, name), description: str(req.body.description, 600), image: '', sort: clampInt(req.body.sort, -999, 999, 99) });
  }
  back(res, '/admin/categorias', 'Categoría creada');
});

router.post('/categorias/:id', async (req, res) => {
  const b = req.body;
  const id = intId(req.params.id);
  if (b.delete) {
    await (await col('categories')).deleteOne({ id });
    await (await col('products')).updateMany({ category_id: id }, { $set: { category_id: null } });
    return back(res, '/admin/categorias', 'Categoría eliminada (sus productos quedan sin categoría)');
  }
  await (await col('categories')).updateOne({ id }, { $set: { name: str(b.name, 100), description: str(b.description, 600), sort: clampInt(b.sort, -999, 999, 0) } });
  back(res, '/admin/categorias', 'Categoría guardada');
});

// ---- Pedidos ----------------------------------------------------------------

router.get('/pedidos', async (req, res) => {
  const status = orders.STATUS_LABELS[req.query.estado] ? req.query.estado : '';
  const q = str(req.query.q, 80);
  const where = {};
  if (status) where.status = status;
  if (q) { const rx = new RegExp(escapeRegex(q), 'i'); where.$or = [{ number: rx }, { customer_name: rx }, { email: rx }]; }
  const list = await find('orders', where, { sort: { id: -1 }, limit: 300 });
  res.render('admin/orders', { list, status, q });
});

router.get('/pedidos/:number', async (req, res, next) => {
  const order = await orders.getOrder(req.params.number);
  if (!order) return next();
  res.render('admin/order', { order });
});

router.post('/pedidos/:number', async (req, res, next) => {
  const order = await orders.getOrder(req.params.number);
  if (!order) return next();
  const c = await col('orders');
  if (req.body.status && req.body.status !== order.status) {
    if (req.body.status === 'pagado' && !order.paid_at) await c.updateOne({ id: order.id }, { $set: { paid_at: now() } });
    await orders.setStatus(order, req.body.status);
  }
  await c.updateOne({ id: order.id }, { $set: { admin_notes: str(req.body.admin_notes) } });
  back(res, `/admin/pedidos/${order.number}`, 'Pedido actualizado');
});

// ---- Reservas de catas -------------------------------------------------------

const BOOKING_STATUS = { pendiente: 'Pendiente', confirmada: 'Confirmada', realizada: 'Realizada', cancelada: 'Cancelada' };

router.get('/reservas', async (req, res) => {
  const status = BOOKING_STATUS[req.query.estado] ? req.query.estado : '';
  const list = await find('bookings', status ? { status } : {}, { sort: { date: -1 }, limit: 300 });
  list.sort((a, b) => (a.status === 'pendiente' ? 0 : 1) - (b.status === 'pendiente' ? 0 : 1));
  res.render('admin/bookings', { list, status, BOOKING_STATUS });
});

router.post('/reservas/:id', async (req, res) => {
  const b = req.body;
  const c = await col('bookings');
  if (b.delete) {
    await c.deleteOne({ id: intId(req.params.id) });
    return back(res, '/admin/reservas', 'Reserva eliminada');
  }
  await c.updateOne({ id: intId(req.params.id) }, { $set: { status: BOOKING_STATUS[b.status] ? b.status : 'pendiente', admin_notes: str(b.admin_notes) } });
  back(res, '/admin/reservas', 'Reserva actualizada');
});

// ---- Catas (tipos) -----------------------------------------------------------

router.get('/catas', async (req, res) => {
  res.render('admin/tastings', { list: await find('tastings', {}, { sort: { sort: 1, id: 1 } }) });
});

router.get('/catas/:id', async (req, res, next) => {
  const t = req.params.id === 'nueva' ? { active: 1, min_people: 6, max_people: 10 } : await findOne('tastings', { id: intId(req.params.id) });
  if (!t) return next();
  res.render('admin/tasting-form', { t });
});

router.post('/catas/:id', upload.single('image_file'), async (req, res, next) => {
  const b = req.body;
  const c = await col('tastings');
  const isNew = req.params.id === 'nueva';
  const existing = isNew ? null : await findOne('tastings', { id: intId(req.params.id) });
  if (!isNew && !existing) return next();
  if (b.delete && existing) {
    await c.deleteOne({ id: existing.id });
    return back(res, '/admin/catas', 'Cata eliminada');
  }
  const data = {
    name: str(b.name, 120) || 'Cata', subtitle: str(b.subtitle, 160), description: str(b.description, 6000), duration: str(b.duration, 80),
    price_text: str(b.price_text, 120), min_people: clampInt(b.min_people, 1, 200, 6), max_people: clampInt(b.max_people, 1, 200, 10),
    active: chk(b.active), sort: clampInt(b.sort, -999, 999, 0), image: existing ? existing.image : '',
  };
  if (req.file) data.image = (await saveImage(req.file)) || data.image;
  if (existing) {
    await c.updateOne({ id: existing.id }, { $set: data });
    return back(res, `/admin/catas/${existing.id}`, 'Cata guardada');
  }
  const id = await nextId('tastings');
  await c.insertOne({ ...data, id, slug: await uniqueSlug(c, data.name) });
  back(res, `/admin/catas/${id}`, 'Cata creada');
});

// ---- Blog -------------------------------------------------------------------

router.get('/blog', async (req, res) => {
  res.render('admin/posts', { list: await find('posts', {}, { sort: { published_at: -1, id: -1 } }) });
});

router.get('/blog/:id', async (req, res, next) => {
  const post = req.params.id === 'nuevo' ? { published: 1, published_at: new Date().toISOString().slice(0, 10) } : await findOne('posts', { id: intId(req.params.id) });
  if (!post) return next();
  res.render('admin/post-form', { post });
});

router.post('/blog/:id', upload.single('image_file'), async (req, res, next) => {
  const b = req.body;
  const c = await col('posts');
  const isNew = req.params.id === 'nuevo';
  const existing = isNew ? null : await findOne('posts', { id: intId(req.params.id) });
  if (!isNew && !existing) return next();
  if (b.delete && existing) {
    await c.deleteOne({ id: existing.id });
    return back(res, '/admin/blog', 'Artículo eliminado');
  }
  const data = {
    title: str(b.title, 200) || 'Sin título', excerpt: str(b.excerpt, 400), body: str(b.body, 50000), published: chk(b.published),
    published_at: /^\d{4}-\d{2}-\d{2}$/.test(b.published_at) ? b.published_at : new Date().toISOString().slice(0, 10),
    image: existing ? existing.image : '/img/site/copa-tinto.webp',
  };
  if (req.file) data.image = (await saveImage(req.file)) || data.image;
  if (existing) {
    await c.updateOne({ id: existing.id }, { $set: data });
    return back(res, `/admin/blog/${existing.id}`, 'Artículo guardado');
  }
  const id = await nextId('posts');
  await c.insertOne({ ...data, id, slug: await uniqueSlug(c, data.title), created_at: now() });
  back(res, `/admin/blog/${id}`, 'Artículo creado');
});

// ---- Mensajes ---------------------------------------------------------------

router.get('/mensajes', async (req, res) => {
  res.render('admin/messages', { list: await find('messages', {}, { sort: { id: -1 }, limit: 300 }) });
});

router.post('/mensajes/:id', async (req, res) => {
  const c = await col('messages');
  const id = intId(req.params.id);
  if (req.body.delete) await c.deleteOne({ id });
  else await c.updateOne({ id }, { $set: { is_read: req.body.read === '1' ? 1 : 0 } });
  back(res, '/admin/mensajes', req.body.delete ? 'Mensaje eliminado' : 'Mensaje actualizado');
});

// ---- Ajustes y textos -------------------------------------------------------

const TEXT_KEYS = ['business_name', 'tagline', 'phone', 'phone_intl', 'whatsapp', 'email', 'address_line', 'address_city', 'maps_url', 'maps_embed_query',
  'instagram_url', 'google_url', 'announcement', 'intro_title', 'intro_text', 'groups_title', 'groups_text', 'catas_intro_title', 'catas_intro_text',
  'catas_detail_title', 'catas_detail_text', 'about_title', 'about_text', 'about_text_2', 'shop_intro', 'delivery_postcode_prefixes', 'delivery_info',
  'pickup_info', 'transfer_instructions', 'notify_email', 'seo_title', 'seo_description', 'legal_notice', 'privacy_policy', 'terms', 'cookies_policy'];
const BOOL_KEYS = ['payment_card_enabled', 'payment_store_enabled', 'payment_transfer_enabled', 'shop_enabled'];
const MONEY_KEYS = ['free_shipping_threshold_cents', 'shipping_fee_cents'];

router.get(['/ajustes', '/textos', '/legal', '/portada'], (req, res) => {
  res.render(`admin/settings-${req.path.slice(1)}`, { cardAvailable: cardEnabled() });
});

router.post(['/ajustes', '/textos', '/legal'], async (req, res) => {
  const b = req.body;
  const writes = [];
  for (const k of TEXT_KEYS) if (b[k] !== undefined) writes.push(setSetting(k, str(b[k], 50000)));
  if (b._form === 'ajustes') {
    for (const k of BOOL_KEYS) writes.push(setSetting(k, !!b[k]));
    for (const k of MONEY_KEYS) { const v = parseEuros(b[k]); if (v !== null) writes.push(setSetting(k, v)); }
    const times = [].concat(b.hours_time || []);
    const hours = [].concat(b.hours_days || []).map((d, i) => ({ days: str(d, 60), time: str(times[i], 80) })).filter((h) => h.days);
    writes.push(setSetting('hours', hours));
  }
  if (b._form === 'textos') {
    const texts = [].concat(b.value_text || []);
    const values = [].concat(b.value_title || []).map((t, i) => ({ title: str(t, 80), text: str(texts[i], 400) })).filter((v) => v.title);
    writes.push(setSetting('values', values));
  }
  await Promise.all(writes);
  back(res, req.path, 'Cambios guardados');
});

router.post('/portada', upload.any(), async (req, res) => {
  const b = req.body;
  const current = (await getSettings()).hero_slides;
  const titles = [].concat(b.title || []);
  const removed = [].concat(b.remove || []);
  const slides = [];
  for (let i = 0; i < titles.length; i++) {
    if (removed.includes(String(i))) continue;
    const file = (req.files || []).find((f) => f.fieldname === `image_${i}`);
    const at = (k) => str([].concat(b[k] || [])[i], 600);
    slides.push({
      title: str(titles[i], 200), subtitle: at('subtitle'), text: at('text'), cta_label: at('cta_label'), cta_url: at('cta_url'),
      image: (file && await saveImage(file, { width: 1920 })) || at('image') || (current[i] && current[i].image) || '/img/site/hero-rosado.webp',
    });
  }
  if (b.add) slides.push({ title: 'Nueva diapositiva', subtitle: '', text: '', cta_label: '', cta_url: '', image: '/img/site/copas-fila.webp' });
  await Promise.all([
    setSetting('hero_slides', slides.filter((s) => s.title)),
    setSetting('intro_title', str(b.intro_title, 200)),
    setSetting('intro_text', str(b.intro_text, 3000)),
    setSetting('groups_title', str(b.groups_title, 200)),
    setSetting('groups_text', str(b.groups_text, 3000)),
  ]);
  back(res, '/admin/portada', 'Portada guardada');
});

// ---- Cuenta y usuarios ------------------------------------------------------

const adminList = () => find('admins', {}, { sort: { id: 1 }, projection: { password_hash: 0 } });

router.get('/cuenta', async (req, res) => {
  res.render('admin/account', { admins: await adminList(), error: null });
});

router.post('/cuenta', async (req, res) => {
  const b = req.body;
  const fail = async (error) => res.status(422).render('admin/account', { admins: await adminList(), error });
  const admins = await col('admins');
  if (b.action === 'password') {
    const me = await findOne('admins', { id: req.admin.id });
    if (!bcrypt.compareSync(String(b.current || ''), me.password_hash)) return fail('La contraseña actual no es correcta.');
    if (String(b.password || '').length < 8) return fail('La nueva contraseña debe tener al menos 8 caracteres.');
    await admins.updateOne({ id: me.id }, { $set: { password_hash: auth.hashPassword(b.password) } });
    await (await col('sessions')).deleteMany({ admin_id: me.id, token: { $ne: req.cookies.admin_session } });
    return back(res, '/admin/cuenta', 'Contraseña cambiada');
  }
  if (b.action === 'add') {
    const email = str(b.email, 160).toLowerCase();
    if (!isEmail(email) || String(b.password || '').length < 8) return fail('Indica un email válido y una contraseña de al menos 8 caracteres.');
    if (await findOne('admins', { email })) return fail('Ya existe un usuario con ese email.');
    await auth.createAdmin(email, b.password, str(b.name, 80));
    return back(res, '/admin/cuenta', 'Usuario añadido');
  }
  if (b.action === 'remove' && intId(b.id) !== req.admin.id) {
    await admins.deleteOne({ id: intId(b.id) });
    await (await col('sessions')).deleteMany({ admin_id: intId(b.id) });
    return back(res, '/admin/cuenta', 'Usuario eliminado');
  }
  res.redirect('/admin/cuenta');
});

router.use((req, res) => res.status(404).render('admin/notfound'));

module.exports = router;

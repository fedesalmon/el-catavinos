const express = require('express');
const { db, getSettings, setSetting } = require('../db');
const auth = require('../lib/auth');
const { upload, saveImage } = require('../lib/images');
const { parseEuros, uniqueSlug, isEmail, clampInt } = require('../lib/util');
const orders = require('../lib/orders');
const { parseCsv, toCsv } = require('../lib/csv');
const { mailEnabled } = require('../lib/mail');
const { cardEnabled } = require('../lib/payments');

const router = express.Router();
const csvUpload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.locals.section = req.path.split('/')[1] || 'inicio';
  res.locals.counts = req.admin ? {
    orders: db.prepare("SELECT COUNT(*) n FROM orders WHERE status = 'pagado' OR (status = 'pendiente_pago' AND payment_method != 'tarjeta')").get().n,
    bookings: db.prepare("SELECT COUNT(*) n FROM bookings WHERE status = 'pendiente'").get().n,
    messages: db.prepare('SELECT COUNT(*) n FROM messages WHERE is_read = 0').get().n,
  } : {};
  next();
});

const back = (res, url, msg) => res.redirect(303, `${url}${url.includes('?') ? '&' : '?'}ok=${encodeURIComponent(msg)}`);
const chk = (v) => (v ? 1 : 0);
const str = (v, n = 5000) => String(v ?? '').trim().slice(0, n);

// ---- Login ------------------------------------------------------------------

router.get('/login', (req, res) => {
  if (req.admin) return res.redirect('/admin');
  res.render('admin/login', { error: null, next: req.query.next || '/admin' });
});

router.post('/login', (req, res) => {
  const nextUrl = String(req.body.next || '/admin').startsWith('/admin') ? req.body.next : '/admin';
  if (auth.loginThrottle(req)) return res.status(429).render('admin/login', { error: 'Demasiados intentos. Espera 15 minutos.', next: nextUrl });
  if (!auth.login(req, res, req.body.email, req.body.password)) {
    auth.recordFailedLogin(req);
    return res.status(401).render('admin/login', { error: 'Email o contraseña incorrectos.', next: nextUrl });
  }
  res.redirect(303, nextUrl);
});

router.post('/logout', (req, res) => { auth.logout(req, res); res.redirect(303, '/admin/login'); });

router.use(auth.requireAdmin);

// ---- Inicio -----------------------------------------------------------------

router.get('/', (req, res) => {
  const stats = {
    sales30: db.prepare("SELECT COALESCE(SUM(total_cents),0) s, COUNT(*) n FROM orders WHERE status NOT IN ('cancelado','pendiente_pago') AND created_at >= datetime('now','-30 days')").get(),
    products: db.prepare('SELECT COUNT(*) n FROM products WHERE active = 1').get().n,
    lowStock: db.prepare('SELECT id, name, stock FROM products WHERE active = 1 AND stock <= 3 ORDER BY stock LIMIT 8').all(),
  };
  const recentOrders = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 6').all();
  const pendingBookings = db.prepare("SELECT * FROM bookings WHERE status = 'pendiente' ORDER BY date LIMIT 6").all();
  const unread = db.prepare('SELECT * FROM messages WHERE is_read = 0 ORDER BY id DESC LIMIT 5').all();
  res.render('admin/dashboard', { stats, recentOrders, pendingBookings, unread, setup: { mail: mailEnabled(), card: cardEnabled() } });
});

// ---- Productos --------------------------------------------------------------

router.get('/productos', (req, res) => {
  const q = str(req.query.q, 80);
  const cat = parseInt(req.query.cat, 10) || 0;
  const where = ['1=1'];
  const params = [];
  if (q) { where.push('(p.name LIKE ? OR p.region LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (cat) { where.push('p.category_id = ?'); params.push(cat); }
  if (req.query.estado === 'ocultos') where.push('p.active = 0');
  if (req.query.estado === 'agotados') where.push('p.stock <= 0');
  const products = db.prepare(`SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${where.join(' AND ')} ORDER BY c.sort, p.sort, p.name`).all(...params);
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort, name').all();
  res.render('admin/products', { products, categories, q, cat, estado: req.query.estado || '' });
});

function productForm(res, product) {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort, name').all();
  res.render('admin/product-form', { product, categories, errors: [] });
}

router.get('/productos/nuevo', (req, res) => productForm(res, { active: 1, shippable: 1, stock: 10, category_id: parseInt(req.query.cat, 10) || null }));

router.get('/productos/:id', (req, res, next) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return next();
  productForm(res, p);
});

router.post(['/productos/nuevo', '/productos/:id'], upload.single('image_file'), async (req, res, next) => {
  try {
    const b = req.body;
    const id = req.params.id ? parseInt(req.params.id, 10) : null;
    const existing = id ? db.prepare('SELECT * FROM products WHERE id = ?').get(id) : null;
    if (id && !existing) return next();
    const data = {
      name: str(b.name, 200),
      category_id: parseInt(b.category_id, 10) || null,
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
    if (errors.length) {
      const categories = db.prepare('SELECT * FROM categories ORDER BY sort, name').all();
      return res.status(422).render('admin/product-form', { product: { ...existing, ...data, id }, categories, errors });
    }
    if (req.file) data.image = (await saveImage(req.file)) || data.image;
    if (b.remove_image) data.image = '';
    data.slug = b.slug ? uniqueSlug(db, 'products', b.slug, id) : (existing ? existing.slug : uniqueSlug(db, 'products', data.name));
    if (existing) {
      db.prepare(`UPDATE products SET name=@name, slug=@slug, category_id=@category_id, short_desc=@short_desc, description=@description,
        price_cents=@price_cents, compare_cents=@compare_cents, stock=@stock, region=@region, grape=@grape, vintage=@vintage, volume=@volume,
        pairing=@pairing, vegan=@vegan, featured=@featured, shippable=@shippable, active=@active, sort=@sort, image=@image,
        updated_at=datetime('now') WHERE id=@id`).run({ ...data, id });
      return back(res, `/admin/productos/${id}`, 'Producto guardado');
    }
    const r = db.prepare(`INSERT INTO products (name, slug, category_id, short_desc, description, price_cents, compare_cents, stock, region, grape,
      vintage, volume, pairing, vegan, featured, shippable, active, sort, image) VALUES (@name, @slug, @category_id, @short_desc, @description,
      @price_cents, @compare_cents, @stock, @region, @grape, @vintage, @volume, @pairing, @vegan, @featured, @shippable, @active, @sort, @image)`).run(data);
    back(res, `/admin/productos/${r.lastInsertRowid}`, 'Producto creado');
  } catch (err) { next(err); }
});

router.post('/productos/:id/eliminar', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  back(res, '/admin/productos', 'Producto eliminado');
});

router.post('/productos/:id/duplicar', (req, res, next) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return next();
  delete p.id; delete p.created_at; delete p.updated_at;
  p.name += ' (copia)'; p.slug = uniqueSlug(db, 'products', p.name); p.active = 0;
  const cols = Object.keys(p);
  const r = db.prepare(`INSERT INTO products (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`).run(p);
  back(res, `/admin/productos/${r.lastInsertRowid}`, 'Copia creada (oculta hasta que la actives)');
});

// Edición rápida de stock / precio / visibilidad desde el listado.
router.post('/productos/:id/rapido', (req, res) => {
  const b = req.body;
  const sets = [];
  const params = {};
  if (b.stock !== undefined) { sets.push('stock = @stock'); params.stock = clampInt(b.stock, 0, 100000, 0); }
  if (b.price !== undefined && parseEuros(b.price) !== null) { sets.push('price_cents = @price'); params.price = parseEuros(b.price); }
  if (b.active !== undefined) { sets.push('active = @active'); params.active = b.active === '1' ? 1 : 0; }
  if (sets.length) db.prepare(`UPDATE products SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = @id`).run({ ...params, id: req.params.id });
  if (req.get('accept')?.includes('json')) return res.json({ ok: true });
  back(res, req.get('referer')?.replace(/[?&]ok=[^&]*/, '') || '/admin/productos', 'Cambios guardados');
});

// ---- Importar / exportar CSV --------------------------------------------------

const CSV_COLS = ['nombre', 'categoria', 'precio', 'precio_anterior', 'stock', 'region', 'uva', 'anada', 'formato', 'maridaje', 'descripcion_corta', 'descripcion', 'vegano', 'destacado', 'activo', 'imagen_url'];

router.get('/productos-exportar.csv', (req, res) => {
  const rows = db.prepare('SELECT p.*, c.slug AS cat FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.id').all();
  const base = res.locals.baseUrl;
  const data = rows.map((p) => [p.name, p.cat || '', (p.price_cents / 100).toFixed(2), p.compare_cents ? (p.compare_cents / 100).toFixed(2) : '',
    p.stock, p.region, p.grape, p.vintage, p.volume, p.pairing, p.short_desc, p.description, p.vegan ? 'si' : 'no', p.featured ? 'si' : 'no',
    p.active ? 'si' : 'no', p.image ? base + p.image : '']);
  res.type('text/csv; charset=utf-8').attachment('productos-elcatavinos.csv').send('﻿' + toCsv([CSV_COLS, ...data]));
});

router.get('/productos-importar', (req, res) => res.render('admin/import', { result: null, cols: CSV_COLS }));

router.post('/productos-importar', csvUpload.single('csv'), async (req, res, next) => {
  try {
    if (!req.file) return res.render('admin/import', { result: { errors: ['Selecciona un archivo CSV.'], created: 0, updated: 0 }, cols: CSV_COLS });
    const rows = parseCsv(req.file.buffer.toString('utf8').replace(/^﻿/, ''));
    const header = (rows.shift() || []).map((h) => h.trim().toLowerCase());
    const idx = Object.fromEntries(CSV_COLS.map((c) => [c, header.indexOf(c)]));
    const result = { created: 0, updated: 0, errors: [] };
    if (idx.nombre < 0 || idx.precio < 0) result.errors.push('El CSV debe tener al menos las columnas "nombre" y "precio".');
    const cats = Object.fromEntries(db.prepare('SELECT slug, id, name FROM categories').all().flatMap((c) => [[c.slug, c.id], [c.name.toLowerCase(), c.id]]));
    const yes = (v, d) => (v === undefined || v === '' ? d : /^(s|si|sí|y|yes|1|true|x)$/i.test(v.trim()) ? 1 : 0);
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
      const catKey = (g('categoria') || '').toLowerCase();
      const data = {
        name, price_cents: price, compare_cents: parseEuros(g('precio_anterior')),
        category_id: cats[catKey] ?? null,
        stock: clampInt(g('stock'), 0, 100000, 0),
        region: g('region') || '', grape: g('uva') || '', vintage: g('anada') || '', volume: g('formato') || '', pairing: g('maridaje') || '',
        short_desc: g('descripcion_corta') || '', description: g('descripcion') || '',
        vegan: yes(g('vegano'), 0), featured: yes(g('destacado'), 0), active: yes(g('activo'), 1),
      };
      const existing = db.prepare('SELECT id, image FROM products WHERE name = ?').get(name);
      if (existing) {
        db.prepare(`UPDATE products SET price_cents=@price_cents, compare_cents=@compare_cents, category_id=COALESCE(@category_id, category_id), stock=@stock,
          region=@region, grape=@grape, vintage=@vintage, volume=@volume, pairing=@pairing, short_desc=@short_desc, description=@description,
          vegan=@vegan, featured=@featured, active=@active, image=@image, updated_at=datetime('now') WHERE id=@id`)
          .run({ ...data, image: image || existing.image, id: existing.id });
        result.updated++;
      } else {
        db.prepare(`INSERT INTO products (name, slug, price_cents, compare_cents, category_id, stock, region, grape, vintage, volume, pairing, short_desc,
          description, vegan, featured, active, image) VALUES (@name, @slug, @price_cents, @compare_cents, @category_id, @stock, @region, @grape, @vintage,
          @volume, @pairing, @short_desc, @description, @vegan, @featured, @active, @image)`).run({ ...data, slug: uniqueSlug(db, 'products', name), image: image || '' });
        result.created++;
      }
    }
    res.render('admin/import', { result, cols: CSV_COLS });
  } catch (err) { next(err); }
});

router.get('/productos-plantilla.csv', (req, res) => {
  const example = ['Protos Roble', 'tintos', '12,50', '', '24', 'D.O. Ribera del Duero', 'Tinto Fino', '2023', '75 cl', 'Carnes a la brasa', 'Ribera fresco y frutal', '', 'no', 'si', 'si', 'https://ejemplo.com/foto.jpg'];
  res.type('text/csv; charset=utf-8').attachment('plantilla-productos.csv').send('﻿' + toCsv([CSV_COLS, example]));
});

// ---- Categorías -------------------------------------------------------------

router.get('/categorias', (req, res) => {
  const categories = db.prepare('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) n FROM categories c ORDER BY sort, name').all();
  res.render('admin/categories', { categories });
});

router.post('/categorias', (req, res) => {
  const name = str(req.body.name, 100);
  if (name) {
    db.prepare('INSERT INTO categories (name, slug, description, sort) VALUES (?, ?, ?, ?)')
      .run(name, uniqueSlug(db, 'categories', name), str(req.body.description, 600), clampInt(req.body.sort, -999, 999, 99));
  }
  back(res, '/admin/categorias', 'Categoría creada');
});

router.post('/categorias/:id', (req, res) => {
  const b = req.body;
  if (b.delete) {
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    return back(res, '/admin/categorias', 'Categoría eliminada (sus productos quedan sin categoría)');
  }
  db.prepare('UPDATE categories SET name = ?, description = ?, sort = ? WHERE id = ?')
    .run(str(b.name, 100), str(b.description, 600), clampInt(b.sort, -999, 999, 0), req.params.id);
  back(res, '/admin/categorias', 'Categoría guardada');
});

// ---- Pedidos ----------------------------------------------------------------

router.get('/pedidos', (req, res) => {
  const status = orders.STATUS_LABELS[req.query.estado] ? req.query.estado : '';
  const q = str(req.query.q, 80);
  const where = ['1=1'];
  const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (q) { where.push('(number LIKE ? OR customer_name LIKE ? OR email LIKE ?)'); params.push(...Array(3).fill(`%${q}%`)); }
  const list = db.prepare(`SELECT * FROM orders WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 300`).all(...params);
  res.render('admin/orders', { list, status, q });
});

router.get('/pedidos/:number', (req, res, next) => {
  const order = orders.getOrder(req.params.number);
  if (!order) return next();
  res.render('admin/order', { order });
});

router.post('/pedidos/:number', (req, res, next) => {
  const order = orders.getOrder(req.params.number);
  if (!order) return next();
  if (req.body.status && req.body.status !== order.status) {
    if (req.body.status === 'pagado' && !order.paid_at) db.prepare("UPDATE orders SET paid_at = datetime('now') WHERE id = ?").run(order.id);
    orders.setStatus(order, req.body.status);
  }
  db.prepare('UPDATE orders SET admin_notes = ? WHERE id = ?').run(str(req.body.admin_notes), order.id);
  back(res, `/admin/pedidos/${order.number}`, 'Pedido actualizado');
});

// ---- Reservas de catas -------------------------------------------------------

const BOOKING_STATUS = { pendiente: 'Pendiente', confirmada: 'Confirmada', realizada: 'Realizada', cancelada: 'Cancelada' };

router.get('/reservas', (req, res) => {
  const status = BOOKING_STATUS[req.query.estado] ? req.query.estado : '';
  const list = db.prepare(`SELECT * FROM bookings ${status ? 'WHERE status = ?' : ''} ORDER BY CASE status WHEN 'pendiente' THEN 0 ELSE 1 END, date DESC LIMIT 300`)
    .all(...(status ? [status] : []));
  res.render('admin/bookings', { list, status, BOOKING_STATUS });
});

router.post('/reservas/:id', (req, res) => {
  const b = req.body;
  if (b.delete) {
    db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
    return back(res, '/admin/reservas', 'Reserva eliminada');
  }
  const status = BOOKING_STATUS[b.status] ? b.status : 'pendiente';
  db.prepare('UPDATE bookings SET status = ?, admin_notes = ? WHERE id = ?').run(status, str(b.admin_notes), req.params.id);
  back(res, '/admin/reservas', 'Reserva actualizada');
});

// ---- Catas (tipos) -----------------------------------------------------------

router.get('/catas', (req, res) => {
  res.render('admin/tastings', { list: db.prepare('SELECT * FROM tastings ORDER BY sort, id').all() });
});

router.get('/catas/:id', (req, res, next) => {
  const t = req.params.id === 'nueva' ? { active: 1, min_people: 6, max_people: 10 } : db.prepare('SELECT * FROM tastings WHERE id = ?').get(req.params.id);
  if (!t) return next();
  res.render('admin/tasting-form', { t });
});

router.post('/catas/:id', upload.single('image_file'), async (req, res, next) => {
  try {
    const b = req.body;
    const isNew = req.params.id === 'nueva';
    const existing = isNew ? null : db.prepare('SELECT * FROM tastings WHERE id = ?').get(req.params.id);
    if (!isNew && !existing) return next();
    if (b.delete && existing) {
      db.prepare('DELETE FROM tastings WHERE id = ?').run(existing.id);
      return back(res, '/admin/catas', 'Cata eliminada');
    }
    const data = {
      name: str(b.name, 120) || 'Cata', subtitle: str(b.subtitle, 160), description: str(b.description, 6000), duration: str(b.duration, 80),
      price_text: str(b.price_text, 120), min_people: clampInt(b.min_people, 1, 200, 6), max_people: clampInt(b.max_people, 1, 200, 10),
      active: chk(b.active), sort: clampInt(b.sort, -999, 999, 0), image: existing ? existing.image : '',
    };
    if (req.file) data.image = (await saveImage(req.file)) || data.image;
    if (existing) {
      db.prepare(`UPDATE tastings SET name=@name, subtitle=@subtitle, description=@description, duration=@duration, price_text=@price_text,
        min_people=@min_people, max_people=@max_people, active=@active, sort=@sort, image=@image WHERE id=@id`).run({ ...data, id: existing.id });
      return back(res, `/admin/catas/${existing.id}`, 'Cata guardada');
    }
    const r = db.prepare(`INSERT INTO tastings (slug, name, subtitle, description, duration, price_text, min_people, max_people, active, sort, image)
      VALUES (@slug, @name, @subtitle, @description, @duration, @price_text, @min_people, @max_people, @active, @sort, @image)`)
      .run({ ...data, slug: uniqueSlug(db, 'tastings', data.name) });
    back(res, `/admin/catas/${r.lastInsertRowid}`, 'Cata creada');
  } catch (err) { next(err); }
});

// ---- Blog -------------------------------------------------------------------

router.get('/blog', (req, res) => {
  res.render('admin/posts', { list: db.prepare('SELECT * FROM posts ORDER BY published_at DESC, id DESC').all() });
});

router.get('/blog/:id', (req, res, next) => {
  const post = req.params.id === 'nuevo' ? { published: 1, published_at: new Date().toISOString().slice(0, 10) } : db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return next();
  res.render('admin/post-form', { post });
});

router.post('/blog/:id', upload.single('image_file'), async (req, res, next) => {
  try {
    const b = req.body;
    const isNew = req.params.id === 'nuevo';
    const existing = isNew ? null : db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!isNew && !existing) return next();
    if (b.delete && existing) {
      db.prepare('DELETE FROM posts WHERE id = ?').run(existing.id);
      return back(res, '/admin/blog', 'Artículo eliminado');
    }
    const data = {
      title: str(b.title, 200) || 'Sin título', excerpt: str(b.excerpt, 400), body: str(b.body, 50000), published: chk(b.published),
      published_at: /^\d{4}-\d{2}-\d{2}$/.test(b.published_at) ? b.published_at : new Date().toISOString().slice(0, 10),
      image: existing ? existing.image : '/img/site/copa-tinto.webp',
    };
    if (req.file) data.image = (await saveImage(req.file)) || data.image;
    if (existing) {
      db.prepare('UPDATE posts SET title=@title, excerpt=@excerpt, body=@body, published=@published, published_at=@published_at, image=@image WHERE id=@id')
        .run({ ...data, id: existing.id });
      return back(res, `/admin/blog/${existing.id}`, 'Artículo guardado');
    }
    const r = db.prepare('INSERT INTO posts (slug, title, excerpt, body, published, published_at, image) VALUES (@slug, @title, @excerpt, @body, @published, @published_at, @image)')
      .run({ ...data, slug: uniqueSlug(db, 'posts', data.title) });
    back(res, `/admin/blog/${r.lastInsertRowid}`, 'Artículo creado');
  } catch (err) { next(err); }
});

// ---- Mensajes ---------------------------------------------------------------

router.get('/mensajes', (req, res) => {
  res.render('admin/messages', { list: db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 300').all() });
});

router.post('/mensajes/:id', (req, res) => {
  if (req.body.delete) db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  else db.prepare('UPDATE messages SET is_read = ? WHERE id = ?').run(req.body.read === '1' ? 1 : 0, req.params.id);
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

router.post(['/ajustes', '/textos', '/legal'], (req, res) => {
  const b = req.body;
  for (const k of TEXT_KEYS) if (b[k] !== undefined) setSetting(k, str(b[k], 50000));
  if (b._form === 'ajustes') {
    for (const k of BOOL_KEYS) setSetting(k, !!b[k]);
    for (const k of MONEY_KEYS) { const v = parseEuros(b[k]); if (v !== null) setSetting(k, v); }
    const hours = [].concat(b.hours_days || []).map((d, i) => ({ days: str(d, 60), time: str([].concat(b.hours_time || [])[i], 80) })).filter((h) => h.days);
    setSetting('hours', hours);
  }
  if (b._form === 'textos') {
    const values = [].concat(b.value_title || []).map((t, i) => ({ title: str(t, 80), text: str([].concat(b.value_text || [])[i], 400) })).filter((v) => v.title);
    setSetting('values', values);
  }
  back(res, req.path, 'Cambios guardados');
});

router.post('/portada', upload.any(), async (req, res, next) => {
  try {
    const b = req.body;
    const current = getSettings().hero_slides;
    const titles = [].concat(b.title || []);
    const slides = [];
    for (let i = 0; i < titles.length; i++) {
      if ([].concat(b.remove || []).includes(String(i))) continue;
      const file = (req.files || []).find((f) => f.fieldname === `image_${i}`);
      const at = (k) => str([].concat(b[k] || [])[i], 600);
      slides.push({
        title: str(titles[i], 200), subtitle: at('subtitle'), text: at('text'), cta_label: at('cta_label'), cta_url: at('cta_url'),
        image: (file && await saveImage(file, { width: 1920 })) || (at('image') || (current[i] && current[i].image) || '/img/site/hero-rosado.webp'),
      });
    }
    if (b.add) slides.push({ title: 'Nueva diapositiva', subtitle: '', text: '', cta_label: '', cta_url: '', image: '/img/site/copas-fila.webp' });
    setSetting('hero_slides', slides.filter((s) => s.title));
    setSetting('intro_title', str(b.intro_title, 200));
    setSetting('intro_text', str(b.intro_text, 3000));
    setSetting('groups_title', str(b.groups_title, 200));
    setSetting('groups_text', str(b.groups_text, 3000));
    back(res, '/admin/portada', 'Portada guardada');
  } catch (err) { next(err); }
});

// ---- Cuenta y usuarios ------------------------------------------------------

router.get('/cuenta', (req, res) => {
  res.render('admin/account', { admins: db.prepare('SELECT id, email, name, created_at FROM admins ORDER BY id').all(), error: null });
});

router.post('/cuenta', (req, res) => {
  const b = req.body;
  const admins = () => db.prepare('SELECT id, email, name, created_at FROM admins ORDER BY id').all();
  if (b.action === 'password') {
    const me = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
    if (!require('bcryptjs').compareSync(String(b.current || ''), me.password_hash)) return res.status(422).render('admin/account', { admins: admins(), error: 'La contraseña actual no es correcta.' });
    if (String(b.password || '').length < 8) return res.status(422).render('admin/account', { admins: admins(), error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(auth.hashPassword(b.password), me.id);
    db.prepare('DELETE FROM sessions WHERE admin_id = ? AND token != ?').run(me.id, req.cookies.admin_session);
    return back(res, '/admin/cuenta', 'Contraseña cambiada');
  }
  if (b.action === 'add') {
    const email = str(b.email, 160).toLowerCase();
    if (!isEmail(email) || String(b.password || '').length < 8) return res.status(422).render('admin/account', { admins: admins(), error: 'Indica un email válido y una contraseña de al menos 8 caracteres.' });
    if (db.prepare('SELECT 1 FROM admins WHERE email = ?').get(email)) return res.status(422).render('admin/account', { admins: admins(), error: 'Ya existe un usuario con ese email.' });
    db.prepare('INSERT INTO admins (email, name, password_hash) VALUES (?, ?, ?)').run(email, str(b.name, 80), auth.hashPassword(b.password));
    return back(res, '/admin/cuenta', 'Usuario añadido');
  }
  if (b.action === 'remove' && parseInt(b.id, 10) !== req.admin.id) {
    db.prepare('DELETE FROM admins WHERE id = ?').run(b.id);
    return back(res, '/admin/cuenta', 'Usuario eliminado');
  }
  res.redirect('/admin/cuenta');
});

router.use((req, res) => res.status(404).render('admin/notfound'));

module.exports = router;

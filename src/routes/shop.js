const express = require('express');
const { db, getSettings } = require('../db');
const { rawCart, writeCart, loadCart, shippingFor, MAX_QTY } = require('../lib/cart');
const { isEmail, clampInt } = require('../lib/util');
const { createOrder, getOrder, setStatus, markPaid, notifyOrder } = require('../lib/orders');
const payments = require('../lib/payments');

const router = express.Router();

const SORTS = {
  destacados: 'p.featured DESC, p.sort, p.id DESC',
  'precio-asc': 'p.price_cents ASC',
  'precio-desc': 'p.price_cents DESC',
  nombre: 'p.name COLLATE NOCASE ASC',
  novedades: 'p.id DESC',
};

function shopGuard(req, res, next) {
  if (getSettings().shop_enabled || req.admin) return next();
  res.status(503).render('pages/shop-closed', { meta: { title: 'Tienda online' } });
}

function catalog(req, res, category) {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const sort = SORTS[req.query.orden] ? req.query.orden : 'destacados';
  const where = ['p.active = 1'];
  const params = [];
  if (category) { where.push('p.category_id = ?'); params.push(category.id); }
  if (q) {
    where.push('(p.name LIKE ? OR p.short_desc LIKE ? OR p.region LIKE ? OR p.grape LIKE ?)');
    params.push(...Array(4).fill(`%${q}%`));
  }
  if (req.query.vegano === '1') where.push('p.vegan = 1');
  if (req.query.stock === '1') where.push('p.stock > 0');
  const max = parseInt(req.query.max, 10);
  if (max > 0) { where.push('p.price_cents <= ?'); params.push(max * 100); }
  const products = db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p
    LEFT JOIN categories c ON c.id = p.category_id WHERE ${where.join(' AND ')} ORDER BY ${SORTS[sort]}`).all(...params);
  const categories = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS n
    FROM categories c ORDER BY c.sort, c.name`).all();
  res.render('pages/shop', {
    products, categories, category, q, sort, filters: req.query,
    meta: category
      ? { title: `${category.name} — Tienda online`, description: category.description || getSettings().shop_intro }
      : { title: 'Tienda online de vinos y productos gourmet', description: 'Compra online vinos españoles, vinos veganos, cavas, quesos, embutidos y lotes regalo. Recogida en tienda o envío en Madrid.' },
  });
}

router.get('/tienda', shopGuard, (req, res) => catalog(req, res, null));

router.get('/tienda/categoria/:slug', shopGuard, (req, res, next) => {
  const category = db.prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.slug);
  if (!category) return next();
  catalog(req, res, category);
});

router.get('/tienda/:slug', shopGuard, (req, res, next) => {
  const product = db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p
    LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ? AND (p.active = 1 OR ?)`).get(req.params.slug, req.admin ? 1 : 0);
  if (!product) return next();
  const related = db.prepare(`SELECT * FROM products WHERE active = 1 AND id != ? AND category_id IS ? ORDER BY featured DESC, RANDOM() LIMIT 4`)
    .all(product.id, product.category_id);
  res.render('pages/product', {
    product, related,
    meta: { title: product.name, description: product.short_desc || product.description.slice(0, 160), image: product.image, type: 'product' },
  });
});

// ---- Carrito -----------------------------------------------------------------

const wantsJson = (req) => req.xhr || (req.get('accept') || '').includes('application/json');

function cartJson(req, res, cartObj) {
  req.cookies.cart = JSON.stringify(cartObj);
  const cart = loadCart(req);
  return {
    count: cart.count,
    subtotal_cents: cart.subtotal_cents,
    items: cart.items.map((i) => ({
      id: i.product.id, name: i.product.name, slug: i.product.slug, image: i.product.image,
      qty: i.qty, price_cents: i.product.price_cents, line_cents: i.line_cents, stock: i.product.stock,
    })),
  };
}

router.get('/carrito', (req, res) => {
  const cart = loadCart(req);
  res.render('pages/cart', { cart, meta: { title: 'Tu carrito', noindex: true } });
});

router.get('/carrito.json', (req, res) => res.json(cartJson(req, res, rawCart(req))));

router.post('/carrito/agregar', (req, res) => {
  const id = parseInt(req.body.product_id, 10);
  const product = db.prepare('SELECT id, stock FROM products WHERE id = ? AND active = 1').get(id);
  const cart = rawCart(req);
  let error = null;
  if (!product) error = 'Producto no disponible';
  else {
    const want = (cart[id] || 0) + clampInt(req.body.qty, 1, MAX_QTY, 1);
    cart[id] = Math.min(want, product.stock, MAX_QTY);
    if (cart[id] <= 0) { delete cart[id]; error = 'Producto agotado'; } else if (cart[id] < want) error = `Solo quedan ${product.stock} unidades`;
  }
  writeCart(res, cart);
  if (wantsJson(req)) return res.status(error && !cart[id] ? 409 : 200).json({ ...cartJson(req, res, cart), error, added: id });
  res.redirect('/carrito');
});

router.post('/carrito/actualizar', (req, res) => {
  const cart = rawCart(req);
  const id = parseInt(req.body.product_id, 10);
  const qty = clampInt(req.body.qty, 0, MAX_QTY, 0);
  if (qty <= 0) delete cart[id]; else cart[id] = qty;
  writeCart(res, cart);
  if (wantsJson(req)) return res.json(cartJson(req, res, cart));
  res.redirect('/carrito');
});

// ---- Checkout ----------------------------------------------------------------

function paymentOptions(s) {
  const opts = [];
  if (s.payment_card_enabled && payments.cardEnabled()) opts.push('tarjeta');
  if (s.payment_store_enabled) opts.push('tienda');
  if (s.payment_transfer_enabled) opts.push('transferencia');
  return opts;
}

router.get('/checkout', shopGuard, (req, res) => {
  if (req.query.cancelado) {
    const o = getOrder(String(req.query.cancelado));
    if (o && o.status === 'pendiente_pago' && o.payment_method === 'tarjeta') setStatus(o, 'cancelado');
  }
  const cart = loadCart(req);
  if (!cart.count) return res.redirect('/carrito');
  const s = res.locals.s;
  res.render('pages/checkout', {
    cart, form: { delivery_method: cart.needsShipping ? 'recogida' : 'ninguna' }, errors: [],
    paymentOpts: paymentOptions(s), cancelled: !!req.query.cancelado,
    meta: { title: 'Finalizar compra', noindex: true },
  });
});

router.post('/checkout', shopGuard, async (req, res, next) => {
  try {
    const s = getSettings();
    const cart = loadCart(req);
    if (!cart.count) return res.redirect('/carrito');
    const b = req.body;
    const c = (v, n = 300) => String(v || '').trim().slice(0, n);
    const opts = paymentOptions(s);
    const form = {
      customer_name: c(b.customer_name, 120), email: c(b.email, 160), phone: c(b.phone, 40),
      delivery_method: cart.needsShipping ? (b.delivery_method === 'domicilio' ? 'domicilio' : 'recogida') : 'ninguna',
      address: c(b.address), city: c(b.city, 80) || 'Madrid', postal_code: c(b.postal_code, 10),
      notes: c(b.notes, 1000), is_gift: b.is_gift ? 1 : 0, gift_message: c(b.gift_message, 500),
      payment_method: opts.includes(b.payment_method) ? b.payment_method : opts[0],
    };
    const errors = [];
    if (!form.customer_name) errors.push('Indica tu nombre.');
    if (!isEmail(form.email)) errors.push('Indica un email válido.');
    if (!form.phone) errors.push('Indica un teléfono de contacto.');
    if (form.delivery_method === 'domicilio') {
      if (!form.address) errors.push('Indica la dirección de entrega.');
      const prefixes = String(s.delivery_postcode_prefixes || '').split(',').map((x) => x.trim()).filter(Boolean);
      if (!/^\d{5}$/.test(form.postal_code)) errors.push('Indica un código postal válido.');
      else if (prefixes.length && !prefixes.some((p) => form.postal_code.startsWith(p))) {
        errors.push('De momento solo enviamos a Madrid y área metropolitana. Puedes elegir recogida en tienda.');
      }
    }
    if (!form.payment_method) errors.push('No hay métodos de pago disponibles. Llámanos para hacer tu pedido.');
    if (!b.adult) errors.push('Debes confirmar que eres mayor de 18 años.');
    if (!b.terms) errors.push('Debes aceptar las condiciones de venta.');
    if (errors.length) {
      return res.status(422).render('pages/checkout', { cart, form, errors, paymentOpts: opts, cancelled: false, meta: { title: 'Finalizar compra', noindex: true } });
    }

    const shipping_cents = shippingFor(cart, form.delivery_method, s);
    let order;
    try {
      order = createOrder({
        ...form, status: 'pendiente_pago', subtotal_cents: cart.subtotal_cents,
        shipping_cents, total_cents: cart.subtotal_cents + shipping_cents,
      }, cart);
    } catch (err) {
      return res.status(409).render('pages/checkout', { cart: loadCart(req), form, errors: [err.message], paymentOpts: opts, cancelled: false, meta: { title: 'Finalizar compra', noindex: true } });
    }

    if (order.payment_method === 'tarjeta') {
      let session;
      try {
        session = await payments.createCheckoutSession({ order, items: order.items, baseUrl: res.locals.baseUrl });
      } catch (err) {
        console.error('Stripe:', err.message);
        setStatus(order, 'cancelado');
        return res.status(502).render('pages/checkout', {
          cart: loadCart(req), form, paymentOpts: opts, cancelled: false, meta: { title: 'Finalizar compra', noindex: true },
          errors: ['No hemos podido conectar con la pasarela de pago. Inténtalo de nuevo o elige otro método de pago.'],
        });
      }
      db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?').run(session.id, order.id);
      return res.redirect(303, session.url);
    }
    notifyOrder(order);
    writeCart(res, {});
    res.redirect(303, `/pedido/${order.number}?t=${order.access_token}`);
  } catch (err) { next(err); }
});

router.get('/pedido/:number', async (req, res, next) => {
  try {
    let order = getOrder(req.params.number);
    if (!order || (order.access_token !== req.query.t && !req.admin)) return next();
    // Confirmación inmediata al volver de Stripe (el webhook también lo marca como pagado).
    if (order.status === 'pendiente_pago' && order.payment_method === 'tarjeta' && payments.stripe && order.stripe_session_id) {
      const session = await payments.stripe.checkout.sessions.retrieve(order.stripe_session_id);
      if (session.payment_status === 'paid') order = markPaid(order.number);
    }
    if (order.status !== 'pendiente_pago' || order.payment_method !== 'tarjeta') writeCart(res, {});
    res.render('pages/order', { order, meta: { title: `Pedido ${order.number}`, noindex: true } });
  } catch (err) { next(err); }
});

module.exports = router;

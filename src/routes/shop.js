const express = require('express');
const { col, find, findOne, getSettings } = require('../db');
const { rawCart, writeCart, loadCart, shippingFor, MAX_QTY } = require('../lib/cart');
const { isEmail, clampInt, escapeRegex } = require('../lib/util');
const { createOrder, getOrder, setStatus, markPaid, notifyOrder } = require('../lib/orders');
const { withCategories } = require('../lib/catalog');
const payments = require('../lib/payments');

const router = express.Router();

const SORTS = {
  destacados: { featured: -1, sort: 1, id: -1 },
  'precio-asc': { price_cents: 1 },
  'precio-desc': { price_cents: -1 },
  nombre: { name: 1 },
  novedades: { id: -1 },
};

async function shopGuard(req, res, next) {
  if ((await getSettings()).shop_enabled || req.admin) return next();
  res.status(503).render('pages/shop-closed', { meta: { title: 'Tienda online' } });
}

async function catalog(req, res, category) {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const sort = SORTS[req.query.orden] ? req.query.orden : 'destacados';
  const where = { active: 1 };
  if (category) where.category_id = category.id;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    where.$or = [{ name: rx }, { short_desc: rx }, { region: rx }, { grape: rx }];
  }
  if (req.query.vegano === '1') where.vegan = 1;
  if (req.query.stock === '1') where.stock = { $gt: 0 };
  const max = parseInt(req.query.max, 10);
  if (max > 0) where.price_cents = { $lte: max * 100 };
  const [products, categories, counts] = await Promise.all([
    find('products', where, { sort: SORTS[sort], collation: { locale: 'es' } }).then(withCategories),
    find('categories', {}, { sort: { sort: 1, name: 1 } }),
    (await col('products')).aggregate([{ $match: { active: 1 } }, { $group: { _id: '$category_id', n: { $sum: 1 } } }]).toArray(),
  ]);
  const n = new Map(counts.map((c) => [c._id, c.n]));
  categories.forEach((c) => { c.n = n.get(c.id) || 0; });
  const s = await getSettings();
  res.render('pages/shop', {
    products, categories, category, q, sort, filters: req.query,
    meta: category
      ? { title: `${category.name} — Tienda online`, description: category.description || s.shop_intro }
      : { title: 'Tienda online de vinos y productos gourmet', description: 'Compra online vinos españoles, vinos veganos, cavas, quesos, embutidos y lotes regalo. Recogida en tienda o envío en Madrid.' },
  });
}

router.get('/tienda', shopGuard, (req, res) => catalog(req, res, null));

router.get('/tienda/categoria/:slug', shopGuard, async (req, res, next) => {
  const category = await findOne('categories', { slug: String(req.params.slug) });
  if (!category) return next();
  return catalog(req, res, category);
});

router.get('/tienda/:slug', shopGuard, async (req, res, next) => {
  const product = await findOne('products', { slug: String(req.params.slug), ...(req.admin ? {} : { active: 1 }) });
  if (!product) return next();
  await withCategories([product]);
  const related = (await find('products', { active: 1, id: { $ne: product.id }, category_id: product.category_id }))
    .sort((a, b) => (b.featured - a.featured) || (Math.random() - 0.5)).slice(0, 4);
  res.render('pages/product', {
    product, related,
    meta: { title: product.name, description: product.short_desc || product.description.slice(0, 160), image: product.image, type: 'product' },
  });
});

// ---- Carrito -----------------------------------------------------------------

const wantsJson = (req) => req.xhr || (req.get('accept') || '').includes('application/json');

async function cartJson(raw) {
  const cart = await loadCart(null, raw);
  return {
    count: cart.count,
    subtotal_cents: cart.subtotal_cents,
    items: cart.items.map((i) => ({
      id: i.product.id, name: i.product.name, slug: i.product.slug, image: i.product.image,
      qty: i.qty, price_cents: i.product.price_cents, line_cents: i.line_cents, stock: i.product.stock,
    })),
  };
}

router.get('/carrito', async (req, res) => {
  res.render('pages/cart', { cart: await loadCart(req), meta: { title: 'Tu carrito', noindex: true } });
});

router.get('/carrito.json', async (req, res) => res.json(await cartJson(rawCart(req))));

router.post('/carrito/agregar', async (req, res) => {
  const id = parseInt(req.body.product_id, 10) || 0;
  const product = await findOne('products', { id, active: 1 }, { projection: { id: 1, stock: 1 } });
  const cart = rawCart(req);
  let error = null;
  if (!product) error = 'Producto no disponible';
  else {
    const want = (cart[id] || 0) + clampInt(req.body.qty, 1, MAX_QTY, 1);
    cart[id] = Math.min(want, product.stock, MAX_QTY);
    if (cart[id] <= 0) { delete cart[id]; error = 'Producto agotado'; } else if (cart[id] < want) error = `Solo quedan ${product.stock} unidades`;
  }
  writeCart(res, cart);
  if (wantsJson(req)) return res.status(error && !cart[id] ? 409 : 200).json({ ...(await cartJson(cart)), error, added: id });
  res.redirect('/carrito');
});

router.post('/carrito/actualizar', async (req, res) => {
  const cart = rawCart(req);
  const id = parseInt(req.body.product_id, 10);
  const qty = clampInt(req.body.qty, 0, MAX_QTY, 0);
  if (qty <= 0) delete cart[id]; else cart[id] = qty;
  writeCart(res, cart);
  if (wantsJson(req)) return res.json(await cartJson(cart));
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

const CHECKOUT_META = { title: 'Finalizar compra', noindex: true };

router.get('/checkout', shopGuard, async (req, res) => {
  if (req.query.cancelado) {
    const o = await getOrder(String(req.query.cancelado));
    if (o && o.status === 'pendiente_pago' && o.payment_method === 'tarjeta') await setStatus(o, 'cancelado');
  }
  const cart = await loadCart(req);
  if (!cart.count) return res.redirect('/carrito');
  res.render('pages/checkout', {
    cart, form: { delivery_method: cart.needsShipping ? 'recogida' : 'ninguna' }, errors: [],
    paymentOpts: paymentOptions(res.locals.s), cancelled: !!req.query.cancelado, meta: CHECKOUT_META,
  });
});

router.post('/checkout', shopGuard, async (req, res) => {
  const s = await getSettings();
  const cart = await loadCart(req);
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
  if (errors.length) return res.status(422).render('pages/checkout', { cart, form, errors, paymentOpts: opts, cancelled: false, meta: CHECKOUT_META });

  const shipping_cents = shippingFor(cart, form.delivery_method, s);
  let order;
  try {
    order = await createOrder({
      ...form, status: 'pendiente_pago', subtotal_cents: cart.subtotal_cents,
      shipping_cents, total_cents: cart.subtotal_cents + shipping_cents,
    }, cart);
  } catch (err) {
    return res.status(409).render('pages/checkout', { cart: await loadCart(req), form, errors: [err.message], paymentOpts: opts, cancelled: false, meta: CHECKOUT_META });
  }

  if (order.payment_method === 'tarjeta') {
    let session;
    try {
      session = await payments.createCheckoutSession({ order, items: order.items, baseUrl: res.locals.baseUrl });
    } catch (err) {
      console.error('Stripe:', err.message);
      await setStatus(order, 'cancelado');
      return res.status(502).render('pages/checkout', {
        cart: await loadCart(req), form, paymentOpts: opts, cancelled: false, meta: CHECKOUT_META,
        errors: ['No hemos podido conectar con la pasarela de pago. Inténtalo de nuevo o elige otro método de pago.'],
      });
    }
    await (await col('orders')).updateOne({ id: order.id }, { $set: { stripe_session_id: session.id } });
    return res.redirect(303, session.url);
  }
  await notifyOrder(order);
  writeCart(res, {});
  res.redirect(303, `/pedido/${order.number}?t=${order.access_token}`);
});

router.get('/pedido/:number', async (req, res, next) => {
  let order = await getOrder(req.params.number);
  if (!order || (order.access_token !== req.query.t && !req.admin)) return next();
  // Confirmación inmediata al volver de Stripe (el webhook también lo marca como pagado).
  if (order.status === 'pendiente_pago' && order.payment_method === 'tarjeta' && payments.stripe && order.stripe_session_id) {
    const session = await payments.stripe.checkout.sessions.retrieve(order.stripe_session_id);
    if (session.payment_status === 'paid') order = await markPaid(order.number);
  }
  if (order.status !== 'pendiente_pago' || order.payment_method !== 'tarjeta') writeCart(res, {});
  res.render('pages/order', { order, meta: { title: `Pedido ${order.number}`, noindex: true } });
});

module.exports = router;

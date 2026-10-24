// Carrito guardado en una cookie: { "<productId>": cantidad }.
// Precios y stock siempre se recalculan desde la base de datos.
const { db } = require('../db');

const COOKIE = 'cart';
const MAX_QTY = 99;

function rawCart(req) {
  try {
    const obj = JSON.parse(req.cookies[COOKIE] || '{}');
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const id = parseInt(k, 10);
      const q = parseInt(v, 10);
      if (id > 0 && q > 0) out[id] = Math.min(q, MAX_QTY);
    }
    return out;
  } catch {
    return {};
  }
}

function writeCart(res, cart) {
  res.cookie(COOKIE, JSON.stringify(cart), { httpOnly: true, sameSite: 'lax', maxAge: 30 * 864e5, path: '/' });
}

function loadCart(req) {
  const raw = rawCart(req);
  const ids = Object.keys(raw).map(Number);
  const products = ids.length
    ? db.prepare(`SELECT * FROM products WHERE active = 1 AND id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : [];
  const items = [];
  for (const p of products) {
    const qty = Math.min(raw[p.id], Math.max(p.stock, 0));
    if (qty <= 0) continue;
    items.push({ product: p, qty, line_cents: qty * p.price_cents, limited: qty < raw[p.id] });
  }
  items.sort((a, b) => ids.indexOf(a.product.id) - ids.indexOf(b.product.id));
  const subtotal_cents = items.reduce((s, i) => s + i.line_cents, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const needsShipping = items.some((i) => i.product.shippable);
  return { items, subtotal_cents, count, needsShipping };
}

function shippingFor(cart, method, settings) {
  if (!cart.needsShipping || method !== 'domicilio') return 0;
  return cart.subtotal_cents >= settings.free_shipping_threshold_cents ? 0 : settings.shipping_fee_cents;
}

module.exports = { rawCart, writeCart, loadCart, shippingFor, MAX_QTY };

const { db, getSettings } = require('../db');
const { orderNumber, money, token } = require('./util');
const { sendMail } = require('./mail');

const STATUS_LABELS = {
  pendiente_pago: 'Pendiente de pago',
  pagado: 'Pagado',
  preparando: 'En preparación',
  enviado: 'Enviado',
  listo_recogida: 'Listo para recoger',
  completado: 'Completado',
  cancelado: 'Cancelado',
};
const PAYMENT_LABELS = { tarjeta: 'Tarjeta', tienda: 'Pago en tienda', transferencia: 'Transferencia / Bizum' };
const DELIVERY_LABELS = { recogida: 'Recogida en tienda', domicilio: 'Envío a domicilio', ninguna: 'Sin envío' };

// Crea el pedido y reserva el stock en una sola transacción.
const createOrder = db.transaction((data, cart) => {
  const number = orderNumber();
  const info = db.prepare(`INSERT INTO orders (number, access_token, status, customer_name, email, phone, delivery_method, address, city,
      postal_code, notes, is_gift, gift_message, payment_method, subtotal_cents, shipping_cents, total_cents)
    VALUES (@number, @access_token, @status, @customer_name, @email, @phone, @delivery_method, @address, @city, @postal_code, @notes,
      @is_gift, @gift_message, @payment_method, @subtotal_cents, @shipping_cents, @total_cents)`).run({ ...data, number, access_token: token(12) });
  const orderId = info.lastInsertRowid;
  const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, price_cents, qty) VALUES (?, ?, ?, ?, ?)');
  const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
  for (const it of cart.items) {
    const r = decStock.run(it.qty, it.product.id, it.qty);
    if (r.changes === 0) throw new Error(`Sin stock suficiente de "${it.product.name}"`);
    insItem.run(orderId, it.product.id, it.product.name, it.product.price_cents, it.qty);
  }
  return getOrder(number);
});

function getOrder(number) {
  const order = db.prepare('SELECT * FROM orders WHERE number = ?').get(number);
  if (order) order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  return order;
}

const restoreStock = db.transaction((order) => {
  if (order.stock_restored) return;
  const inc = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
  for (const it of db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id)) {
    if (it.product_id) inc.run(it.qty, it.product_id);
  }
  db.prepare('UPDATE orders SET stock_restored = 1 WHERE id = ?').run(order.id);
});

function setStatus(order, status) {
  if (!STATUS_LABELS[status]) return;
  if (status === 'cancelado') restoreStock(order);
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, order.id);
}

function markPaid(number) {
  const order = getOrder(number);
  if (!order || order.status !== 'pendiente_pago') return order;
  db.prepare("UPDATE orders SET status = 'pagado', paid_at = datetime('now') WHERE id = ?").run(order.id);
  const updated = getOrder(number);
  notifyOrder(updated);
  return updated;
}

// Libera el stock de pedidos con tarjeta que nunca se pagaron (más de 2 h).
function expireUnpaidCardOrders() {
  const stale = db.prepare(`SELECT * FROM orders WHERE status = 'pendiente_pago' AND payment_method = 'tarjeta'
                            AND created_at < datetime('now', '-2 hours')`).all();
  for (const o of stale) setStatus(o, 'cancelado');
}

function orderSummaryText(order) {
  const lines = order.items.map((i) => `  ${i.qty} × ${i.name} — ${money(i.price_cents * i.qty)}`).join('\n');
  return `${lines}
  Subtotal: ${money(order.subtotal_cents)}
  Envío: ${money(order.shipping_cents)}
  TOTAL: ${money(order.total_cents)}

Entrega: ${DELIVERY_LABELS[order.delivery_method]}${order.delivery_method === 'domicilio' ? `\n  ${order.address}, ${order.postal_code} ${order.city}` : ''}
Pago: ${PAYMENT_LABELS[order.payment_method]} (${STATUS_LABELS[order.status]})${order.notes ? `\nNotas: ${order.notes}` : ''}${order.is_gift ? `\nRegalo. Mensaje: ${order.gift_message}` : ''}`;
}

function notifyOrder(order) {
  const s = getSettings();
  sendMail({
    to: s.notify_email,
    replyTo: order.email,
    subject: `Nuevo pedido ${order.number} — ${money(order.total_cents)}`,
    text: `Nuevo pedido de ${order.customer_name} (${order.email}, ${order.phone}).\n\n${orderSummaryText(order)}`,
  });
  const extra = order.payment_method === 'transferencia' ? `\n\n${s.transfer_instructions}` : '';
  sendMail({
    to: order.email,
    replyTo: s.email,
    subject: `Tu pedido ${order.number} en ${s.business_name}`,
    text: `¡Hola ${order.customer_name}!\n\nGracias por tu compra. Hemos recibido tu pedido ${order.number}:\n\n${orderSummaryText(order)}${extra}\n\nCualquier duda, llámanos al ${s.phone} o responde a este email.\n\n${s.business_name}\n${s.address_line}, ${s.address_city}`,
  });
}

module.exports = {
  STATUS_LABELS, PAYMENT_LABELS, DELIVERY_LABELS,
  createOrder, getOrder, setStatus, markPaid, notifyOrder, expireUnpaidCardOrders,
};

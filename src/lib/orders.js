const { col, findOne, find, nextId, now, getSettings } = require('../db');
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

// Crea el pedido reservando stock. Si algún producto se queda sin stock a mitad,
// se devuelve lo ya reservado y se lanza un error.
async function createOrder(data, cart) {
  const products = await col('products');
  const reserved = [];
  for (const it of cart.items) {
    const r = await products.updateOne({ id: it.product.id, stock: { $gte: it.qty } }, { $inc: { stock: -it.qty } });
    if (r.modifiedCount === 0) {
      for (const x of reserved) await products.updateOne({ id: x.id }, { $inc: { stock: x.qty } });
      throw new Error(`Sin stock suficiente de "${it.product.name}"`);
    }
    reserved.push({ id: it.product.id, qty: it.qty });
  }
  const order = {
    ...data,
    id: await nextId('orders'),
    number: orderNumber(),
    access_token: token(12),
    items: cart.items.map((i) => ({ product_id: i.product.id, name: i.product.name, price_cents: i.product.price_cents, qty: i.qty })),
    stripe_session_id: null,
    stock_restored: 0,
    admin_notes: '',
    created_at: now(),
    paid_at: null,
  };
  await (await col('orders')).insertOne(order);
  delete order._id;
  return order;
}

const getOrder = (number) => findOne('orders', { number: String(number) });

async function restoreStock(order) {
  // Marca primero para que dos peticiones simultáneas no devuelvan el stock dos veces.
  const r = await (await col('orders')).updateOne({ id: order.id, stock_restored: 0 }, { $set: { stock_restored: 1 } });
  if (!r.modifiedCount) return;
  const products = await col('products');
  for (const it of order.items) if (it.product_id) await products.updateOne({ id: it.product_id }, { $inc: { stock: it.qty } });
}

async function setStatus(order, status) {
  if (!STATUS_LABELS[status]) return;
  if (status === 'cancelado') await restoreStock(order);
  await (await col('orders')).updateOne({ id: order.id }, { $set: { status } });
}

async function markPaid(number) {
  const r = await (await col('orders')).findOneAndUpdate(
    { number: String(number), status: 'pendiente_pago' },
    { $set: { status: 'pagado', paid_at: now() } },
    { returnDocument: 'after', projection: { _id: 0 } },
  );
  if (r) notifyOrder(r);
  return r || getOrder(number);
}

// Libera el stock de pedidos con tarjeta que nunca se pagaron (más de 2 h).
// En Vercel no hay tareas en segundo plano: se llama de vez en cuando desde las peticiones.
let lastExpire = 0;
async function expireUnpaidCardOrders() {
  if (Date.now() - lastExpire < 10 * 60e3) return;
  lastExpire = Date.now();
  const stale = await find('orders', { status: 'pendiente_pago', payment_method: 'tarjeta', created_at: { $lt: now(-2 * 3600e3) } });
  for (const o of stale) await setStatus(o, 'cancelado');
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

async function notifyOrder(order) {
  const s = await getSettings();
  const extra = order.payment_method === 'transferencia' ? `\n\n${s.transfer_instructions}` : '';
  await Promise.all([
    sendMail({
      to: s.notify_email,
      replyTo: order.email,
      subject: `Nuevo pedido ${order.number} — ${money(order.total_cents)}`,
      text: `Nuevo pedido de ${order.customer_name} (${order.email}, ${order.phone}).\n\n${orderSummaryText(order)}`,
    }),
    sendMail({
      to: order.email,
      replyTo: s.email,
      subject: `Tu pedido ${order.number} en ${s.business_name}`,
      text: `¡Hola ${order.customer_name}!\n\nGracias por tu compra. Hemos recibido tu pedido ${order.number}:\n\n${orderSummaryText(order)}${extra}\n\nCualquier duda, llámanos al ${s.phone} o responde a este email.\n\n${s.business_name}\n${s.address_line}, ${s.address_city}`,
    }),
  ]);
}

module.exports = {
  STATUS_LABELS, PAYMENT_LABELS, DELIVERY_LABELS,
  createOrder, getOrder, setStatus, markPaid, notifyOrder, expireUnpaidCardOrders,
};

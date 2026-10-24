// Pagos con tarjeta mediante Stripe Checkout (incluye Apple Pay / Google Pay).
// Se activa al definir STRIPE_SECRET_KEY; sin clave, la opción de tarjeta se oculta.
const Stripe = require('stripe');

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

async function createCheckoutSession({ order, items, baseUrl }) {
  const line_items = items.map((i) => ({
    quantity: i.qty,
    price_data: {
      currency: 'eur',
      unit_amount: i.price_cents,
      product_data: { name: i.name },
    },
  }));
  if (order.shipping_cents > 0) {
    line_items.push({
      quantity: 1,
      price_data: { currency: 'eur', unit_amount: order.shipping_cents, product_data: { name: 'Envío a domicilio' } },
    });
  }
  return stripe.checkout.sessions.create({
    mode: 'payment',
    line_items,
    customer_email: order.email,
    client_reference_id: order.number,
    metadata: { order_number: order.number },
    locale: 'es',
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    success_url: `${baseUrl}/pedido/${order.number}?t=${order.access_token}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/checkout?cancelado=${order.number}`,
  });
}

module.exports = { stripe, createCheckoutSession, cardEnabled: () => !!stripe };

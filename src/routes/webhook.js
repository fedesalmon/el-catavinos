// Stripe avisa aquí cuando un pago se completa (configurar en el panel de Stripe).
const express = require('express');
const { stripe } = require('../lib/payments');
const { markPaid, getOrder, setStatus } = require('../lib/orders');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).send('Webhook no configurado');
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).send(`Firma no válida: ${err.message}`);
    }
    const session = event.data.object;
    const number = session.metadata && session.metadata.order_number;
    if (number) {
      if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') await markPaid(number);
      if (event.type === 'checkout.session.expired') {
        const order = await getOrder(number);
        if (order && order.status === 'pendiente_pago') await setStatus(order, 'cancelado');
      }
    }
    res.json({ received: true });
  } catch (err) { next(err); }
});

module.exports = router;

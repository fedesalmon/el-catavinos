const express = require('express');
const { col, find, findOne, nextId, now, getSettings } = require('../db');
const { isEmail, clampInt } = require('../lib/util');
const { sendMail } = require('../lib/mail');
const { withCategories } = require('../lib/catalog');

const router = express.Router();

const isSpam = (body) => !!(body.website && String(body.website).trim());
const clean = (v, max = 2000) => String(v || '').trim().slice(0, max);
const activeTastings = () => find('tastings', { active: 1 }, { sort: { sort: 1, id: 1 } });

router.get('/', async (req, res) => {
  const [featured, tastings, posts] = await Promise.all([
    find('products', { active: 1, featured: 1 }, { sort: { sort: 1, id: -1 }, limit: 8 }).then(withCategories),
    activeTastings(),
    find('posts', { published: 1 }, { sort: { published_at: -1, id: -1 }, limit: 3 }),
  ]);
  res.render('pages/home', { featured, tastings, posts, meta: { home: true } });
});

async function eventProducts() {
  const cat = await findOne('categories', { slug: 'catas-y-experiencias' });
  return cat ? find('products', { category_id: cat.id, active: 1 }, { sort: { sort: 1, id: 1 } }) : [];
}

const CATAS_META = { title: 'Catas privadas con maridaje en Madrid', description: 'Catas de vino guiadas por enólogo con maridaje gourmet para grupos de 6 a 10 personas, junto a Las Ventas (Madrid). Reserva online.' };

router.get('/catas', async (req, res) => {
  const [tastings, events] = await Promise.all([activeTastings(), eventProducts()]);
  res.render('pages/catas', { tastings, events, form: {}, errors: [], sent: req.query.reservado === '1', meta: CATAS_META });
});

router.post('/catas/reservar', async (req, res) => {
  const b = req.body;
  if (isSpam(b)) return res.redirect('/catas?reservado=1#reservar');
  const tasting = await findOne('tastings', { id: parseInt(b.tasting_id, 10) || 0 });
  const form = {
    tasting_id: tasting ? tasting.id : null,
    tasting_name: tasting ? tasting.name : 'Sin especificar',
    name: clean(b.name, 120), email: clean(b.email, 160), phone: clean(b.phone, 40),
    date: clean(b.date, 10), time: clean(b.time, 20), people: clampInt(b.people, 1, 60, 6), notes: clean(b.notes),
  };
  const errors = [];
  if (!form.name) errors.push('Indica tu nombre.');
  if (!isEmail(form.email)) errors.push('Indica un email válido.');
  if (!form.phone) errors.push('Indica un teléfono de contacto.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || form.date < new Date().toISOString().slice(0, 10)) errors.push('Elige una fecha a partir de hoy.');
  if (errors.length) {
    const [tastings, events] = await Promise.all([activeTastings(), eventProducts()]);
    return res.status(422).render('pages/catas', { tastings, events, form, errors, sent: false, meta: CATAS_META });
  }
  await (await col('bookings')).insertOne({ ...form, id: await nextId('bookings'), status: 'pendiente', admin_notes: '', created_at: now() });
  const s = await getSettings();
  await Promise.all([
    sendMail({
      to: s.notify_email, replyTo: form.email,
      subject: `Nueva solicitud de cata: ${form.tasting_name} — ${form.date}`,
      text: `${form.name} (${form.email}, ${form.phone}) solicita:\n\nCata: ${form.tasting_name}\nFecha: ${form.date} ${form.time}\nPersonas: ${form.people}\nNotas: ${form.notes || '—'}\n\nGestiónala en el panel: /admin/reservas`,
    }),
    sendMail({
      to: form.email, replyTo: s.email,
      subject: `Hemos recibido tu solicitud de cata — ${s.business_name}`,
      text: `¡Hola ${form.name}!\n\nGracias por tu interés. Hemos recibido tu solicitud para "${form.tasting_name}" el ${form.date} (${form.people} personas). Te contactaremos en breve para confirmarla.\n\n${s.business_name} · ${s.phone}`,
    }),
  ]);
  res.redirect('/catas?reservado=1#reservar');
});

router.get('/sobre-nosotros', (req, res) => {
  res.render('pages/about', { meta: { title: 'Sobre nosotros — Vinoteca junto a Las Ventas', description: 'Conoce El Catavinos: vinoteca y tienda gourmet en Madrid junto a Las Ventas. Selección cuidada, cercanía y pasión por el vino.' } });
});

router.get('/blog', async (req, res) => {
  const posts = await find('posts', { published: 1 }, { sort: { published_at: -1, id: -1 } });
  res.render('pages/blog', { posts, meta: { title: 'Blog del vino', description: 'Artículos sobre cómo catar un vino, vinos veganos, denominaciones de origen y maridajes, por El Catavinos.' } });
});

router.get('/blog/:slug', async (req, res, next) => {
  const post = await findOne('posts', { slug: String(req.params.slug), ...(req.admin ? {} : { published: 1 }) });
  if (!post) return next();
  const more = await find('posts', { published: 1, id: { $ne: post.id } }, { sort: { published_at: -1 }, limit: 3 });
  res.render('pages/post', { post, more, meta: { title: post.title, description: post.excerpt, image: post.image, type: 'article' } });
});

const CONTACT_META = { title: 'Contacto', description: 'Contacta con El Catavinos: teléfono, email, horario y formulario. C. del Buen Gobernador 1, 28027 Madrid.' };

router.get('/contacto', (req, res) => {
  res.render('pages/contact', { form: {}, errors: [], sent: req.query.enviado === '1', meta: CONTACT_META });
});

router.post('/contacto', async (req, res) => {
  const b = req.body;
  if (isSpam(b)) return res.redirect('/contacto?enviado=1#form');
  const form = { name: clean(b.name, 120), email: clean(b.email, 160), phone: clean(b.phone, 40), subject: clean(b.subject, 160), body: clean(b.body, 5000) };
  const errors = [];
  if (!form.name) errors.push('Indica tu nombre.');
  if (!isEmail(form.email)) errors.push('Indica un email válido.');
  if (!form.body) errors.push('Escribe tu mensaje.');
  if (!b.privacy) errors.push('Debes aceptar la política de privacidad.');
  if (errors.length) return res.status(422).render('pages/contact', { form, errors, sent: false, meta: CONTACT_META });
  await (await col('messages')).insertOne({ ...form, id: await nextId('messages'), is_read: 0, created_at: now() });
  const s = await getSettings();
  await sendMail({ to: s.notify_email, replyTo: form.email, subject: `Mensaje web: ${form.subject || form.name}`, text: `${form.name} <${form.email}> ${form.phone}\n\n${form.body}` });
  res.redirect('/contacto?enviado=1#form');
});

router.get('/como-llegar', (req, res) => {
  res.render('pages/directions', { meta: { title: 'Cómo llegar', description: 'Cómo llegar a El Catavinos, junto a la plaza de toros de Las Ventas (Madrid). Metro, autobús y mapa.' } });
});

const LEGAL = {
  'aviso-legal': ['Aviso legal', 'legal_notice'],
  'politica-de-privacidad': ['Política de privacidad', 'privacy_policy'],
  'politica-de-cookies': ['Política de cookies', 'cookies_policy'],
  'condiciones-de-venta': ['Condiciones de venta', 'terms'],
};
router.get(Object.keys(LEGAL).map((k) => `/${k}`), (req, res) => {
  const [title, key] = LEGAL[req.path.slice(1)];
  res.render('pages/legal', { title, key, meta: { title } });
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /carrito\nDisallow: /checkout\nDisallow: /pedido\nSitemap: ${res.locals.baseUrl}/sitemap.xml\n`);
});

router.get('/sitemap.xml', async (req, res) => {
  const base = res.locals.baseUrl;
  const urls = ['/', '/catas', '/tienda', '/sobre-nosotros', '/blog', '/contacto', '/como-llegar', '/aviso-legal', '/politica-de-privacidad', '/condiciones-de-venta'];
  const [cats, prods, posts] = await Promise.all([
    find('categories', {}, { sort: { sort: 1 } }), find('products', { active: 1 }), find('posts', { published: 1 }),
  ]);
  cats.forEach((c) => urls.push(`/tienda/categoria/${c.slug}`));
  prods.forEach((p) => urls.push(`/tienda/${p.slug}`));
  posts.forEach((p) => urls.push(`/blog/${p.slug}`));
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join('\n')}\n</urlset>`);
});

module.exports = router;

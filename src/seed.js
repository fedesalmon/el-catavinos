// Datos iniciales: categorías, productos de ejemplo, catas y artículos del blog.
// Se ejecuta automáticamente la primera vez que arranca el servidor (base de datos vacía).
// Los precios son orientativos y las imágenes de vinos son ilustraciones provisionales:
// sustitúyelas desde el panel por las fotos reales de cada botella.
require('./load-env');
const { getDb, col, now } = require('./db');
const { createAdmin } = require('./lib/auth');
const { token, slugify } = require('./lib/util');

const IMG = (f) => `/img/products/${f}.webp`;

const categories = [
  ['tintos', 'Vinos tintos', 'Tintos de Ribera del Duero, Rioja, Madrid, Bierzo, Priorat y otras regiones de España, seleccionados por su carácter.'],
  ['blancos', 'Vinos blancos', 'Albariño, verdejo, godello, viura… blancos frescos y con personalidad.'],
  ['rosados', 'Rosados', 'Rosados para el aperitivo y la mesa de verano.'],
  ['espumosos', 'Cavas y espumosos', 'Cavas y espumosos de método tradicional para brindar.'],
  ['generosos', 'Vinos generosos', 'Finos, manzanillas, olorosos y Pedro Ximénez del Marco de Jerez.'],
  ['gourmet', 'Productos gourmet', 'Quesos, embutidos, aceites, conservas y delicatessen para acompañar cada vino.'],
  ['lotes', 'Lotes y regalos', 'Lotes de vino y productos gourmet con presentación cuidada. También los personalizamos a tu medida.'],
  ['catas-y-experiencias', 'Catas y experiencias', 'Entradas para catas abiertas y tarjetas regalo para vivir la experiencia El Catavinos.'],
];

// [slug categoría, nombre, precio €, stock, imagen, región, uva, formato, maridaje, descripción corta, destacado, enviable]
const products = [
  ['tintos', 'Protos Roble', 12.5, 24, 'tinto-ribera', 'D.O. Ribera del Duero', 'Tinto Fino (Tempranillo)', '75 cl', 'Carnes a la brasa, embutidos, quesos semicurados', 'Un Ribera fresco y frutal con un paso breve por barrica. Fruta roja madura, notas tostadas suaves y un final amable.', 1, 1],
  ['tintos', 'Viña Pomal Crianza', 11.9, 30, 'tinto-rioja', 'D.O.Ca. Rioja', 'Tempranillo', '75 cl', 'Cordero, guisos, setas', 'Rioja clásico de Bodegas Bilbaínas: fruta roja, especias y vainilla, con la elegancia del Haro tradicional.', 1, 1],
  ['tintos', 'Camino de Navaherreros', 13.5, 18, 'tinto-madrid', 'D.O. Vinos de Madrid', 'Garnacha', '75 cl', 'Cocido madrileño, aves, arroces', 'Garnacha de la Sierra de Gredos madrileña, de Bernabeleva. Fresco, floral y muy de aquí: un tinto de Madrid para descubrir.', 1, 1],
  ['tintos', 'Pétalos del Bierzo', 21.9, 12, 'tinto-mencia', 'D.O. Bierzo', 'Mencía', '75 cl', 'Pulpo, carnes blancas, quesos de oveja', 'Descendientes de J. Palacios. Mencía de viñas viejas en ladera: fruta negra, notas minerales y una frescura muy atlántica.', 0, 1],
  ['tintos', 'Mauro', 34.9, 8, 'tinto-rioja', 'V.T. Castilla y León', 'Tempranillo, Syrah', '75 cl', 'Lechazo asado, caza, quesos curados', 'Un clásico del Duero fuera de la D.O.: profundo, especiado y con gran estructura. Para una ocasión especial.', 1, 1],
  ['tintos', 'Les Terrasses', 44.5, 6, 'tinto-priorat', 'D.O.Q. Priorat', 'Garnacha, Cariñena', '75 cl', 'Carnes rojas, guisos de caza', 'Álvaro Palacios. La pizarra (llicorella) del Priorat en una copa: concentrado, mineral y muy largo.', 0, 1],
  ['tintos', 'Borsao Selección Tinto', 6.9, 40, 'tinto-garnacha', 'D.O. Campo de Borja', 'Garnacha', '75 cl', 'Tapas, pasta, pizza', 'Garnacha jugosa y golosa, perfecta para el día a día. Una de las mejores relaciones calidad-precio de España.', 0, 1],
  ['blancos', 'Pazo de Señorans', 18.9, 20, 'blanco-albarino', 'D.O. Rías Baixas', 'Albariño', '75 cl', 'Marisco, pescados, cocina asiática', 'Referencia del Albariño del Val do Salnés: fruta blanca, flores y una acidez vibrante que pide marisco.', 1, 1],
  ['blancos', 'José Pariente Verdejo', 11.5, 30, 'blanco-verdejo', 'D.O. Rueda', 'Verdejo', '75 cl', 'Aperitivo, ensaladas, pescado blanco', 'Verdejo fresco y aromático, con notas de hierba recién cortada, hinojo y fruta cítrica.', 1, 1],
  ['blancos', 'Gaba do Xil Godello', 10.9, 18, 'blanco-godello', 'D.O. Valdeorras', 'Godello', '75 cl', 'Pescados al horno, arroces, quesos frescos', 'Godello de Telmo Rodríguez: untuoso y fresco a la vez, con fruta de hueso y un fondo mineral.', 0, 1],
  ['blancos', 'Muga Blanco Fermentado en Barrica', 12.9, 14, 'blanco-viura', 'D.O.Ca. Rioja', 'Viura, Malvasía', '75 cl', 'Bacalao, aves, quesos cremosos', 'Blanco riojano fermentado en barrica: fruta madura, notas lácteas y tostadas finas, y buena frescura.', 0, 1],
  ['rosados', 'Chivite Las Fincas Rosado', 11.5, 16, 'rosado-navarra', 'Navarra', 'Garnacha, Tempranillo', '75 cl', 'Aperitivo, arroces, cocina mediterránea', 'Rosado pálido de estilo provenzal: delicado, floral y con un final fresco y largo.', 0, 1],
  ['espumosos', 'Gramona Imperial Brut Gran Reserva', 22.5, 12, 'cava-brut', 'Corpinnat (Penedès)', 'Xarel·lo, Macabeo, Chardonnay', '75 cl', 'Ibéricos, fritos, celebraciones', 'Espumoso de larga crianza: burbuja fina, notas de bollería y fruta blanca. Un imprescindible para brindar.', 1, 1],
  ['espumosos', 'Juvé & Camps Reserva de la Familia', 17.5, 15, 'cava-rose', 'D.O. Cava', 'Macabeo, Xarel·lo, Parellada', '75 cl', 'Aperitivo, mariscos, sushi', 'Brut Nature con crianza prolongada: seco, elegante y muy gastronómico.', 0, 1],
  ['generosos', 'Tío Pepe Fino', 10.5, 20, 'generoso-fino', 'D.O. Jerez-Xérès-Sherry', 'Palomino', '75 cl', 'Jamón, aceitunas, frutos secos, pescaíto', 'El fino por excelencia: seco, salino y punzante. Sírvelo bien frío con el aperitivo.', 0, 1],
  ['generosos', 'Lustau Pedro Ximénez San Emilio', 21.9, 10, 'generoso-px', 'D.O. Jerez-Xérès-Sherry', 'Pedro Ximénez', '75 cl', 'Postres de chocolate, quesos azules, helado de vainilla', 'Dulce natural intenso: pasas, higos, dátiles y café. Un postre en sí mismo.', 0, 1],
  ['gourmet', 'Queso manchego curado D.O.P. (cuña 400 g)', 12.9, 20, 'queso-manchego', 'Castilla-La Mancha', '', '400 g', 'Tintos con crianza, finos', 'Queso de oveja manchega curado, intenso y con notas de frutos secos. Perfecto para una tabla de cata.', 1, 1],
  ['gourmet', 'Lomo ibérico de bellota (loncheado 100 g)', 9.5, 25, 'lomo-iberico', 'Salamanca', '', '100 g', 'Tintos de Ribera, finos y manzanillas', 'Lomo de cerdo ibérico de bellota curado de forma tradicional, loncheado a cuchillo.', 0, 1],
  ['gourmet', 'Aceite de oliva virgen extra Picual (500 ml)', 11.9, 30, 'aceite-picual', 'Jaén', '', '500 ml', 'Pan, tomate, ensaladas', 'AOVE de primera cosecha, verde y frutado, con el amargor y el picor equilibrados de la Picual.', 0, 1],
  ['gourmet', 'Ventresca de bonito del Norte en aceite de oliva', 8.9, 22, 'conservas', 'Cantabria', '', '110 g', 'Albariño, godello, cava', 'La parte más jugosa del bonito, elaborada artesanalmente en la costa cantábrica.', 0, 1],
  ['gourmet', 'Picos camperos artesanos', 3.5, 40, 'picos', 'Andalucía', '', '200 g', 'Cualquier vino y tabla', 'Picos de pan crujientes, elaborados con aceite de oliva. El acompañamiento perfecto para quesos y embutidos.', 0, 1],
  ['lotes', 'Lote Iniciación: vino, queso y aceite', 45, 10, 'lote-iniciacion', '', '', 'Caja regalo', '', '1 tinto de Ribera, 1 blanco verdejo, queso manchego curado, AOVE Picual y picos artesanos en caja regalo.', 1, 1],
  ['lotes', 'Lote Gran Ocasión', 89, 6, 'lote-gran-reserva', '', '', 'Caja regalo', '', 'Mauro, Gramona Imperial, lomo ibérico de bellota y queso manchego curado, con una presentación especial.', 0, 1],
  ['catas-y-experiencias', 'Tarjeta regalo: cata con maridaje para 2', 44, 50, 'tarjeta-regalo', '', '', 'Tarjeta regalo', '', 'Regala una cata con maridaje para dos personas en El Catavinos. Válida durante 12 meses; se reserva la fecha por teléfono.', 1, 0],
  ['catas-y-experiencias', 'Cata abierta: vinos de Madrid (sábado)', 25, 10, 'cata-abierta', 'Madrid', '', 'Entrada individual', '', 'Plaza individual para nuestra cata abierta de vinos de Madrid con maridaje. Grupo máximo de 10 personas. Te confirmamos la fecha por email.', 0, 0],
];

const tastings = [
  ['cata-basica', 'Cata Garnacha', 'Nuestra cata básica',
    'Todas nuestras catas incluyen maridaje, combinando cada vino con el alimento que mejor resalta sus sabores. Se degustan 4 vinos seleccionados por nuestro enólogo: 1 blanco y 3 tintos, quien comentará sus características y ofrecerá explicaciones generales sobre el mundo del vino.\n\nFinalizamos con una cata especial acompañada de su maridaje según la temporada.',
    'Aprox. 2 h 30 min', 'Desde 22 € por persona (grupos cerrados de 6)', 6, 10, '/img/site/mesa-cata.webp'],
  ['cata-personalizada', 'Cata Viura', 'Nuestra cata personalizada',
    'Esta cata permite elegir los vinos a degustar, por lo que el precio varía según la selección. Todas nuestras catas incluyen maridaje, combinando los vinos con alimentos que potencian sus sabores.\n\nNuestro enólogo comentará las características principales de cada vino y ofrecerá información general sobre la cata y el mundo del vino.',
    'Aprox. 2 h 30 min', 'Variable según la selección de vinos', 6, 10, '/img/site/vino-blanco-quesos.webp'],
  ['cata-especializada', 'Cata Tempranillo', 'Nuestra cata especializada',
    'Pensada como un viaje sensorial, esta cata guía a los participantes por una selección de vinos relacionados entre sí, ya sea por tipo de uva, elaboración (vinos generosos, cavas) o indicación geográfica. Todas las catas incluyen maridaje, con productos que realzan la experiencia de cada vino.\n\nEl enólogo explicará las características principales de cada selección. Finalizamos con una cata especial con maridaje según la época del año.',
    'Aprox. 2 h 30 min', 'A consultar', 6, 10, '/img/site/copas-fila.webp'],
];

const posts = [
  ['el-vino-como-punto-de-encuentro', 'El vino como punto de encuentro', 'Para nosotros el vino es una forma de reunir a personas, compartir historias y crear momentos que se recuerdan.',
    'En El Catavinos creemos que el vino es mucho más que una bebida. Para nosotros es una forma de reunir a personas, compartir historias y crear momentos que se recuerdan.\n\nCada botella encierra un origen, una tradición y un trabajo que merece ser contado y disfrutado con calma. Por eso apostamos por un espacio donde el vino se descubre sin prisas, se comenta y se saborea en buena compañía.\n\nYa sea en una cata, en una compra para una ocasión especial o en una charla en tienda, el vino siempre es el punto de partida.',
    '/img/site/brindis-amigos.webp', '2026-01-10'],
  ['vinos-veganos', 'Vinos veganos: una forma diferente de disfrutar el vino', 'Qué son los vinos veganos, cómo se elaboran y por qué forman parte de nuestra selección.',
    'En El Catavinos apostamos por vinos que respetan tanto el sabor como los procesos de elaboración. Los vinos veganos forman parte de nuestra selección porque ofrecen una alternativa elaborada sin el uso de productos de origen animal durante la clarificación.\n\n## ¿Por qué un vino puede no ser vegano?\n\nTradicionalmente, para clarificar el vino se han usado productos como la clara de huevo, la caseína (proteína de la leche) o la gelatina. Los vinos veganos sustituyen estos clarificantes por alternativas minerales o vegetales, o simplemente no se clarifican.\n\nEsto permite disfrutar del vino tal y como se expresa, manteniendo sus aromas y carácter natural. Cada vez más personas se interesan por este tipo de vinos, no solo por su filosofía, sino también por su autenticidad.\n\nEn nuestra vinoteca puedes descubrir diferentes referencias veganas y aprender cómo se elaboran, siempre con el asesoramiento cercano que ofrecemos en tienda y en nuestras catas. [Ver vinos veganos en la tienda](/tienda?vegano=1).',
    '/img/site/copa-servir.webp', '2026-01-17'],
  ['como-elegimos-los-vinos', 'Cómo elegimos los vinos de nuestra vinoteca', 'Buscamos referencias con personalidad, que hablen de su tierra y aporten algo diferente.',
    'Seleccionar los vinos que forman parte de El Catavinos es un proceso que hacemos con criterio y mucha dedicación. Buscamos referencias que tengan personalidad, que hablen de su tierra y que aporten algo diferente a quien los prueba.\n\nTrabajamos con bodegas de distintas regiones de España, combinando clásicos con propuestas menos conocidas. Nuestro objetivo es ofrecer una selección variada, pensada para distintos gustos y momentos, que invite a descubrir y a repetir.\n\n## Lo que miramos en cada vino\n\n- **Origen:** que exprese su zona y su variedad.\n- **Elaboración:** bodegas que trabajan con respeto por la viña.\n- **Relación calidad-precio:** buenos vinos para todos los bolsillos.\n- **Sorpresa:** siempre hay hueco para algo que no esperas.',
    '/img/site/botellas.webp', '2026-01-24'],
  ['las-catas-aprender-disfrutando', 'Las catas: aprender disfrutando', 'Explicamos el vino de forma clara, cercana y participativa. Así son nuestras catas.',
    'Las catas en El Catavinos nacen con la idea de aprender sin complicaciones. Nos gusta explicar el vino de forma clara, cercana y participativa, para que cada persona se sienta cómoda y disfrute de la experiencia.\n\nAcompañamos cada vino con un maridaje pensado para resaltar sus sabores y hacer la degustación más completa.\n\n## Cómo catar un vino en tres pasos\n\n1. **Vista:** observa el color y la intensidad inclinando la copa sobre un fondo blanco.\n2. **Nariz:** huele primero sin mover la copa y después tras agitarla suavemente.\n3. **Boca:** toma un sorbo pequeño, déjalo recorrer la boca y fíjate en la acidez, el cuerpo y la persistencia.\n\nCompartir conocimientos, resolver dudas y ver cómo los participantes se sorprenden con cada copa es una de las partes que más disfrutamos de nuestro trabajo. [Reserva tu cata](/catas#reservar).',
    '/img/site/mesa-cata.webp', '2026-02-01'],
];

async function seedContent() {
  const db = await getDb();
  await db.collection('categories').insertMany(categories.map((c, i) => ({ id: i + 1, slug: c[0], name: c[1], description: c[2], image: '', sort: i })));
  const catId = Object.fromEntries(categories.map((c, i) => [c[0], i + 1]));
  const ts = now();
  await db.collection('products').insertMany(products.map((p, i) => ({
    id: i + 1, slug: slugify(p[1]), name: p[1], category_id: catId[p[0]], short_desc: p[9], description: '',
    price_cents: Math.round(p[2] * 100), compare_cents: null, stock: p[3], image: IMG(p[4]), region: p[5], grape: p[6], vintage: '',
    volume: p[7], pairing: p[8], vegan: 0, featured: p[10], shippable: p[11], active: 1, sort: i, created_at: ts, updated_at: ts,
  })));
  await db.collection('tastings').insertMany(tastings.map((t, i) => ({
    id: i + 1, slug: t[0], name: t[1], subtitle: t[2], description: t[3], duration: t[4], price_text: t[5],
    min_people: t[6], max_people: t[7], image: t[8], active: 1, sort: i,
  })));
  await db.collection('posts').insertMany(posts.map((p, i) => ({
    id: i + 1, slug: p[0], title: p[1], excerpt: p[2], body: p[3], image: p[4], published: 1, published_at: p[5], created_at: ts,
  })));
  const counters = db.collection('counters');
  for (const [name, n] of [['categories', categories.length], ['products', products.length], ['tastings', tastings.length], ['posts', posts.length]]) {
    await counters.updateOne({ _id: name }, { $max: { seq: n } }, { upsert: true });
  }
}

async function ensureAdmin() {
  const admins = await col('admins');
  if (await admins.countDocuments()) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@elcatavinos.net').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || token(6);
  try {
    await createAdmin(email, password, 'Administrador');
  } catch (err) {
    if (err.code === 11000) return; // otra instancia lo creó a la vez
    throw err;
  }
  console.log('\n================================================================');
  console.log(' Usuario administrador creado para el panel /admin');
  console.log(`   Email:      ${email}`);
  console.log(`   Contraseña: ${process.env.ADMIN_PASSWORD ? '(la definida en ADMIN_PASSWORD)' : password}`);
  console.log(' Cámbiala desde Admin › Mi cuenta.');
  console.log('================================================================\n');
}

// Carga el contenido inicial una sola vez (el "candado" evita que dos arranques
// simultáneos en Vercel lo carguen por duplicado).
async function seedIfEmpty() {
  const meta = await col('meta');
  try {
    await meta.insertOne({ _id: 'seed', at: now() });
  } catch (err) {
    if (err.code !== 11000) throw err;
    return ensureAdmin(); // ya estaba cargado
  }
  try {
    await seedContent();
  } catch (err) {
    await meta.deleteOne({ _id: 'seed' }); // permitir reintentar en el siguiente arranque
    throw err;
  }
  await ensureAdmin();
}

module.exports = { seedIfEmpty };

if (require.main === module) seedIfEmpty().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

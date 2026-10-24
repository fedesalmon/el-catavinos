// Valores por defecto de todo el contenido editable desde "Admin › Ajustes".
// Lo que se guarde en el panel sobrescribe estos valores.
module.exports = {
  // Datos del negocio
  business_name: 'El Catavinos',
  tagline: 'Vinoteca y tienda gourmet en Madrid, junto a Las Ventas',
  phone: '910 143 404',
  phone_intl: '+34910143404',
  whatsapp: '',
  email: 'elcatavinos2015@gmail.com',
  address_line: 'C. del Buen Gobernador, 1',
  address_city: 'Ciudad Lineal, 28027 Madrid',
  maps_url: 'https://maps.app.goo.gl/ydAPKYjHozUQM1pE9',
  maps_embed_query: 'El Catavinos, C. del Buen Gobernador 1, 28027 Madrid',
  instagram_url: 'https://www.instagram.com/catavinosel/',
  google_url: 'https://share.google/WHI5DGi2ye5j19RMC',
  hours: [
    { days: 'Lunes a viernes', time: '10:30–14:30 y 17:30–21:00' },
    { days: 'Sábados', time: '11:00–14:30' },
    { days: 'Domingos', time: 'Cerrado' },
  ],

  // Barra superior / aviso
  announcement: 'Envío gratis en Madrid en pedidos de más de 100 €',

  // Portada
  hero_slides: [
    {
      title: 'Catas de vino en Madrid con maridaje',
      subtitle: 'Vinoteca en Madrid junto a Las Ventas',
      text: 'Bienvenido a El Catavinos, tu vinoteca y tienda gourmet en Madrid, junto a la plaza de las Ventas. Una experiencia completa alrededor del vino y los productos delicatessen.',
      image: '/img/site/hero-rosado.webp',
      cta_label: 'Reserva tu cata',
      cta_url: '/catas#reservar',
    },
    {
      title: 'Tienda de vinos y delicatessen',
      subtitle: 'Ahora también online',
      text: 'Tintos, blancos, rosados, cavas, generosos, vinos veganos y productos gourmet seleccionados. Recoge en tienda o recíbelo en casa.',
      image: '/img/site/botellas.webp',
      cta_label: 'Ir a la tienda',
      cta_url: '/tienda',
    },
    {
      title: 'Catas privadas para grupos',
      subtitle: 'De 6 a 10 personas',
      text: 'Un plan original en Madrid para disfrutar con amigos, en pareja, en familia o en eventos de empresa, guiado por nuestro enólogo.',
      image: '/img/site/grupo-cata.webp',
      cta_label: 'Ver catas',
      cta_url: '/catas',
    },
  ],
  intro_title: 'Vinoteca gourmet cerca de Las Ventas',
  intro_text: 'En nuestra tienda encontrarás una selección de vinos de distintas regiones, desde conocidos hasta exclusivos, siempre buscando opciones que se adapten a todos los gustos. Además, ofrecemos productos gourmet que complementan cada vino, desde embutidos y quesos hasta aceites y delicatessen de temporada. Cada visita es una oportunidad para explorar y sorprender a tus sentidos.',
  groups_title: 'Catas de vino para grupos en Madrid',
  groups_text: 'Descubre cada vino con el maridaje ideal mientras aprendes sobre sus características y origen. Nuestras catas están diseñadas para grupos reducidos, creando un ambiente cercano y agradable, ideal para disfrutar con amigos, familia o pareja.',

  // Página de catas
  catas_intro_title: 'Degustaciones de vino en Madrid',
  catas_intro_text: 'Si buscas un plan original en Madrid que combine vino, gastronomía y buen ambiente, nuestras catas son una excelente forma de disfrutar y descubrir nuevos sabores. Reserva con El Catavinos y vive una experiencia que va más allá de la degustación.',
  catas_detail_title: 'Catas de vino privadas en Madrid',
  catas_detail_text: 'Nuestras catas son dirigidas por un enólogo con amplio conocimiento del vino, que te acompañará paso a paso en la degustación. Aprenderás a identificar aromas, sabores y matices, entendiendo cómo la variedad de uva, la elaboración y la región de origen influyen en cada copa.\n\nCada cata incluye maridajes seleccionados cuidadosamente con quesos, embutidos, aceites y otros productos gourmet. Las catas están diseñadas para grupos pequeños (6 a 10 personas), lo que garantiza una experiencia cercana, interactiva y participativa. Ideal para planes con amigos, en pareja, en familia o para eventos privados.',

  // Sobre nosotros
  about_title: 'Vinoteca en Madrid',
  about_text: 'El Catavinos es una vinoteca y tienda gourmet ubicada en Madrid, junto a la plaza de Las Ventas, creada para quienes disfrutan del vino y la gastronomía como parte de su día a día. Nuestro espacio nace con la idea de acercar el mundo del vino de una forma cercana, comprensible y accesible.',
  about_text_2: 'Trabajamos con bodegas reconocidas para ofrecer novedades y referencias exclusivas. Disponemos de opciones para distintos presupuestos, para que todos puedan disfrutar de un buen vino o un regalo especial. También ofrecemos vinos veganos elaborados con procesos respetuosos con los animales, ampliando la oferta para quienes buscan alternativas conscientes.\n\nA través de nuestras catas y experiencias gastronómicas, queremos transmitir la cultura del vino de una forma amena y participativa. Queremos que cada visita a El Catavinos sea un momento especial, ya sea para elegir una botella, participar en una cata o encontrar ese detalle perfecto para regalar o compartir.',
  values: [
    { title: 'Selección cuidada', text: 'Elegimos cada vino y producto gourmet valorando su origen, elaboración y personalidad.' },
    { title: 'Cercanía', text: 'Ofrecemos un trato directo y personalizado, adaptado a cada cliente.' },
    { title: 'Pasión por el vino', text: 'Compartimos el conocimiento y el disfrute del vino desde la experiencia y la divulgación.' },
    { title: 'Experiencia compartida', text: 'Creemos en el vino como una forma de conectar, aprender y disfrutar en compañía.' },
  ],

  // Tienda y envíos
  shop_intro: 'En nuestra vinoteca encontrarás una selección de vinos de distintas regiones de España, cuidadosamente elegidos por su sabor y carácter, y productos delicatessen que completan la experiencia: quesos, embutidos, aceites y conservas.',
  free_shipping_threshold_cents: 10000,
  shipping_fee_cents: 690,
  delivery_postcode_prefixes: '28',
  delivery_info: 'Reparto gratuito en el área metropolitana de Madrid para pedidos superiores a 100 €. Para pedidos menores aplicamos una tarifa fija. Organizamos la entrega en horarios flexibles: te llamaremos para acordarla.',
  pickup_info: 'Recoge tu pedido en tienda, normalmente listo en 24 h. Te avisamos por email cuando esté preparado.',
  payment_card_enabled: true,
  payment_store_enabled: true,
  payment_transfer_enabled: false,
  transfer_instructions: 'Realiza una transferencia o Bizum indicando tu número de pedido. Prepararemos el pedido al recibir el pago.',
  shop_enabled: true,

  // Avisos por email
  notify_email: 'elcatavinos2015@gmail.com',

  // SEO
  seo_title: 'Catas de Vino con Maridaje en Las Ventas Madrid | El Catavinos',
  seo_description: 'Vinoteca y tienda gourmet en Madrid junto a Las Ventas. Catas de vino guiadas con maridaje, vinos, delicatessen y lotes regalo con envío a domicilio. Compra online.',

  // Textos legales (Markdown sencillo). Completar los datos entre [corchetes].
  legal_notice: `## Datos identificativos

En cumplimiento de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa:

- **Titular:** [Nombre o razón social]
- **NIF/CIF:** [NIF/CIF]
- **Domicilio:** C. del Buen Gobernador, 1, 28027 Madrid
- **Email:** elcatavinos2015@gmail.com
- **Teléfono:** 910 143 404

## Objeto

Este sitio web tiene por objeto informar sobre los servicios de El Catavinos (vinoteca, tienda gourmet y catas de vino) y permitir la compra online de sus productos.

## Venta de alcohol

De acuerdo con la normativa vigente, no vendemos bebidas alcohólicas a menores de 18 años. Al realizar un pedido el cliente declara ser mayor de edad, y podremos solicitar un documento identificativo en la entrega o recogida.

## Propiedad intelectual

Los contenidos de este sitio (textos, imágenes, logotipos) son propiedad de su titular o se usan con licencia, y no pueden reproducirse sin autorización.

## Responsabilidad

El titular no se hace responsable del mal uso que se realice de los contenidos del sitio web.`,
  privacy_policy: `## Responsable del tratamiento

[Nombre o razón social] — NIF [NIF/CIF] — C. del Buen Gobernador, 1, 28027 Madrid — elcatavinos2015@gmail.com

## Qué datos tratamos y para qué

- **Pedidos:** nombre, email, teléfono y dirección para gestionar y entregar tu compra.
- **Reservas de catas:** datos de contacto para confirmar y organizar la cata.
- **Formulario de contacto:** para responder a tu consulta.

## Base legal

La ejecución del contrato (pedidos y reservas) y tu consentimiento (formulario de contacto).

## Conservación

Conservamos los datos el tiempo necesario para cumplir con la finalidad y las obligaciones legales (fiscales y contables).

## Destinatarios

No cedemos datos a terceros salvo obligación legal. Los pagos con tarjeta se procesan a través de Stripe, que actúa como encargado del tratamiento.

## Tus derechos

Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a elcatavinos2015@gmail.com. También puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).`,
  terms: `## Condiciones generales de venta

Estas condiciones regulan las compras realizadas en la tienda online de El Catavinos.

## Mayoría de edad

Solo vendemos bebidas alcohólicas a mayores de 18 años.

## Precios y pago

Los precios incluyen IVA. Puedes pagar con tarjeta de forma segura, en tienda al recoger o mediante transferencia/Bizum cuando esté disponible.

## Envíos

Realizamos entregas en Madrid y área metropolitana. Envío gratuito a partir de 100 €; por debajo se aplica la tarifa indicada en el carrito. También puedes recoger tu pedido en tienda.

## Desistimiento y devoluciones

Dispones de 14 días naturales desde la recepción para desistir de la compra, salvo en productos perecederos o precintados que hayan sido abiertos. Escríbenos a elcatavinos2015@gmail.com. Si un producto llega dañado, contacta con nosotros en 48 h y lo sustituiremos.

## Catas y experiencias

Las entradas para catas pueden cambiarse de fecha avisando con al menos 48 h de antelación.`,
  cookies_policy: `## Cookies que usamos

Este sitio solo utiliza cookies técnicas necesarias para su funcionamiento:

- **cart:** guarda el contenido de tu carrito.
- **admin_session:** mantiene la sesión del panel de administración (solo personal).

No utilizamos cookies de analítica ni de publicidad. El mapa de Google solo se carga si pulsas en él; a partir de ese momento Google puede instalar sus propias cookies.`,
};

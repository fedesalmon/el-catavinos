# El Catavinos — Guía para el equipo

Web nueva de El Catavinos con **tienda online** y **panel de gestión**. Todo se gestiona desde el navegador, también desde el móvil, sin tocar código.

## Entrar al panel

1. Ve a **`/admin`**, por ejemplo `https://elcatavinos.net/admin`.
2. Entra con tu email y contraseña. Cámbiala la primera vez en **Mi cuenta**.
3. Desde **Mi cuenta** también puedes dar acceso a otras personas del equipo.

> ¿Has olvidado la contraseña? Quien gestione la web puede restablecerla en local, con el `MONGODB_URI` de producción en `.env`:
> `npm run create-admin -- tu@email.com NuevaContraseña`

## Qué se puede hacer en el panel

| Sección | Para qué sirve |
|---|---|
| **Inicio** | Resumen: ventas del mes, pedidos por preparar, reservas por confirmar, stock bajo y mensajes nuevos. |
| **Pedidos** | Ver cada pedido, imprimirlo y cambiar su estado (pagado → en preparación → enviado o listo para recoger → completado). Si se cancela un pedido, el stock vuelve solo. |
| **Reservas** | Solicitudes de catas hechas desde la web. Llama o escribe al cliente con un toque y márcalas como confirmadas. |
| **Mensajes** | Lo que llega desde el formulario de contacto. |
| **Productos** | Crear, editar, duplicar u ocultar productos. **En la lista puedes cambiar el precio, el stock y la visibilidad directamente**, y se guarda solo. Puedes hacer la foto con el móvil y subirla al momento. |
| **Importar CSV** | Cargar o actualizar muchos productos a la vez desde Excel o Google Sheets (descarga la plantilla). Si el producto ya existe con el mismo nombre, se actualizan su precio y su stock. |
| **Categorías** | Tintos, blancos, gourmet, lotes… nombre, orden y descripción. |
| **Catas** | Los tipos de cata (Garnacha, Viura, Tempranillo…) con su descripción, duración y precio. |
| **Blog** | Escribir artículos. Una línea en blanco empieza un nuevo párrafo, `## Título` crea un subtítulo y `**texto**` pone el texto en negrita. |
| **Portada** | Las fotos y textos del carrusel principal y los textos de bienvenida. |
| **Textos de la web** | Los textos de las páginas Catas, Sobre nosotros y Tienda, y los valores. |
| **Ajustes y tienda** | Teléfono, email, dirección, horario, redes sociales, coste y zona de envío, formas de pago, aviso de la barra superior y textos para Google. También puedes **pausar la tienda** (por ejemplo, en vacaciones). |
| **Textos legales** | Aviso legal, privacidad, condiciones de venta y cookies. **Completa los datos entre [corchetes] (razón social, NIF) antes de vender.** |

### Consejos

- **Productos destacados:** marca «Destacado en portada» y el producto aparecerá en «Selección de la casa».
- **Ofertas:** pon el precio anterior en «Precio anterior» y la web mostrará el descuento.
- **Entradas para catas abiertas y tarjetas regalo:** créalas como productos en la categoría «Catas y experiencias» y desmarca «Requiere envío». La «cantidad en stock» equivale a las plazas disponibles.
- **Ocultar en vez de borrar:** si un vino se agota durante una temporada, pon el stock a 0 (aparecerá como «Agotado») o desactiva «Visible».

## Importante: productos de ejemplo

La tienda viene cargada con **vinos reales de bodegas conocidas** (Protos, Pazo de Señorans, Gramona, Tío Pepe…) para que la web se vea completa desde el primer día. Antes de abrir:

1. **Revisad precios y stock**, que son orientativos.
2. **Sustituid las imágenes:** los vinos llevan una ilustración provisional de botella. Las bodegas y distribuidores suelen facilitar fotos oficiales de sus botellas a las tiendas. También podéis hacerlas vosotros.
3. Borrad u ocultad lo que no tengáis en tienda y añadid vuestras referencias. La forma más rápida es con **Importar CSV**.
4. Marcad como **vegano** los vinos que lo sean.

Usad solo fotos y textos que tengáis derecho a usar. No se pueden copiar las fichas ni las fotos de otras tiendas online sin su permiso.

## Cómo compra un cliente

1. Añade productos al carrito desde la tienda o la ficha del producto.
2. Elige **recogida en tienda** (gratis) o **envío a domicilio** en Madrid (gratis desde 100 €, configurable).
3. Paga con **tarjeta / Apple Pay / Google Pay** (Stripe), **en tienda**, o por **transferencia / Bizum** si lo activáis.
4. Confirma que es **mayor de 18 años**, como exige la ley para vender alcohol.
5. Recibe un email de confirmación y vosotros recibís el aviso del pedido.

## Puesta en marcha (para quien instale la web)

La web está preparada para **Vercel + MongoDB Atlas + Vercel Blob**, igual que el resto de webs.

### Publicar en Vercel

1. En Vercel: **Add New… › Project**, importa el repositorio de GitHub y pulsa **Deploy**. No hace falta tocar ninguna opción, porque todo está en `vercel.json`.
2. En **Settings › Environment Variables** añade:
   - `MONGODB_URI`: la cadena de conexión de MongoDB Atlas. Puede ser el mismo cluster de otras webs: los datos van en una base de datos aparte llamada `elcatavinos`.
   - `ADMIN_EMAIL` y `ADMIN_PASSWORD`: el primer usuario del panel.
3. En **Storage › Create › Blob**, crea un almacén y conéctalo al proyecto. Así se guardan las fotos que subáis desde el panel; Vercel añade `BLOB_READ_WRITE_TOKEN` automáticamente.
4. **Deployments › Redeploy** para aplicar las variables.

La primera visita crea automáticamente el contenido inicial (productos, catas, blog) y el usuario del panel.

> En MongoDB Atlas, *Network Access* debe permitir conexiones desde Vercel (`0.0.0.0/0`), como en las demás webs.

### Desarrollo en local

Necesita **Node.js 22**.

```bash
npm install
cp .env.example .env   # opcional: MONGODB_URI, etc.
npm start              # http://localhost:3000  ·  panel en /admin
```

Sin `MONGODB_URI`, en local se arranca una base de datos de prueba que se guarda en `data/`.

### Activar los pagos con tarjeta (Stripe)

1. Crea una cuenta en <https://stripe.com> y copia la **clave secreta** en `STRIPE_SECRET_KEY`.
2. En Stripe › Developers › Webhooks, añade el endpoint `https://TU-DOMINIO/stripe/webhook` con los eventos `checkout.session.completed` y `checkout.session.expired`. Copia el secreto de firma en `STRIPE_WEBHOOK_SECRET`.
3. Vuelve a desplegar. La opción de tarjeta aparecerá en el checkout.

### Activar los avisos por email

Rellena `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM`. Con Gmail: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465` y una [contraseña de aplicación](https://myaccount.google.com/apppasswords). Sin SMTP la web funciona igual: todo queda en el panel.

### Dominio

En Vercel › Settings › Domains añade `elcatavinos.net` cuando queráis sustituir la web antigua. Las direcciones antiguas (`/maridaje-en-madrid/`, `/vinoteca-en-madrid/`…) redirigen solas a las nuevas para no perder posicionamiento en Google.

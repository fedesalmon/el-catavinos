# El Catavinos — website, online shop & admin panel

Rebuild of [elcatavinos.net](https://elcatavinos.net) (a wine shop and tasting venue in Madrid). It keeps all of the original site's content, functions, palette (wine red `#8e4041`, near-black, warm greys) and fonts (Playfair Display + Open Sans), and adds:

- **Online shop**: catalog with categories, search and filters (price, vegan, in stock); product pages with structured data; a cart drawer; checkout with store pickup or Madrid delivery (free-shipping threshold, postcode check); Stripe Checkout (card, Apple Pay, Google Pay), pay in store, or transfer/Bizum; an 18+ confirmation; and stock reserved per order and restored when the order is cancelled or its payment expires.
- **Tasting bookings**: a request form that is stored and emailed, plus open-tasting tickets and gift cards sold as regular products.
- **Mobile-first UI**: off-canvas menu, sticky bottom action bar (call / directions / book / shop), sticky add-to-cart bar, swipeable hero, and a click-to-load Google Map so no Google cookies are set until the visitor opts in.
- **Admin panel** (`/admin`, in Spanish, works on phones). It covers orders, bookings, messages, products (inline price/stock edits, photo upload with automatic WebP optimisation, CSV import/export), categories, tasting types, blog, homepage slider, all page texts, store settings, legal texts and admin users.
- **SEO**: per-page meta and Open Graph tags, LocalBusiness and Product JSON-LD, `sitemap.xml`, `robots.txt`, and 301 redirects from the old WordPress URLs.

**Stack:** Node 22, Express 5, EJS (server-rendered), MongoDB, Vercel Blob (uploads), sharp, Stripe, Nodemailer. Deployed on Vercel as a single serverless function (`api/index.js`) with `public/` served from the CDN; see `vercel.json`. No build step.

```bash
npm install
cp .env.example .env
npm start            # http://localhost:3000, admin at /admin
                     # without MONGODB_URI a local dev MongoDB is started (data/)
```

The owner-facing guide, with setup for Stripe, SMTP and hosting, is in Spanish in [LEEME.md](LEEME.md).

## Layout

```
server.js               app setup, legacy redirects, locals
api/index.js            Vercel entry point
src/db.js               MongoDB connection, ids, settings store
src/default-settings.js all editable site content (defaults)
src/seed.js             initial catalog, tastings, blog posts, first admin
src/routes/             public.js · shop.js · admin.js · webhook.js
src/lib/                cart, orders, payments, auth, images, mail, csv, util
views/pages|partials    public templates
views/admin             admin templates
public/                 css, js, icons, images
data/                   local dev DB + uploads (gitignored)
```

The sample wines are real, widely distributed Spanish references. Their descriptions are original, and their prices are indicative. Bottle images are generated placeholders that the owners should replace with licensed photos.

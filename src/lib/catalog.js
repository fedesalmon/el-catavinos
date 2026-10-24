const { find } = require('../db');

// Añade category_name / category_slug a cada producto (equivalente a un JOIN).
async function withCategories(products) {
  if (!products.length) return products;
  const cats = await find('categories');
  const byId = new Map(cats.map((c) => [c.id, c]));
  for (const p of products) {
    const c = byId.get(p.category_id);
    p.category_name = c ? c.name : null;
    p.category_slug = c ? c.slug : null;
  }
  return products;
}

module.exports = { withCategories };

const crypto = require('crypto');

const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const money = (cents) => eurFmt.format((cents || 0) / 100);

// "12,50" | "12.50" | "12" -> 1250
function parseEuros(input) {
  if (input === undefined || input === null || String(input).trim() === '') return null;
  const n = Number(String(input).replace(/\s|€/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
const centsToInput = (c) => (c === null || c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','));

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

// Genera un slug único dentro de una colección de MongoDB.
async function uniqueSlug(col, base, excludeId) {
  const root = slugify(base);
  let slug = root;
  let i = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await col.findOne({ slug, id: { $ne: excludeId || 0 } }, { projection: { _id: 1 } })) slug = `${root}-${i++}`;
  return slug;
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Markdown mínimo y seguro: ## títulos, **negrita**, *cursiva*, [enlaces](url), listas "- ", párrafos.
function markdown(src) {
  const inline = (t) => escapeHtml(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|mailto:|tel:)[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const blocks = String(src || '').replace(/\r/g, '').split(/\n{2,}/);
  return blocks.map((b) => {
    b = b.trim();
    if (!b) return '';
    const h = b.match(/^(#{2,4})\s+(.+)$/);
    if (h && !b.includes('\n')) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('') + '</ul>';
    }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      return '<ol>' + lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('') + '</ol>';
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('\n');
}

const paragraphs = (t) => String(t || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

const token = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

function orderNumber() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `CV-${ymd}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());

function formatDate(iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', opts);
}
function formatDateTime(iso) {
  return formatDate(iso, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
}

const clampInt = (v, min, max, dflt) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
};

module.exports = {
  money, parseEuros, centsToInput, slugify, uniqueSlug, escapeRegex, escapeHtml, markdown, paragraphs,
  token, orderNumber, isEmail, formatDate, formatDateTime, clampInt,
};

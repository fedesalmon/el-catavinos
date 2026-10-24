/* Panel: menú móvil, confirmaciones, guardado rápido y vista previa de fotos. */
(() => {
  const btn = document.getElementById('amenu');
  const aside = document.getElementById('aside');
  btn?.addEventListener('click', () => {
    const open = aside.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  });

  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-confirm]');
    if (c && !confirm(c.dataset.confirm)) { e.preventDefault(); e.stopPropagation(); }
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a, button, input, select, label')) location.href = row.dataset.href;
  }, true);
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.matches('[data-confirm]') && !confirm(f.dataset.confirm)) e.preventDefault();
    if (f.matches('[data-busy]')) { const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Importando…'; }
  });

  // Guardado rápido (stock, precio, visible) en el listado de productos.
  document.querySelectorAll('[data-quick]').forEach((el) => {
    const save = async () => {
      const value = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
      const res = await fetch(el.dataset.quick, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ [el.name]: value }),
      });
      if (res.ok) {
        el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 1200);
        if (el.name === 'active') el.closest('tr').classList.toggle('is-off', !el.checked);
        if (el.name === 'stock') { el.classList.toggle('is-zero', +el.value <= 0); el.classList.toggle('is-low', +el.value > 0 && +el.value <= 3); }
      } else alert('No se pudo guardar. Recarga la página.');
    };
    el.addEventListener('change', save);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  });

  // Reduce las fotos en el navegador antes de subirlas (las fotos del móvil pueden
  // superar el límite de 4,5 MB por envío de Vercel). Si no se puede, se sube tal cual.
  async function shrink(file, max = 2200) {
    if (!/^image\//.test(file.type) || file.size < 1.2e6) return file;
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
      return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
    } catch { return file; }
  }

  // Vista previa de la foto elegida.
  document.querySelectorAll('input[type=file][accept^="image"]').forEach((input) => input.addEventListener('change', async () => {
    const f = input.files[0];
    if (!f) return;
    const label = input.closest('.afile');
    const span = label.querySelector('span');
    span.textContent = 'Preparando foto…';
    const small = await shrink(f);
    if (small !== f && window.DataTransfer) {
      const dt = new DataTransfer(); dt.items.add(small); input.files = dt.files;
    }
    span.textContent = '✓ ' + f.name;
    if (!input.matches('[data-preview]')) return;
    let img = label.parentElement.querySelector('img');
    if (!img) { img = document.createElement('img'); img.className = 'aimg-prev'; label.before(img); }
    img.src = URL.createObjectURL(small);
  }));
})();

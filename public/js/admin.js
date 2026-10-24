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

  // Vista previa de la foto elegida.
  document.querySelectorAll('input[type=file][data-preview]').forEach((input) => input.addEventListener('change', () => {
    const f = input.files[0];
    if (!f) return;
    const label = input.closest('.afile');
    label.querySelector('span').textContent = '✓ ' + f.name;
    let img = label.parentElement.querySelector('img');
    if (!img) { img = document.createElement('img'); img.className = 'aimg-prev'; label.before(img); }
    img.src = URL.createObjectURL(f);
  }));
})();

/* El Catavinos — interacciones de la web pública. Todo funciona también sin JS. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const eur = (c) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(c / 100);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id) => `<svg class="i"><use href="/img/icons.svg#${id}"/></svg>`;

  /* ---- Menú móvil ---- */
  const burger = $('#burger');
  const nav = $('#nav');
  const scrim = $('#navScrim');
  const setMenu = (open) => {
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    nav.classList.toggle('is-open', open);
    scrim.hidden = !open;
    document.body.classList.toggle('menu-open', open);
  };
  if (burger) {
    burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
    scrim.addEventListener('click', () => setMenu(false));
    $$('a', nav).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (burger && nav.classList.contains('is-open')) setMenu(false);
    closeDrawer();
  });

  /* ---- Carrusel de portada ---- */
  const slider = $('[data-slider]');
  if (slider) {
    const slides = $$('.hero__slide', slider);
    const dots = $$('[data-dot]', slider);
    let i = 0;
    let timer;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const go = (n) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => { s.classList.toggle('is-active', k === i); s.setAttribute('aria-hidden', k !== i); });
      dots.forEach((d, k) => d.setAttribute('aria-current', k === i));
    };
    const play = () => { if (!reduce && slides.length > 1) { clearInterval(timer); timer = setInterval(() => go(i + 1), 6500); } };
    const stop = () => clearInterval(timer);
    $('[data-prev]', slider)?.addEventListener('click', () => { go(i - 1); play(); });
    $('[data-next]', slider)?.addEventListener('click', () => { go(i + 1); play(); });
    dots.forEach((d) => d.addEventListener('click', () => { go(+d.dataset.dot); play(); }));
    slider.addEventListener('mouseenter', stop);
    slider.addEventListener('mouseleave', play);
    slider.addEventListener('focusin', stop);
    let x0 = null;
    slider.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; stop(); }, { passive: true });
    slider.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
      x0 = null; play();
    });
    play();
  }

  /* ---- Carrito (drawer) ---- */
  const drawer = $('#cartDrawer');
  const toast = $('#toast');
  let toastTimer;
  const showToast = (msg) => {
    toast.textContent = msg; toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
  };
  const updateCount = (n) => {
    $$('[data-cart-count]').forEach((el) => { el.textContent = n; el.hidden = !n; });
    $$('.cartbtn').forEach((b) => { b.setAttribute('aria-label', `Carrito (${n} productos)`); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); });
  };
  const renderCart = (cart) => {
    const body = $('[data-cart-body]', drawer);
    const foot = $('[data-cart-foot]', drawer);
    if (!cart.items.length) {
      body.innerHTML = `<div class="empty">${icon('bag')}<p>Tu carrito está vacío.</p><a href="/tienda" class="btn btn--wine">Ir a la tienda</a></div>`;
      foot.hidden = true;
      return;
    }
    body.innerHTML = cart.items.map((it) => `
      <div class="ditem">
        ${it.image ? `<img src="${esc(it.image.replace(/\.webp$/, '-sm.webp'))}" alt="">` : '<span class="ditem__ph"></span>'}
        <div>
          <a href="/tienda/${esc(it.slug)}">${esc(it.name)}</a>
          <div class="qty" aria-label="Cantidad">
            <button type="button" data-set="${it.id}" data-q="${it.qty - 1}" aria-label="Quitar una">${icon('minus')}</button>
            <span>${it.qty}</span>
            <button type="button" data-set="${it.id}" data-q="${it.qty + 1}" aria-label="Añadir una" ${it.qty >= it.stock ? 'disabled' : ''}>${icon('plus')}</button>
          </div>
        </div>
        <div style="text-align:right"><strong>${eur(it.line_cents)}</strong><br>
          <button class="ditem__rm" data-set="${it.id}" data-q="0" aria-label="Eliminar ${esc(it.name)}">${icon('trash')}</button></div>
      </div>`).join('');
    foot.hidden = false;
    $('[data-cart-subtotal]', drawer).textContent = eur(cart.subtotal_cents);
    const left = (window.CV?.freeShip || 0) - cart.subtotal_cents;
    $('[data-cart-shipnote]', drawer).textContent = left > 0
      ? `Añade ${eur(left)} más para envío gratis en Madrid.`
      : '¡Tienes envío gratis en Madrid!';
  };
  const api = async (url, data) => {
    const res = await fetch(url, {
      method: data ? 'POST' : 'GET',
      headers: { Accept: 'application/json', ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: data ? new URLSearchParams(data) : undefined,
      credentials: 'same-origin',
    });
    return res.json();
  };
  let lastFocus = null;
  const openDrawer = async () => {
    lastFocus = document.activeElement;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('[data-cart-close]', drawer).focus();
    renderCart(await api('/carrito.json'));
  };
  function closeDrawer() {
    if (!drawer || !drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    lastFocus?.focus();
  }
  if (drawer) {
    $$('[data-cart-open]').forEach((a) => a.addEventListener('click', (e) => {
      if (location.pathname === '/carrito' || location.pathname === '/checkout') return;
      e.preventDefault(); openDrawer();
    }));
    $('[data-cart-close]', drawer).addEventListener('click', closeDrawer);
    drawer.addEventListener('click', async (e) => {
      if (e.target === drawer) return closeDrawer();
      const b = e.target.closest('[data-set]');
      if (!b) return;
      const cart = await api('/carrito/actualizar', { product_id: b.dataset.set, qty: b.dataset.q });
      renderCart(cart); updateCount(cart.count);
    });
  }

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-add-to-cart]');
    if (!form) return;
    e.preventDefault();
    const btn = form.querySelector('button:not([type=button])');
    btn.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      const pageQty = $('.buy input[name=qty]');
      if (!data.qty && pageQty && form.closest('[data-buybar]')) data.qty = pageQty.value;
      const cart = await api('/carrito/agregar', data);
      updateCount(cart.count);
      if (cart.error) showToast(cart.error);
      if (cart.items) { await openDrawer(); }
    } catch {
      form.submit();
    } finally {
      btn.disabled = false;
    }
  });

  /* ---- Selector de cantidad ---- */
  $$('[data-qty]').forEach((q) => {
    const input = $('input', q);
    $$('[data-step]', q).forEach((b) => b.addEventListener('click', () => {
      const v = Math.min(+input.max || 99, Math.max(1, (+input.value || 1) + +b.dataset.step));
      input.value = v;
    }));
  });

  /* ---- Barra de compra fija (ficha de producto, móvil) ---- */
  const buybar = $('[data-buybar]');
  const buyForm = $('.buy');
  if (buybar && buyForm && 'IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => buybar.classList.toggle('is-visible', !en.isIntersecting && en.boundingClientRect.top < 0))
      .observe(buyForm);
  }

  /* ---- Filtros de la tienda ---- */
  const filters = $('[data-autosubmit]');
  if (filters) {
    let t;
    filters.addEventListener('change', (e) => { if (e.target.name !== 'q') filters.requestSubmit(); });
    $('input[type=search]', filters)?.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => filters.requestSubmit(), 600); });
    filters.addEventListener('submit', () => {
      $$('input, select', filters).forEach((el) => { if (!el.value || (el.type === 'checkbox' && !el.checked)) el.disabled = true; });
      if ($('select[name=orden]', filters)?.value === 'destacados') $('select[name=orden]', filters).disabled = true;
    });
  }

  /* ---- Checkout ---- */
  const co = $('[data-checkout]');
  if (co) {
    const addr = $('[data-address]', co);
    const shipOut = $('[data-ship-out]', co);
    const totalOut = $('[data-total-out]', co);
    const refresh = () => {
      const r = $('input[name=delivery_method]:checked', co);
      const ship = r ? +r.dataset.ship : 0;
      if (addr) addr.hidden = !r || r.value !== 'domicilio';
      shipOut.textContent = eur(ship);
      totalOut.textContent = eur(+totalOut.dataset.subtotal + ship);
    };
    co.addEventListener('change', (e) => {
      if (e.target.name === 'delivery_method') refresh();
      if (e.target.matches('[data-gift]')) $('[data-giftmsg]', co).hidden = !e.target.checked;
    });
    co.addEventListener('submit', () => { const b = $('button:not([type=button])', co); b.disabled = true; b.lastChild.textContent = 'Procesando…'; });
    refresh();
  }

  /* ---- Reserva: preseleccionar cata ---- */
  $$('[data-pick-tasting]').forEach((a) => a.addEventListener('click', () => {
    const sel = $('#tastingSelect');
    if (sel) sel.value = a.dataset.pickTasting;
  }));

  /* ---- Mapa bajo demanda (sin cookies de Google hasta hacer clic) ---- */
  $$('[data-map]').forEach((m) => $('.map__load', m)?.addEventListener('click', () => {
    m.innerHTML = `<iframe src="https://www.google.com/maps?q=${m.dataset.map}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Mapa de ubicación" allowfullscreen></iframe>`;
  }));
})();

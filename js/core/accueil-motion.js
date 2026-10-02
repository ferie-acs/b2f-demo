/** Mouvements de l’accueil, pilotés par le défilement sans bloquer la navigation. */
export function animerAccueil(root, button) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 760px)');
  const assembly = root.querySelector('.lp-assembly');
  const sticky = assembly?.querySelector('.lp-assembly-sticky');
  const process = root.querySelector('.th-process-grid');
  const photos = [...root.querySelectorAll('.th-hero-picture, .th-photo-frame')];
  const nodes = new Set();
  let paused = false, frame = 0, dead = false;
  const disabled = () => paused || reduced.matches;
  const clamp = value => Math.min(1, Math.max(0, value));
  const reveal = node => { node.classList.add('is-revealed'); observer?.unobserve(node); };
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) reveal(entry.target); });
  }, {threshold: .08, rootMargin: '0px 0px -24px 0px'}) : null;

  function register(node, index = 0, kind = 'rise') {
    if (nodes.has(node)) return;
    nodes.add(node);
    node.dataset.scrollReveal = kind;
    node.style.setProperty('--reveal-delay', `${Math.min(index, 4) * 85}ms`);
    if (disabled() || !observer || node.contains(document.activeElement)) reveal(node);
    else observer.observe(node);
  }
  function group(selector, kind = 'rise') {
    root.querySelectorAll(selector).forEach((node, index) => register(node, index, kind));
  }
  root.querySelectorAll('.th-heading').forEach(heading => {
    [...heading.children].forEach((node, index) => register(node, index));
  });
  group('.th-hero-copy > .th-label, .th-hero-copy h1, .th-hero-intro');
  group('.th-actors > a');
  group('.th-image-note', 'soft');
  group('.th-map-workspace', 'soft');
  group('.th-photo-stack, .th-trust-photo', 'photo');
  ['.th-service-grid', '.th-process-grid', '.th-about-points', '.th-trust-items', '.th-faq > div:last-child', '.th-cta-actions', '.th-footer-grid'].forEach(selector => {
    const parent = root.querySelector(selector);
    if (parent) [...parent.children].forEach((node, index) => register(node, index));
  });
  group('.th-cta .th-label, .th-cta h2');

  // Les cartes sont recréées quand les filtres ou la sélection changent.
  const list = root.querySelector('.th-map-list');
  function registerOffers() {
    nodes.forEach(node => {
      if (!root.contains(node)) { observer?.unobserve(node); nodes.delete(node); }
    });
    list?.querySelectorAll('.th-map-offer').forEach((node, index) => register(node, index, 'offer'));
  }
  registerOffers();
  const offersObserver = new MutationObserver(registerOffers);
  if (list) offersObserver.observe(list, {childList: true});

  function draw() {
    frame = 0;
    if (dead || disabled() || document.hidden) return;
    if (!root.isConnected) { clean(); return; }
    if (assembly && sticky) {
      const bounds = assembly.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(sticky).top) || 0;
      const travel = Math.max(1, assembly.offsetHeight - sticky.offsetHeight);
      assembly.style.setProperty('--assembly', clamp((top - bounds.top) / travel).toFixed(4));
    }
    if (process) {
      const bounds = process.getBoundingClientRect();
      process.style.setProperty('--route-progress', clamp((innerHeight * .85 - bounds.top) / (innerHeight * .55)).toFixed(4));
    }
    if (!mobile.matches) photos.forEach(photo => {
      const bounds = photo.getBoundingClientRect();
      if (bounds.bottom < -80 || bounds.top > innerHeight + 80) return;
      const progress = clamp((innerHeight - bounds.top) / (innerHeight + bounds.height));
      const amplitude = photo.classList.contains('th-hero-picture') ? 34 : 24;
      photo.style.setProperty('--photo-drift', `${((progress - .5) * 2 * amplitude).toFixed(1)}px`);
    });
  }
  function schedule() {
    if (!dead && !frame && !disabled()) frame = requestAnimationFrame(draw);
  }
  function resetPhotos() { photos.forEach(photo => photo.style.setProperty('--photo-drift', '0px')); }
  function apply() {
    root.classList.toggle('lp-motion-off', disabled());
    button.textContent = reduced.matches ? 'Animations réduites' : paused ? 'Relancer les animations' : 'Mettre les animations en pause';
    button.setAttribute('aria-pressed', String(disabled()));
    button.disabled = reduced.matches;
    if (disabled()) {
      cancelAnimationFrame(frame); frame = 0;
      resetPhotos(); assembly?.style.setProperty('--assembly', '1');
      process?.style.setProperty('--route-progress', '1');
      nodes.forEach(reveal);
    } else schedule();
  }
  function toggle() { paused = !paused; apply(); }
  function resize() { resetPhotos(); schedule(); }
  // Le clavier ne doit jamais atteindre un contrôle encore transparent.
  function focus(event) {
    const item = event.target.closest('[data-scroll-reveal]');
    if (item) reveal(item);
  }
  function clean() {
    if (dead) return;
    dead = true; cancelAnimationFrame(frame);
    observer?.disconnect(); offersObserver.disconnect();
    button.removeEventListener('click', toggle);
    root.removeEventListener('focusin', focus);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', resize);
    window.removeEventListener('hashchange', clean);
    document.removeEventListener('visibilitychange', schedule);
    reduced.removeEventListener('change', apply);
    mobile.removeEventListener('change', resize);
  }
  root.classList.add('lp-motion-ready', 'th-scroll-ready');
  button.addEventListener('click', toggle);
  root.addEventListener('focusin', focus);
  window.addEventListener('scroll', schedule, {passive: true});
  window.addEventListener('resize', resize, {passive: true});
  window.addEventListener('hashchange', clean);
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', apply);
  mobile.addEventListener('change', resize);
  apply();
  return clean;
}

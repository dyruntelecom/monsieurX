// Home page demo: the spotlight walks the featured page panel by panel, the way the reader does.
(() => {
  const data = document.getElementById('demo-zones');
  const spot = document.querySelector('.demo-spot');
  const page = document.querySelector('.demo-page');
  if (!data || !spot || !page) return;
  let zones = [];
  try { zones = JSON.parse(data.textContent) || []; } catch (e) {}
  if (!zones.length) { spot.remove(); return; }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0, timer = null, visible = true;
  const show = (k) => {
    const [x, y, w, h] = zones[k];
    spot.style.left = (x * 100) + '%'; spot.style.top = (y * 100) + '%';
    spot.style.width = (w * 100) + '%'; spot.style.height = (h * 100) + '%';
  };
  show(0);
  page.classList.add('lit');
  if (reduce) return;
  const tick = () => { i = (i + 1) % zones.length; show(i); };
  const run = () => { if (!timer && visible && !document.hidden) timer = setInterval(tick, 2400); };
  const stop = () => { clearInterval(timer); timer = null; };
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? run() : stop(); }).observe(page);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()));
  page.addEventListener('pointerenter', stop);
  page.addEventListener('pointerleave', run);
  run();
})();

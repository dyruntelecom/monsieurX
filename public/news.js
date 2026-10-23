// Storink Daily reader: one screen = one drawing + one bubble. Tap right / swipe to move on, left to go back.
(() => {
  const D = JSON.parse(document.getElementById('ep-data').textContent);
  const T = D.t, S = D.stories;
  const C = D.lang === 'fr' ? '\u00a0: ' : ': '; // label separator, French typography
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  // flat list of screens, the same order as the stats page index
  const flat = [];
  S.forEach((st, si) => st.slides.forEach((sl, k) => flat.push({ si, k })));

  /* audience stats: anonymous, no cookies */
  const SID = (() => { try { let s = sessionStorage.getItem('storink-sid'); if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('storink-sid', s); } return s; } catch (e) { return Math.random().toString(36).slice(2); } })();
  function track(t, data) { try { const body = JSON.stringify(Object.assign({ t, sid: SID, s: D.series, e: D.episode, l: D.lang }, data || {})); if (navigator.sendBeacon) navigator.sendBeacon('/e', new Blob([body], { type: 'application/json' })); else fetch('/e', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {}); } catch (e) {} }
  track('view', { ref: document.referrer || '', w: innerWidth, q: location.search.slice(0, 200) });
  if (!flat.length) { document.querySelectorAll('#top,#bubble,#prevArea,#nextArea').forEach((el) => (el.hidden = true)); return; }

  const img = $('#img'), bg = $('#bg'), frame = $('#frame');
  const cache = {};
  const load = (i) => { const f = flat[i]; if (!f) return null; const src = S[f.si].slides[f.k].src; if (!cache[src]) { const im = new Image(); im.decoding = 'async'; im.src = src; cache[src] = im; } return cache[src]; };

  let i = 0, ended = false, started = false;
  const seen = new Set();

  function render() {
    const { si, k } = flat[i];
    const st = S[si], sl = st.slides[k];
    ended = false; $('#end').hidden = true; frame.classList.remove('ended');
    img.src = sl.src; bg.style.backgroundImage = `url("${sl.src}")`;
    // progress bars for the current story
    $('#bars').innerHTML = st.slides.map((_, n) => `<i class="${n < k ? 'done' : n === k ? 'on' : ''}"></i>`).join('');
    $('#count').textContent = T.story.replace('{n}', si + 1).replace('{total}', S.length);
    const h = $('#headline'); h.textContent = st.headline; h.classList.toggle('show', k === 0); frame.classList.toggle('first', k === 0);
    $('#who').textContent = sl.who ? T.says.replace('{who}', sl.who) : '';
    $('#who').hidden = !sl.who;
    $('#text').textContent = sl.who ? '“' + sl.text + '”' : sl.text;
    $('#bubble').classList.toggle('speech', !!sl.who);
    const last = k === st.slides.length - 1;
    $('#foot').innerHTML = last
      ? `<span>${esc(T.sources)}${C}${st.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(', ')}</span><span>${esc(T.style)}${C}${esc(st.style)} · ${esc(T.ai)}</span>`
      : '';
    frame.classList.toggle('has-foot', last);
    if (!seen.has(i)) { seen.add(i); track('page', { p: i }); }
    try { history.replaceState(null, '', '#s' + (si + 1) + '-' + (k + 1)); } catch (e) {}
    store.set(D.key, String(i));
    for (let n = 1; n <= 3; n++) load(i + n);
  }

  function showEnd() {
    ended = true; frame.classList.add('ended'); $('#end').hidden = false;
    $('#bars').innerHTML = ''; $('#count').textContent = ''; $('#headline').classList.remove('show');
    try { history.replaceState(null, '', '#end'); } catch (e) {}
  }

  function go(n) {
    if (!started) { started = true; track('start', {}); }
    hideTip();
    if (n >= flat.length) { showEnd(); return; }
    if (n < 0) n = 0;
    i = n; render();
  }
  const next = () => (ended ? null : go(i + 1));
  const prev = () => (ended ? go(flat.length - 1) : go(i - 1));
  const nextStory = () => { const si = flat[i].si; const n = flat.findIndex((f) => f.si === si + 1); n < 0 ? showEnd() : go(n); };
  const prevStory = () => { const si = flat[i].si; const n = flat.findIndex((f) => f.si === Math.max(0, (flat[i].k === 0 ? si - 1 : si))); go(n); };

  $('#nextArea').addEventListener('click', next);
  $('#prevArea').addEventListener('click', prev);
  $('#again').addEventListener('click', () => go(0));

  // swipe: left/up = next, right/down = previous
  let sx = 0, sy = 0, st0 = 0;
  frame.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st0 = Date.now(); }, { passive: true });
  frame.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 40 || Date.now() - st0 > 800) return;
    e.preventDefault();
    if (Math.abs(dx) > Math.abs(dy)) dx < 0 ? next() : prev(); else dy < 0 ? nextStory() : prevStory();
  });
  addEventListener('keydown', (e) => {
    if (!$('#index').hidden) { if (e.key === 'Escape') closeIndex(); return; }
    if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); nextStory(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); prevStory(); }
  });

  // index of stories
  const ix = $('#ixList');
  S.forEach((st, si) => {
    const li = document.createElement('li');
    li.innerHTML = `<button><img loading="lazy" src="${esc(st.slides[0].src)}" alt=""><span>${esc(st.headline)}</span></button>`;
    li.querySelector('button').onclick = () => { closeIndex(); go(flat.findIndex((f) => f.si === si)); };
    ix.appendChild(li);
  });
  function openIndex() { $('#index').hidden = false; }
  function closeIndex() { $('#index').hidden = true; }
  $('#ixBtn').onclick = openIndex; $('#ixClose').onclick = closeIndex;

  // tip
  const tip = $('#tip');
  function hideTip() { tip.classList.add('gone'); }

  // start: deep link (#s3-2), else saved position, else the beginning
  const m = /^#s(\d+)-(\d+)$/.exec(location.hash);
  let startAt = 0;
  if (m) { const n = flat.findIndex((f) => f.si === +m[1] - 1 && f.k === +m[2] - 1); if (n >= 0) startAt = n; }
  else { const saved = Number(store.get(D.key)); if (saved > 0 && saved < flat.length) startAt = saved; }
  i = startAt; render();
  if (!startAt) { tip.classList.remove('gone'); setTimeout(hideTip, 3500); }
})();

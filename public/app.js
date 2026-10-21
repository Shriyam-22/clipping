// Web client: plain JS, no build step. Talks to the REST API in /src/app.js.
const $ = (sel) => document.querySelector(sel);
const form = $('#form');
const state = { q: '', campaign: '', sentiment: '' };
let toastTimer;
let shown = new Map(); // clips currently on screen, so Undo can restore a deleted one

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : '–');

async function loadSummary() {
  const { data } = await api(`/api/summary${state.campaign ? `?campaign=${encodeURIComponent(state.campaign)}` : ''}`);
  $('#s-total').textContent = data.total;
  $('#s-tier1').textContent = data.byTier[1] || 0;
  $('#s-pos').textContent = pct(data.bySentiment.positive || 0, data.total);
  $('#s-neg').textContent = pct(data.bySentiment.negative || 0, data.total);

  const sel = $('#f-campaign');
  const current = sel.value;
  sel.innerHTML = '<option value="">All campaigns</option>' + data.campaigns.map((c) => `<option>${esc(c)}</option>`).join('');
  sel.value = current;
  $('#campaigns').innerHTML = data.campaigns.map((c) => `<option value="${esc(c)}">`).join('');
  $('#outlets').innerHTML = data.topOutlets.map((o) => `<option value="${esc(o.outlet)}">`).join('');
}

async function loadList() {
  const params = new URLSearchParams(Object.entries(state).filter(([, v]) => v));
  const { data } = await api(`/api/coverage?${params}`);
  shown = new Map(data.items.map((c) => [c.id, c]));
  $('#list').innerHTML = data.items.map((c) => `
    <li>
      <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.headline)}</a>
      <div class="meta">
        <strong>${esc(c.outlet)}</strong> · ${fmtDate(c.published)}
        <span class="pill">Tier ${c.tier}</span>
        <span class="pill ${c.sentiment}">${c.sentiment}</span>
        ${c.campaign ? `<span class="pill">${esc(c.campaign)}</span>` : ''}
      </div>
      <button class="del" data-id="${c.id}" aria-label="Delete clip">Delete</button>
    </li>`).join('');

  const filtered = Object.values(state).some(Boolean);
  $('#empty').hidden = data.items.length > 0;
  $('#empty').textContent = filtered ? 'No clips match these filters.' : 'No clips yet. Log your first one above.';
}

const refresh = () => Promise.all([loadSummary(), loadList()]);

function showErrors(fields = {}) {
  form.querySelectorAll('.err').forEach((p) => { p.textContent = fields[p.dataset.for] || ''; });
  form.querySelectorAll('input').forEach((i) => i.setAttribute('aria-invalid', fields[i.name] ? 'true' : 'false'));
  const first = Object.keys(fields)[0];
  if (first) form.elements[first]?.focus();
}

function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { t.hidden = true; action.run(); };
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#submit');
  btn.disabled = true; // avoid double-submits on slow networks
  $('#dupe').hidden = true;
  const body = Object.fromEntries(new FormData(form));
  const { status, data } = await api('/api/coverage', { method: 'POST', body: JSON.stringify(body) });
  btn.disabled = false;

  if (status === 201) {
    showErrors();
    const keep = { tier: body.tier, sentiment: body.sentiment, campaign: body.campaign, published: body.published };
    form.reset();
    // Keep campaign/date/tier: people usually log several clips from one launch in a row.
    for (const [k, v] of Object.entries(keep)) form.elements[k].value = v;
    form.elements.url.focus();
    toast('Clip saved');
    return refresh();
  }
  if (status === 422) return showErrors(data.fields);
  if (status === 409) {
    showErrors();
    const d = $('#dupe');
    d.innerHTML = `Already logged on ${fmtDate(data.existing.published)}: <strong>${esc(data.existing.headline)}</strong> (${esc(data.existing.outlet)})`;
    d.hidden = false;
    return;
  }
  toast(data?.error || 'Could not save. Try again.');
});

$('#list').addEventListener('click', async (e) => {
  const btn = e.target.closest('.del');
  if (!btn) return;
  const li = btn.closest('li');
  const clip = shown.get(Number(btn.dataset.id));
  li.style.opacity = '.4';
  const { ok } = await api(`/api/coverage/${btn.dataset.id}`, { method: 'DELETE' });
  if (!ok) { li.style.opacity = ''; return toast('Could not delete. Try again.'); }
  await refresh();
  // Undo instead of an "Are you sure?" dialog: faster, and mistakes are recoverable.
  toast('Clip deleted', clip && {
    label: 'Undo',
    run: async () => { await api('/api/coverage', { method: 'POST', body: JSON.stringify(clip) }); refresh(); },
  });
});

let searchTimer;
$('#q').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.q = e.target.value.trim(); loadList(); }, 250); // debounce
});
$('#f-campaign').addEventListener('change', (e) => { state.campaign = e.target.value; refresh(); });
$('#f-sentiment').addEventListener('change', (e) => { state.sentiment = e.target.value; loadList(); });

// Local date, not UTC: in IST, toISOString() still says 'yesterday' until 5:30am.
const d = new Date();
form.elements.published.max = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
form.elements.published.value = form.elements.published.max;
refresh();

// Loads the dataset (live database first, bundled snapshot as fallback), then starts the map.
(async function () {
  const cfg = window.TRACKER_CONFIG || {};
  const note = document.getElementById('note');
  const getJson = async (url, opts) => {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(url + ' returned ' + r.status);
    return r.json();
  };

  async function fromDatabase() {
    if (!cfg.supabaseUrl || !cfg.supabaseKey) return null;
    const headers = { apikey: cfg.supabaseKey, Authorization: 'Bearer ' + cfg.supabaseKey };
    const base = cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + (cfg.tablePrefix || '');
    const table = async (name, order) => {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await getJson(base + name + '?select=*&order=' + order + '&limit=1000&offset=' + offset, { headers });
        rows.push(...page);
        if (page.length < 1000) return rows;
      }
    };
    const [assets, routes, links, country_balances, category_defaults] = await Promise.all([
      table('assets', 'sort_order,id'), table('routes', 'sort_order,id'), table('links', 'subject,direction,position'),
      table('country_balances', 'country'), table('category_defaults', 'category')
    ]);
    if (!assets.length) throw new Error('database returned no assets');
    // Optional tables: the site still works if they do not exist yet.
    const opt = (name, query) => getJson(base + name + '?select=*&' + query, { headers }).catch(() => []);
    const since = () => new Date(Date.now() - 864e5).toISOString();
    const [news, proposals, vessels] = await Promise.all([
      opt('news', 'order=published_on.desc.nullslast&limit=500'), opt('change_proposals', 'status=eq.pending&order=created_at.desc'),
      opt('vessels', 'updated_at=gte.' + since() + '&limit=5000')
    ]);
    window.TRACKER_REFRESH_VESSELS = () => opt('vessels', 'updated_at=gte.' + since() + '&limit=5000');
    return { assets, routes, links, country_balances, category_defaults, news, proposals, vessels };
  }

  const monthYear = d => d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;

  try {
    let data = null;
    window.DATA_SOURCE = 'bundled snapshot';
    try {
      data = await fromDatabase();
      if (data) window.DATA_SOURCE = 'live database';
    } catch (e) {
      console.warn('Live database unavailable, using bundled snapshot.', e);
    }
    const [snapshot, world, pipelines] = await Promise.all([
      data ? null : getJson('data/snapshot.json'), getJson('data/world.json'), getJson('data/pipelines.json')
    ]);
    data = data || snapshot;

    window.PTS = data.assets.map(a => ({
      id: a.id, cat: a.category, name: a.name, country: a.country || '', lat: +a.lat, lon: +a.lon, st: a.status,
      cap: a.capacity_text, kbd: a.capacity_kbd == null ? undefined : +a.capacity_kbd, op: a.operator, role: a.trade_role,
      note: a.note, own: a.vessel_owner, chr: a.charterer, end: a.charter_end_year, term: a.charter_note,
      yr: a.startup_year, src: a.source, chk: monthYear(a.checked_on)
    }));
    window.LNS = data.routes.map(r => ({
      id: r.id, cat: r.category, name: r.name, st: r.status, cap: r.capacity_text, note: r.note,
      yr: r.startup_year, src: r.source, chk: monthYear(r.checked_on), paths: r.paths
    }));
    const links = {};
    data.links.slice().sort((a, b) => a.position - b.position).forEach(l => {
      const e = links[l.subject] || (links[l.subject] = [[], []]);
      e[l.direction === 'out' ? 1 : 0].push(l.counterparty);
    });
    window.LINKS = {};
    for (const k in links) window.LINKS[k] = [links[k][0].join('; '), links[k][1].join('; ')];
    window.CSTAT = {};
    data.country_balances.forEach(c => { window.CSTAT[c.country] = [+c.oil_production_mbd, +c.oil_consumption_mbd, +c.gas_production_bcm, +c.gas_consumption_bcm]; });
    window.TYP = {};
    data.category_defaults.forEach(c => { window.TYP[c.category] = [c.typical_supplied_by || '', c.typical_delivers_to || '']; });
    window.WORLD = world;
    window.GEM = pipelines;
    window.NEWS = data.news || [];
    window.PROPOSALS = data.proposals || [];
    window.VESSELS = data.vessels || [];
    window.SAT = 'img/satellite.jpg';

    const s = document.createElement('script');
    s.src = 'js/app.js?v=8';
    s.onerror = () => { note.textContent = 'The map code did not load. Reload the page.'; };
    document.body.appendChild(s);
  } catch (e) {
    console.error(e);
    note.style.display = 'block';
    note.textContent = 'The map data did not load. Check the connection and reload the page.';
  }
})();

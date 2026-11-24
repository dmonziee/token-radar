// Token Radar dashboard. Reads window.RADAR (written by main.ts from the
// sealed snapshot) and renders the ranked board, filters, sorting and a
// detail view with each protocol's farm plan. No network: every byte shown
// is in data.js. The implied value is recomputed here from the same figures
// the model in lib/model.ts uses, so the page and board.json agree.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;
  var state = { q: '', category: 'all', chain: 'all', watch: false, tab: 'board', sort: 'implied', dir: -1, selected: null };
  // Deep links: ?select=<slug> opens a protocol, ?category= / ?chain= / ?q=
  // filter the board, ?tab=live shows the tokens that already trade.
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('select')) state.selected = params.get('select');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('q')) state.q = params.get('q');
    if (params.get('tab')) state.tab = params.get('tab');
  } catch (e) { /* no query support: ignore */ }

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function age(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  // Recompute a row's implied value from the snapshot figures, exactly as
  // lib/model.ts does: TVL x the row's fitted multiple, times the growth,
  // age and breadth factors. The multiple is the row's own category
  // multiple (or the global median when its category has too few traded
  // protocols), carried in the row's model block.
  function impliedOf(r) {
    var growth = Math.min(50, Math.max(-30, r.change_7d === null ? 0 : r.change_7d));
    var ageY = r.age_days === null ? 0 : r.age_days / 365;
    var ageM = 1 + 0.1 * Math.min(ageY, 3);
    var breadthM = 1 + 0.03 * Math.min(Math.max(r.chains.length - 1, 0), 10);
    var mult = (r.model && isFinite(r.model.base_multiple)) ? r.model.base_multiple : DATA.base_multiple;
    return Math.max(1, Math.round(r.tvl_usd * mult * (1 + growth / 100) * ageM * breadthM));
  }
  function multText(m) {
    return m.toFixed(3).replace(/0$/, '');
  }

  var cats = [];
  DATA.rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
  cats.sort();
  var chains = [];
  DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
  chains.sort();

  function filtered() {
    var rows = DATA.rows.filter(function (r) {
      if (state.watch && DATA.watchlist.indexOf(r.slug) < 0 && !window.__watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if ((r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var va = key === 'implied' ? a.implied_value_usd : key === 'tvl' ? a.tvl_usd : key === 'growth' ? (a.change_7d === null ? -999 : a.change_7d) : (a.age_days === null ? -1 : a.age_days);
      var vb = key === 'implied' ? b.implied_value_usd : key === 'tvl' ? b.tvl_usd : key === 'growth' ? (b.change_7d === null ? -999 : b.change_7d) : (b.age_days === null ? -1 : b.age_days);
      return (va - vb) * state.dir;
    });
    return rows;
  }

  function render() {
    app.innerHTML = '';
    var wrap = el('div', 'wrap');
    var head = el('header');
    head.appendChild(el('div', 'kicker', 'Token Radar &middot; DefiLlama snapshot ' + esc(DATA.as_of)));
    head.appendChild(el('h1', '', 'Pre-token protocols, ranked by implied launch value'));
    head.appendChild(el('p', 'sub', '198 protocols that record no token, ranked by what their token would be worth if their record stayed as it is. This is the entry&rsquo;s own claim, not a prediction of whether or when a token launches.'));
    wrap.appendChild(head);

    var stats = el('div', 'stats');
    [['' + DATA.rows.length, 'protocols ranked'], ['' + DATA.watchlist_size, 'on the watchlist'], [usd(DATA.rows.reduce(function (s, r) { return s + r.tvl_usd; }, 0)), 'combined TVL'], [usd(DATA.rows[0].implied_value_usd), 'top implied value']].forEach(function (s) {
      stats.appendChild(el('div', 'stat', '<b>' + s[0] + '</b><span>' + s[1] + '</span>'));
    });
    wrap.appendChild(stats);

    var mults = DATA.multiples || { global: DATA.base_multiple, global_n: 0, by_category: [] };
    var boardCats = {};
    DATA.rows.forEach(function (r) { if (r.category) boardCats[r.category] = true; });
    var fittedList = mults.by_category.filter(function (c) { return boardCats[c.category]; });
    var model = el('div', 'model', '<b style="color:var(--ink)">How the value is worked out.</b> ' +
      'implied value = TVL &times; <code>multiple</code> &times; growth factor &times; age factor &times; breadth factor. ' +
      'The multiple is fitted from the snapshot itself: the median market-cap / TVL of the ' + mults.global_n + ' protocols whose token already trades is <code>' + multText(mults.global) + '</code>, and each category with at least five traded protocols gets its own multiple, shrunk toward that global number so a thin category cannot drag the board on noise' +
      (fittedList.length ? ' &mdash; ' + fittedList.map(function (c) { return esc(c.category) + ' <code>' + multText(c.multiple) + '</code> (' + c.traded_n + ' traded)'; }).join(', ') : '') +
      '. Growth is the 7-day TVL change, clamped to &minus;30%..+50%. ' +
      'Age adds 10% a year running with no token, capped at 3 years. Breadth adds 3% per extra chain, capped at 10. ' +
      'No name is special-cased. Exchanges, bridges, liquid-staking products and wrapped or staked products are excluded, as are versioned pools &mdash; they are not launches that have not happened yet.');
    wrap.appendChild(model);

    var tabs = el('div', 'tabs');
    [['board', 'Pre-token board'], ['live', 'Already trades (not ranked)']].forEach(function (t) {
      var b = el('button', state.tab === t[0] ? 'on' : '', t[1]);
      b.onclick = function () { state.tab = t[0]; state.selected = null; render(); };
      tabs.appendChild(b);
    });
    wrap.appendChild(tabs);

    if (state.tab === 'live') {
      var live = el('div');
      live.appendChild(el('p', 'sub', 'These protocols already have a token that trades, so they are shown at the market&rsquo;s own value &mdash; market cap, not a model &mdash; and never ranked as launches.'));
      var lt = el('table');
      lt.innerHTML = '<thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead>';
      var lb = el('tbody');
      DATA.live.forEach(function (r) {
        var tr = el('tr');
        tr.innerHTML = '<td><b>' + esc(r.name) + '</b></td><td>' + esc(r.category || 'n/a') + '</td><td class="num">' + usd(r.tvl_usd) + '</td><td class="num">' + usd(r.mcap_usd) + '</td><td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</td>';
        lb.appendChild(tr);
      });
      lt.appendChild(lb);
      live.appendChild(lt);
      wrap.appendChild(live);
      wrap.appendChild(el('footer', '', 'Source: DefiLlama, fetched ' + esc(DATA.source) + '. Snapshot as of ' + esc(DATA.as_of) + '.'));
      app.appendChild(wrap);
      return;
    }

    var controls = el('div', 'controls');
    var q = el('input'); q.type = 'search'; q.placeholder = 'Search name or slug…'; q.value = state.q;
    q.oninput = function () { state.q = q.value; render(); };
    var cat = el('select');
    cat.innerHTML = '<option value="all">All categories</option>' + cats.map(function (c) { return '<option' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    cat.onchange = function () { state.category = cat.value; render(); };
    var ch = el('select');
    ch.innerHTML = '<option value="all">All chains</option>' + chains.map(function (c) { return '<option' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    ch.onchange = function () { state.chain = ch.value; render(); };
    controls.appendChild(q); controls.appendChild(cat); controls.appendChild(ch);
    wrap.appendChild(controls);

    var rows = filtered();
    wrap.appendChild(el('div', 'count', rows.length + ' of ' + DATA.rows.length + ' protocols &mdash; click a row for its detail and farm plan. Click a column header to sort.'));

    if (state.selected) {
      var r = DATA.rows.filter(function (x) { return x.slug === state.selected; })[0];
      if (r) {
        var det = el('div', 'detail');
        det.appendChild(el('h2', '', '#' + r.rank + ' &mdash; ' + esc(r.name) + ' <span class="badge">WATCHLIST</span>'.replace('WATCHLIST', DATA.watchlist.indexOf(r.slug) >= 0 ? 'WATCHLIST' : 'BELOW THE FLOOR')));
        det.appendChild(el('div', 'grid2',
          '<div><b>Category</b><br>' + esc(r.category || 'n/a') + '</div>' +
          '<div><b>Chains</b><br>' + esc(r.chains.join(', ')) + '</div>' +
          '<div><b>TVL</b><br>' + usd(r.tvl_usd) + '</div>' +
          '<div><b>7-day change</b><br>' + pct(r.change_7d) + '</div>' +
          '<div><b>Implied value</b><br>' + usd(r.implied_value_usd) + ' (recomputed in this page: ' + usd(impliedOf(r)) + ')</div>' +
          '<div><b>Running with no token</b><br>' + age(r.age_days) + (r.listed_at ? ' since ' + esc(r.listed_at) : '') + '</div>' +
          '<div><b>Value multiple</b><br>' + multText(r.model.base_multiple) + '&times; TVL &mdash; ' + (r.model.multiple_source === 'category' ? 'fitted from ' + r.model.multiple_n + ' traded ' + esc(r.category || '') + ' protocols' : 'global median of ' + r.model.multiple_n + ' traded protocols') + '</div>' +
          '<div><b>Factors</b><br>growth &times;' + r.model.growth_multiplier + ' &middot; age &times;' + r.model.age_multiplier + ' &middot; breadth &times;' + r.model.breadth_multiplier + '</div>'));
        det.appendChild(el('h3', '', 'How to farm it'));
        var ol = el('ol');
        r.farm_steps.forEach(function (s) { ol.appendChild(el('li', '', esc(s))); });
        det.appendChild(ol);
        wrap.appendChild(det);
      }
    }

    var table = el('table');
    var thead = el('thead');
    var hr = el('tr');
    [['Rank', 'rank'], ['Protocol', 'name'], ['Category', 'category'], ['Chains', 'chains'], ['TVL', 'tvl'], ['7d', 'growth'], ['Age', 'age'], ['Implied value', 'implied']].forEach(function (c) {
      var th = el('th', c[0] === 'TVL' || c[0] === '7d' || c[0] === 'Age' || c[0] === 'Implied value' ? 'num' : '', c[0]);
      th.onclick = function () {
        var key = c[1] === 'rank' ? 'implied' : c[1];
        if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; }
        render();
      };
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    rows.slice(0, 100).forEach(function (r) {
      var tr = el('tr', state.selected === r.slug ? 'sel' : '');
      tr.onclick = function () { state.selected = r.slug; render(); window.scrollTo(0, 0); };
      tr.innerHTML =
        '<td>' + r.rank + (DATA.watchlist.indexOf(r.slug) >= 0 ? ' <span class="badge">W</span>' : '') + '</td>' +
        '<td><b>' + esc(r.name) + '</b><br><span style="color:var(--muted);font-size:12px">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || 'n/a') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num"><b>' + usd(r.implied_value_usd) + '</b></td>';
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    wrap.appendChild(el('div', 'count', 'Showing the first 100 of ' + rows.length + ' matching rows. Use search or a filter to narrow the board.'));
    wrap.appendChild(el('footer', '', 'Source: DefiLlama, fetched ' + esc(DATA.source) + '. Snapshot as of ' + esc(DATA.as_of) + '. Implied values are this entry&rsquo;s claim, not a prediction of whether or when a token launches.'));
    app.appendChild(wrap);
    app.removeAttribute('aria-busy');
  }
  render();
})();

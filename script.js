/* Hisab Calculator — a printing calculator with Nepali digits, lakh/crore grouping,
   amounts in words and a one-tap 13% VAT key. No eval(): a small shunting-yard parser. */
(() => {
  'use strict';

  const OPS = '+−×÷';
  const DEVA = '०१२३४५६७८९';
  const VAT_RATE = 0.13;
  const $ = (id) => document.getElementById(id);

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  const state = {
    expr: '',        // what the user is typing, e.g. "2500+1800×4"
    done: false,     // true right after "=" so the next digit starts fresh
    shown: 0,        // last computed value
    lastEq: '',      // last equation, shown above the result
    error: null,
    deva: store.get('hisab.deva', false),
    lakh: store.get('hisab.lakh', true),
    tape: store.get('hisab.tape', null),
  };

  /* ---------------- Formatting ---------------- */
  const toDigits = (s) => (state.deva ? s.replace(/[0-9]/g, (d) => DEVA[d]) : s);

  function groupInt(int) {
    if (int.length <= 3) return int;
    if (!state.lakh) return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const last3 = int.slice(-3);
    const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return rest + ',' + last3; // 1,23,45,678 — the South Asian way
  }
  function groupNumStr(s) {
    const m = s.match(/^(\d*)(\.?\d*)$/);
    return m ? groupInt(m[1]) + m[2] : s;
  }
  function plain(n) { // 12 significant digits, kills 0.1+0.2 noise
    const s = parseFloat(n.toPrecision(12)).toString();
    return s.includes('e') ? null : s;
  }
  function fmtNumber(n) {
    if (!isFinite(n)) return 'Error';
    if (Object.is(n, -0)) n = 0;
    const a = Math.abs(n);
    let s = (a !== 0 && (a >= 1e15 || a < 1e-6)) ? null : plain(n);
    if (s === null) return toDigits(n.toExponential(8).replace(/\.?0+e/, 'e').replace('-', '−'));
    const neg = s[0] === '-';
    if (neg) s = s.slice(1);
    return (neg ? '−' : '') + toDigits(groupNumStr(s));
  }
  function spaceOps(e) { // thin spaces around binary operators only
    let out = '';
    for (let i = 0; i < e.length; i++) {
      const c = e[i], p = e[i - 1];
      const binary = '+×÷'.includes(c) || (c === '−' && p !== undefined && /[\d.)%]/.test(p));
      out += binary ? ' ' + c + ' ' : c;
    }
    return out;
  }
  const fmtExpr = (e) => toDigits(spaceOps(e.replace(/\d+\.?\d*|\.\d+/g, groupNumStr)));

  /* ---------------- Amount in words ---------------- */
  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const w99 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''));
  const w999 = (n) => [Math.floor(n / 100) ? ONES[Math.floor(n / 100)] + ' hundred' : '', n % 100 ? w99(n % 100) : '']
    .filter(Boolean).join(' ');
  function wIndian(n) {
    if (n === 0) return 'zero';
    const parts = [];
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const thou = Math.floor(n / 1e3); n %= 1e3;
    if (crore) parts.push(wIndian(crore) + ' crore');
    if (lakh) parts.push(w99(lakh) + ' lakh');
    if (thou) parts.push(w99(thou) + ' thousand');
    if (n) parts.push(w999(n));
    return parts.join(' ');
  }
  function wIntl(n) {
    if (n === 0) return 'zero';
    const parts = [];
    for (const [s, name] of [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) {
      const q = Math.floor(n / s);
      if (q) { parts.push(w999(q) + ' ' + name); n %= s; }
    }
    if (n) parts.push(w999(n));
    return parts.join(' ');
  }
  function words(v) {
    if (!isFinite(v)) return '';
    const a = Math.abs(v);
    if (a >= 1e15) return 'too large to spell out';
    const s = plain(a);
    if (!s) return '';
    const [ip, fp] = s.split('.');
    let out = (state.lakh ? wIndian : wIntl)(parseInt(ip, 10));
    if (fp) out += ' point ' + [...fp].map((d) => ONES[d]).join(' ');
    return (v < 0 ? 'minus ' : '') + out;
  }

  /* ---------------- Parser (no eval) ---------------- */
  function evaluate(src) {
    const toks = [];
    for (let i = 0; i < src.length;) {
      const c = src[i];
      if (/[\d.]/.test(c)) {
        let j = i;
        while (j < src.length && /[\d.]/.test(src[j])) j++;
        const t = src.slice(i, j);
        if (t === '.' || (t.match(/\./g) || []).length > 1) throw new Error('bad');
        toks.push({ t: 'num', v: parseFloat(t) });
        i = j; continue;
      }
      const prev = toks[toks.length - 1];
      if (c === '−' && (!prev || prev.t === 'op' || prev.t === 'neg' || prev.t === 'lp')) toks.push({ t: 'neg' });
      else if (OPS.includes(c)) toks.push({ t: 'op', v: c });
      else if (c === '%') toks.push({ t: 'pct' });
      else if (c === '(') toks.push({ t: 'lp' });
      else if (c === ')') toks.push({ t: 'rp' });
      else throw new Error('bad');
      i++;
    }

    const prec = { '+': 1, '−': 1, '×': 2, '÷': 2 };
    const out = [], st = [];
    for (const k of toks) {
      if (k.t === 'num' || k.t === 'pct') out.push(k);
      else if (k.t === 'neg' || k.t === 'lp') st.push(k);
      else if (k.t === 'op') {
        while (st.length) {
          const top = st[st.length - 1];
          if (top.t === 'neg' || (top.t === 'op' && prec[top.v] >= prec[k.v])) out.push(st.pop()); else break;
        }
        st.push(k);
      } else if (k.t === 'rp') {
        while (st.length && st[st.length - 1].t !== 'lp') out.push(st.pop());
        if (!st.length) throw new Error('bad');
        st.pop();
      }
    }
    while (st.length) { const t = st.pop(); if (t.t === 'lp') throw new Error('bad'); out.push(t); }

    // Stack holds {v, pct}. "a + b%" means a plus b percent OF a, like a shop calculator.
    const s = [];
    for (const k of out) {
      if (k.t === 'num') s.push({ v: k.v, pct: false });
      else if (k.t === 'pct') { const x = s.pop(); if (!x) throw new Error('bad'); s.push({ v: x.v / 100, pct: true }); }
      else if (k.t === 'neg') { const x = s.pop(); if (!x) throw new Error('bad'); s.push({ v: -x.v, pct: x.pct }); }
      else {
        const b = s.pop(), a = s.pop();
        if (!a || !b) throw new Error('bad');
        let bv = b.v;
        if (b.pct && (k.v === '+' || k.v === '−')) bv = a.v * b.v;
        if (k.v === '÷' && bv === 0) throw new Error('zero');
        const r = k.v === '+' ? a.v + bv : k.v === '−' ? a.v - bv : k.v === '×' ? a.v * bv : a.v / bv;
        s.push({ v: r, pct: false });
      }
    }
    if (s.length !== 1) throw new Error('bad');
    return s[0].v;
  }

  function tidy(e) { // drop dangling operators, close open brackets
    while (e && /[+−×÷(]$/.test(e)) e = e.slice(0, -1);
    const open = (e.match(/\(/g) || []).length - (e.match(/\)/g) || []).length;
    return e + ')'.repeat(Math.max(0, open));
  }

  /* ---------------- Input ---------------- */
  const last = () => state.expr.slice(-1);
  const currentNumber = () => state.expr.match(/(\d*\.?\d*)$/)[1];
  function fresh() { if (state.done) { state.expr = ''; state.done = false; } }

  function press(k) {
    state.error = null;
    if (k === '=') return equals();
    if (k === 'vat') return addVat();

    if (k === 'AC') { state.expr = ''; state.done = false; state.lastEq = ''; }
    else if (k === 'back') { if (state.done) { state.expr = ''; state.done = false; } else state.expr = state.expr.slice(0, -1); }
    else if (k === '±') toggleSign();
    else if (/^[0-9]$/.test(k)) {
      fresh();
      if (/[)%]/.test(last())) state.expr += '×';
      const n = currentNumber();
      if (n.replace('.', '').length >= 15) return render();
      if (n === '0') state.expr = state.expr.slice(0, -1);
      state.expr += k;
    } else if (k === '.') {
      fresh();
      const n = currentNumber();
      if (n.includes('.')) return render();
      if (/[)%]/.test(last())) state.expr += '×';
      state.expr += n === '' ? '0.' : '.';
    } else if (OPS.includes(k)) {
      state.done = false;
      const l = last();
      if (state.expr === '' || l === '(') { if (k === '−') state.expr += '−'; }
      else if (OPS.includes(l)) {
        const before = state.expr.slice(0, -1);
        if (before === '' || before.endsWith('(')) { /* keep the unary minus */ }
        else if (k === '−' && '×÷'.includes(l)) state.expr += '−';   // 5 × −3
        else { let e = before; while (e && OPS.includes(e.slice(-1))) e = e.slice(0, -1); state.expr = e + k; }
      } else state.expr += k;
    } else if (k === '(') {
      fresh();
      if (/[\d.)%]/.test(last())) state.expr += '×';
      state.expr += '(';
    } else if (k === ')') {
      const open = (state.expr.match(/\(/g) || []).length - (state.expr.match(/\)/g) || []).length;
      if (open > 0 && /[\d.)%]/.test(last())) state.expr += ')';
    } else if (k === '%') {
      if (/[\d.)]/.test(last())) { state.done = false; state.expr += '%'; }
    }
    render();
  }

  function toggleSign() {
    state.done = false;
    const e = state.expr, n = currentNumber();
    if (!n) { if (e === '') state.expr = '−'; return; }
    const i = e.length - n.length, prev = e[i - 1], pp = e[i - 2];
    if (prev === '−') {
      const unary = i - 2 < 0 || OPS.includes(pp) || pp === '(';
      state.expr = e.slice(0, i - 1) + (unary ? '' : '+') + n;
    } else if (prev === '+') state.expr = e.slice(0, i - 1) + '−' + n;
    else state.expr = e.slice(0, i) + '−' + n;
  }

  function finish(eq, v) {
    state.lastEq = eq;
    state.shown = v;
    state.expr = plain(v)?.replace('-', '−') ?? '';
    state.done = true;
  }
  function fail(err) {
    state.error = err.message === 'zero' ? 'Can’t divide by zero' : 'Check the expression';
    render();
  }

  function equals() {
    const e = tidy(state.expr);
    if (!e) return render();
    try {
      const v = evaluate(e);
      if (!isFinite(v)) throw new Error('bad');
      if (!state.done) print({ eq: e, v });
      finish(e, v);
      render();
    } catch (err) { fail(err); }
  }

  function addVat() {
    const e = tidy(state.expr);
    if (!e) return render();
    try {
      const base = evaluate(e);
      const v = base * (1 + VAT_RATE);
      print({ eq: e, v, base, vat: base * VAT_RATE });
      finish(fmtPlainEq(base) + '+13%', v);   // reads as "2,160 + 13% =" (same maths)
      render();
    } catch (err) { fail(err); }
  }
  const fmtPlainEq = (n) => plain(n)?.replace('-', '−') ?? String(n);

  /* ---------------- Tape ---------------- */
  function print(entry) {
    state.tape.unshift({ ...entry, t: Date.now() });
    state.tape = state.tape.slice(0, 60);
    store.set('hisab.tape', state.tape);
    renderTape(true);
  }

  function seedExamples() {
    const ex = [
      { eq: '(2500+1800)÷4', note: 'Dinner split four ways' },
      { eq: '125000+38500−12%', note: 'Less 12% discount' },
      { eq: '12×180', vat: true, note: '12 plates of momo' },
    ];
    return ex.map((x, i) => {
      const base = evaluate(x.eq);
      const row = x.vat ? { eq: x.eq, base, vat: base * VAT_RATE, v: base * (1 + VAT_RATE) } : { eq: x.eq, v: base };
      return { ...row, example: x.note, t: Date.now() - (i + 1) * 60000 };
    }).reverse();
  }

  const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function renderTape(newest) {
    const rows = $('rows');
    $('empty').hidden = state.tape.length > 0;
    rows.innerHTML = state.tape.map((r, i) => {
      const meta = r.example ? `<span class="tag">Example</span>${esc(r.example)}` : toDigits(timeFmt.format(r.t));
      const vat = r.vat != null
        ? `<div class="line"><span>Taxable</span><b>${fmtNumber(r.base)}</b></div>
           <div class="line"><span>VAT 13%</span><b>${fmtNumber(r.vat)}</b></div>` : '';
      return `<li class="row${newest && i === 0 ? ' fresh' : ''}" tabindex="0" data-i="${i}" aria-label="Reuse ${esc(fmtNumber(r.v))}">
        <div class="row-top"><span class="row-eq">${esc(fmtExpr(r.eq))}</span><span class="row-meta">${meta}</span></div>
        ${vat}
        <div class="total"><span>${r.vat != null ? 'Total' : '='}</span><b>${fmtNumber(r.v)}</b></div>
      </li>`;
    }).join('');
    if (newest) rows.scrollTop = 0;
  }

  function reuse(i) {
    const r = state.tape[i];
    if (!r) return;
    const s = plain(r.v);
    if (s === null) return;
    const num = s.replace('-', '−');
    const l = last();
    if (state.done || state.expr === '' || !/[\d.)%]/.test(l)) {
      if (state.done) state.expr = '';
      const wrap = num.startsWith('−') && state.expr !== '' && l !== '(';
      state.expr += wrap ? '(' + num + ')' : num;
    } else state.expr = num;
    state.done = false;
    state.error = null;
    render();
  }

  /* ---------------- Render ---------------- */
  function render() {
    const exprEl = $('expr'), resEl = $('result'), wordsEl = $('words');
    resEl.className = 'lcd-result';
    let value = null;

    if (state.done) {
      exprEl.textContent = fmtExpr(state.lastEq) + ' =';
      value = state.shown;
      resEl.textContent = fmtNumber(value);
    } else {
      exprEl.textContent = state.expr ? fmtExpr(state.expr) : ' ';
      const e = tidy(state.expr);
      try { value = e ? evaluate(e) : 0; } catch (err) { value = null; }
      if (state.error) { resEl.textContent = state.error; resEl.classList.add('err'); value = null; }
      else if (value === null || !isFinite(value)) { resEl.textContent = '…'; resEl.classList.add('preview'); value = null; }
      else {
        resEl.textContent = fmtNumber(value);
        const isPlainNumber = /^−?\d*\.?\d*$/.test(state.expr);
        if (!isPlainNumber) resEl.classList.add('preview');
      }
      // while typing a decimal like "1.50", show it as typed instead of "1.5"
      if (!state.error && /^−?\d*\.\d*$/.test(state.expr)) {
        resEl.textContent = (state.expr[0] === '−' ? '−' : '') + toDigits(groupNumStr(state.expr.replace('−', '')));
      }
    }
    exprEl.scrollLeft = exprEl.scrollWidth;
    resEl.scrollLeft = resEl.scrollWidth;
    wordsEl.textContent = value === null ? ' ' : words(value);
  }

  function relabel() {
    document.querySelectorAll('.key[data-k]').forEach((b) => {
      if (/^[0-9]$/.test(b.dataset.k)) b.textContent = toDigits(b.dataset.k);
    });
    $('digLatin').setAttribute('aria-pressed', String(!state.deva));
    $('digDeva').setAttribute('aria-pressed', String(state.deva));
    $('grpLakh').setAttribute('aria-pressed', String(state.lakh));
    $('grpIntl').setAttribute('aria-pressed', String(!state.lakh));
  }
  function setMode(key, val) {
    state[key] = val;
    store.set('hisab.' + key, val);
    relabel(); render(); renderTape(false);
  }

  /* ---------------- Wiring ---------------- */
  $('keys').addEventListener('click', (e) => {
    const b = e.target.closest('.key');
    if (b) press(b.dataset.k);
  });
  $('digLatin').addEventListener('click', () => setMode('deva', false));
  $('digDeva').addEventListener('click', () => setMode('deva', true));
  $('grpLakh').addEventListener('click', () => setMode('lakh', true));
  $('grpIntl').addEventListener('click', () => setMode('lakh', false));

  $('rows').addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r) reuse(+r.dataset.i); });
  $('rows').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const r = e.target.closest('.row');
    if (r) { e.preventDefault(); e.stopPropagation(); reuse(+r.dataset.i); }
  });

  let armTimer;
  $('clear').addEventListener('click', (e) => {
    const b = e.currentTarget;
    if (!b.classList.contains('armed')) {
      b.classList.add('armed'); b.textContent = 'Tap again to clear';
      clearTimeout(armTimer);
      armTimer = setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Clear tape'; }, 3000);
      return;
    }
    clearTimeout(armTimer);
    b.classList.remove('armed'); b.textContent = 'Clear tape';
    state.tape = []; store.set('hisab.tape', []); renderTape(false);
  });

  $('lcd').addEventListener('click', () => {
    const text = $('result').textContent;
    const toast = $('toast');
    const show = (msg) => { toast.textContent = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1100); };
    try {
      navigator.clipboard.writeText(text).then(() => show('Copied'), () => show('Copy blocked'));
    } catch (err) { show('Copy blocked'); }
  });

  const KEYMAP = { '*': '×', 'x': '×', '/': '÷', '-': '−', '+': '+', 'Enter': '=', '=': '=', 'Backspace': 'back',
    'Escape': 'AC', 'Delete': 'AC', '(': '(', ')': ')', '%': '%', '.': '.', ',': '.', 'v': 'vat', 'V': 'vat' };
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('.row') && (e.key === 'Enter' || e.key === ' ')) return;
    let k = /^[0-9]$/.test(e.key) ? e.key : KEYMAP[e.key];
    if (!k) { const d = DEVA.indexOf(e.key); if (d >= 0) k = String(d); }
    if (!k) return;
    e.preventDefault();
    press(k);
    const btn = document.querySelector(`.key[data-k="${CSS.escape(k)}"]`);
    if (btn) { btn.classList.add('down'); setTimeout(() => btn.classList.remove('down'), 110); }
  });

  if (!Array.isArray(state.tape)) { state.tape = seedExamples(); }
  relabel();
  render();
  renderTape(false);

})();

// p5.js sketch to draw S–N curves using Basquin: Sa = Sf' * N^{-b}
// Optional mean-stress corrections: Goodman, Gerber, Soderberg.

(function () {
  const holder = document.getElementById('canvas-holder');
  const curveList = document.getElementById('curveList');

  const sfInput = document.getElementById('sfInput');
  const bInput = document.getElementById('bInput');
  const nminInput = document.getElementById('nminInput');
  const nmaxInput = document.getElementById('nmaxInput');
  const meanModel = document.getElementById('meanModel');
  const smInput = document.getElementById('smInput');
  const suInput = document.getElementById('suInput');
  const syInput = document.getElementById('syInput');
  const addBtn = document.getElementById('addCurveBtn');
  const clearBtn = document.getElementById('clearCurvesBtn');
  const logx = document.getElementById('logx');
  const logy = document.getElementById('logy');

  const PADDING = { l: 70, r: 20, t: 20, b: 50 };
  let curves = [];
  let p5Instance;

  function goodmanFactor(sm, Su) {
    // Goodman: reduce allowable alternating stress by (1 - sm/Su)
    if (!Su) return 1;
    return Math.max(0, 1 - sm / Number(Su));
  }
  function gerberFactor(sm, Su) {
    if (!Su) return 1;
    const r = sm / Number(Su);
    return Math.max(0, 1 - r * r);
  }
  function soderbergFactor(sm, Sy) {
    if (!Sy) return 1;
    return Math.max(0, 1 - sm / Number(Sy));
  }

  function correctedSa(Sa, model, sm, Su, Sy) {
    let f = 1;
    if (model === 'goodman') f = goodmanFactor(sm, Su);
    else if (model === 'gerber') f = gerberFactor(sm, Su);
    else if (model === 'soderberg') f = soderbergFactor(sm, Sy);
    return Sa * f; // simple multiplicative reduction
  }

  function addCurve() {
    const Sf = Math.max(1, Number(sfInput.value || 1000));
    const b = Math.max(0.0001, Number(bInput.value || 0.1)); // Basquin exponent (positive in UI)
    const Nmin = Math.max(1, Number(nminInput.value || 1e3));
    const Nmax = Math.max(Nmin + 1, Number(nmaxInput.value || 1e6));
    const model = meanModel.value;
    const sm = Number(smInput.value || 0);
    const Su = Number(suInput.value || 600);
    const Sy = Number(syInput.value || 350);

    const color = undefined; // let p5 pick stroke default per cycle

    const curve = { Sf, b, Nmin, Nmax, model, sm, Su, Sy, color };
    curves.push(curve);
    renderList();
  }

  function clearCurves() {
    curves = [];
    renderList();
  }

  function renderList() {
    curveList.innerHTML = '';
    curves.forEach((c, i) => {
      const li = document.createElement('li');
      li.textContent = `#${i + 1}: Sf'=${c.Sf} MPa, b=${c.b}, N=[${c.Nmin},${
        c.Nmax
      }], model=${c.model}, sm=${c.sm}`;
      curveList.appendChild(li);
    });
  }

  function mapX(p, N, xmin, xmax) {
    if (logx.checked) {
      const lx = Math.log10(N),
        lmin = Math.log10(xmin),
        lmax = Math.log10(xmax);
      return (
        PADDING.l +
        ((lx - lmin) / (lmax - lmin)) * (p.width - PADDING.l - PADDING.r)
      );
    }
    return (
      PADDING.l +
      ((N - xmin) / (xmax - xmin)) * (p.width - PADDING.l - PADDING.r)
    );
  }
  function mapY(p, S, ymin, ymax) {
    if (logy.checked) {
      const ly = Math.log10(S),
        lmin = Math.log10(ymin),
        lmax = Math.log10(ymax);
      return (
        p.height -
        PADDING.b -
        ((ly - lmin) / (lmax - lmin)) * (p.height - PADDING.t - PADDING.b)
      );
    }
    return (
      p.height -
      PADDING.b -
      ((S - ymin) / (ymax - ymin)) * (p.height - PADDING.t - PADDING.b)
    );
  }

  function computeExtents() {
    // default extents
    let xmin = 1e3,
      xmax = 1e8,
      ymin = 10,
      ymax = 2e3;
    if (curves.length) {
      xmin = Math.min(...curves.map((c) => c.Nmin));
      xmax = Math.max(...curves.map((c) => c.Nmax));
      // rough y extents from first/last points of each curve
      const ys = [];
      curves.forEach((c) => {
        const Sa1 = c.Sf * Math.pow(c.Nmin, -c.b);
        const Sa2 = c.Sf * Math.pow(c.Nmax, -c.b);
        ys.push(correctedSa(Sa1, c.model, c.sm, c.Su, c.Sy));
        ys.push(correctedSa(Sa2, c.model, c.sm, c.Su, c.Sy));
      });
      ymin = Math.max(1, Math.min(...ys) * 0.5);
      ymax = Math.max(...ys) * 2;
    }
    return { xmin, xmax, ymin, ymax };
  }

  function drawAxes(p, ext) {
    p.push();
    p.stroke(120);
    p.fill(180);
    p.strokeWeight(1);
    // axes
    p.line(PADDING.l, PADDING.t, PADDING.l, p.height - PADDING.b);
    p.line(
      PADDING.l,
      p.height - PADDING.b,
      p.width - PADDING.r,
      p.height - PADDING.b
    );

    p.textSize(12);
    p.noStroke();
    p.textAlign(p.RIGHT, p.CENTER);
    p.text('Stress amplitude S_a (MPa)', PADDING.l - 8, PADDING.t + 10);
    p.textAlign(p.CENTER, p.BOTTOM);
    p.text(
      'Cycles to failure N',
      PADDING.l + (p.width - PADDING.l - PADDING.r) / 2,
      p.height - 6
    );

    // ticks
    const xticks = logx.checked ? [1e3, 1e4, 1e5, 1e6, 1e7, 1e8] : 8;
    if (Array.isArray(xticks)) {
      xticks.forEach((v) => {
        const x = mapX(p, v, ext.xmin, ext.xmax);
        p.stroke(60);
        p.line(x, p.height - PADDING.b, x, p.height - PADDING.b + 5);
        p.noStroke();
        p.fill(150);
        p.textAlign(p.CENTER, p.TOP);
        p.text(v.toExponential(0), x, p.height - PADDING.b + 6);
      });
    } else {
      for (let i = 0; i <= xticks; i++) {
        const v = ext.xmin + ((ext.xmax - ext.xmin) * i) / xticks;
        const x = mapX(p, v, ext.xmin, ext.xmax);
        p.stroke(60);
        p.line(x, p.height - PADDING.b, x, p.height - PADDING.b + 5);
      }
    }

    const yticks = logy.checked ? [10, 20, 50, 100, 200, 500, 1000, 2000] : 8;
    if (Array.isArray(yticks)) {
      yticks.forEach((v) => {
        const y = mapY(p, v, ext.ymin, ext.ymax);
        p.stroke(60);
        p.line(PADDING.l - 5, y, PADDING.l, y);
        p.noStroke();
        p.fill(150);
        p.textAlign(p.RIGHT, p.CENTER);
        p.text(v.toString(), PADDING.l - 8, y);
      });
    } else {
      for (let i = 0; i <= yticks; i++) {
        const v = ext.ymin + ((ext.ymax - ext.ymin) * i) / yticks;
        const y = mapY(p, v, ext.ymin, ext.ymax);
        p.stroke(60);
        p.line(PADDING.l - 5, y, PADDING.l, y);
      }
    }

    p.pop();
  }

  function drawCurves(p, ext) {
    curves.forEach((c, idx) => {
      p.push();
      p.noFill();
      p.strokeWeight(2);
      // Assign a hue-like rotation using idx; p5 default colorMode is RGB, but we can mod color
      const col = 100 + ((idx * 80) % 155); // grayscale spread
      p.stroke(col);

      p.beginShape();
      const steps = 300; // smooth enough
      for (let i = 0; i <= steps; i++) {
        const N = c.Nmin * Math.pow(c.Nmax / c.Nmin, i / steps); // log sweep regardless of axis mode
        let Sa = c.Sf * Math.pow(N, -c.b);
        Sa = correctedSa(Sa, c.model, c.sm, c.Su, c.Sy);
        const x = mapX(p, N, ext.xmin, ext.xmax);
        const y = mapY(p, Sa, ext.ymin, ext.ymax);
        p.vertex(x, y);
      }
      p.endShape();
      p.pop();
    });
  }

  const sketch = (p) => {
    p.setup = function () {
      const c = p.createCanvas(holder.clientWidth, holder.clientHeight);
      c.parent('canvas-holder');
      p.pixelDensity(1);
      p.noLoop();
    };
    p.windowResized = function () {
      p.resizeCanvas(holder.clientWidth, holder.clientHeight);
      p.redraw();
    };
    p.draw = function () {
      p.background(14, 15, 18);
      const ext = computeExtents();
      drawAxes(p, ext);
      drawCurves(p, ext);
    };
  };

  p5Instance = new p5(sketch);

  addBtn.addEventListener('click', () => {
    addCurve();
    p5Instance.redraw();
  });
  clearBtn.addEventListener('click', () => {
    clearCurves();
    p5Instance.redraw();
  });
  logx.addEventListener('change', () => p5Instance.redraw());
  logy.addEventListener('change', () => p5Instance.redraw());

  // Expose limited context for the chatbot
  window.SNPlot = {
    exportContext() {
      return {
        curves: curves,
        settings: { logx: logx.checked, logy: logy.checked },
      };
    },
  };
})();

(function () {
  const chatWindow = document.getElementById('chatWindow');
  const chatBox = document.getElementById('chatBox');
  const sendBtn = document.getElementById('sendBtn');

  function appendMsg(text, cls) {
    const div = document.createElement('div');
    div.className = `chat-msg ${cls}`;
    div.textContent = text;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  async function send() {
    const msg = chatBox.value.trim();
    if (!msg) return;
    appendMsg(msg, 'me');
    chatBox.value = '';

    const payload = {
      message: msg,
      context: window.getSNContext ? window.getSNContext() : {},
    };
    try {
      const resp = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (data.reply) {
        appendMsg(data.reply, 'bot');
      } else if (data.error) {
        appendMsg('Error: ' + data.error, 'bot');
      } else {
        appendMsg('(No response)', 'bot');
      }
    } catch (e) {
      appendMsg('Network error: ' + e.message, 'bot');
    }
  }

  sendBtn.addEventListener('click', send);
  chatBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });
})();
// ---- Scenario Calculator (based on slide) ----
(function () {
  const el = (id) => document.getElementById(id);
  const scSm = el('scSm'),
    scSu = el('scSu'),
    scSy = el('scSy'),
    scNf = el('scNf'),
    scDia = el('scDia'),
    scFinish = el('scFinish'),
    scModel = el('scModel'),
    scOut = el('scOut'),
    scBtn = el('scCompute');

  if (!scBtn) return; // panel may not exist

  // Simple Marin surface-factor (ka) approximations for steels (quick visual aid, not a code allowables substitute)
  function surfaceFactorKa(finish) {
    switch (finish) {
      case 'polished':
        return 1.0;
      case 'ground':
        return 0.9;
      case 'machined':
        return 0.85;
      case 'asForged':
        return 0.8;
      default:
        return 1.0;
    }
  }
  // Very light size factor kb (for bending) heuristic; keep near 1.0 for small dia
  function sizeFactorKb(d_mm) {
    const d = Math.max(1, Number(d_mm || 10));
    // crude fit; for d<=10 mm ~1.0
    return d <= 10 ? 1.0 : Math.max(0.85, Math.pow(d / 10, -0.05));
  }

  function meanFactor(model, sm, Su, Sy) {
    if (model === 'goodman') {
      return Math.max(0, 1 - sm / Number(Su || 1));
    } else if (model === 'gerber') {
      const r = sm / Number(Su || 1);
      return Math.max(0, 1 - r * r);
    } else if (model === 'soderberg') {
      return Math.max(0, 1 - sm / Number(Sy || 1));
    }
    return 1;
  }

  // Compute at target life Nf:
  //   Sa0 = Sf' * Nf^{-b}   (Basquin)
  //   Sa  = Sa0 * meanFactor(...)
  //   Smax = Sm + Sa;  Smin = Sm - Sa;  R = Smin / Smax
  function computeScenario() {
    if (window.SNPlot == null) return null;
    // Use the *latest* Basquin parameters from the Add Curve panel
    const Sf = Number(document.getElementById('sfInput').value || 1000);
    const b = Number(document.getElementById('bInput').value || 0.1);

    const Sm = Number(scSm.value || 0);
    const Su = Number(scSu.value || 0);
    const Sy = Number(scSy.value || 0);
    const Nf = Math.max(1, Number(scNf.value || 1e5));
    const dia = Number(scDia.value || 10);
    const fin = scFinish.value;
    const model = scModel.value;

    // optional finish/size factors (informative only)
    const ka = surfaceFactorKa(fin);
    const kb = sizeFactorKb(dia);

    // Basquin alternating stress for target life (unadjusted)
    let Sa0 = Sf * Math.pow(Nf, -b);

    // Apply mean-stress reduction
    const mf = meanFactor(model, Sm, Su, Sy);
    let Sa = Sa0 * mf;

    // Apply finish/size as a gentle modifier (note: strictly these affect endurance limit, not Sf'/b;
    // shown here as an illustrative factor)
    const adj = ka * kb;
    Sa = Sa * adj;

    const Smax = Sm + Sa;
    const Smin = Sm - Sa;
    const R = Smax !== 0 ? Smin / Smax : NaN;

    return {
      Sa0,
      Sa,
      Smax,
      Smin,
      R,
      inputs: { Sm, Su, Sy, Nf, dia, fin, model, Sf, b, ka, kb, mf, adj },
    };
  }

  scBtn.addEventListener('click', () => {
    const res = computeScenario();
    if (!res) {
      scOut.textContent = 'No context available.';
      return;
    }

    const fmt = (v) =>
      Number.isFinite(v)
        ? Math.abs(v) >= 100
          ? v.toFixed(0)
          : v.toFixed(2)
        : '—';
    scOut.innerHTML = `
      <strong>Results @ Nf=${res.inputs.Nf.toLocaleString()} cycles</strong><br/>
      Basquin Sa (no mean): <code>${fmt(res.Sa0)} MPa</code><br/>
      Mean-stress & finish/size adjusted Sa: <code>${fmt(
        res.Sa
      )} MPa</code><br/>
      Smax: <code>${fmt(res.Smax)} MPa</code> &nbsp; Smin: <code>${fmt(
      res.Smin
    )} MPa</code><br/>
      Stress ratio R = Smin/Smax: <code>${fmt(res.R)}</code><br/>
      <span style="color:#c6c1c7">[Model: ${res.inputs.model}, ka=${
      res.inputs.ka
    }, kb=${res.inputs.kb}]</span>
    `;

    // Store scenario in context so the chatbot can explain it
    window.SNPlot.__scenario = {
      Sa0: res.Sa0,
      Sa: res.Sa,
      Smax: res.Smax,
      Smin: res.Smin,
      R: res.R,
      inputs: res.inputs,
    };
  });

  // extend exportContext to include scenario
  if (window.SNPlot) {
    const oldExport = window.SNPlot.exportContext;
    window.SNPlot.exportContext = function () {
      const base = oldExport ? oldExport() : {};
      return Object.assign({}, base, {
        scenario: window.SNPlot.__scenario || null,
      });
    };
  }
})();

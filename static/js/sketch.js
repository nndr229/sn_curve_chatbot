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

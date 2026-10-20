/* Apuração — utilitários compartilhados pelas páginas 2022 e 2026.
   Sem dependências: formatação em pt-BR, séries de totalização, gráficos em SVG e dicas. */
(function () {
  "use strict";

  const A = (window.Apuracao = {});
  const SVG = "http://www.w3.org/2000/svg";

  /* ---------- Formatação ---------- */

  const formato = (min, max) =>
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });
  const f0 = formato(0, 0);
  const f1 = formato(1, 1);
  const f2 = formato(2, 2);
  const dois = (n) => String(n).padStart(2, "0");

  A.fmt = {
    inteiro: (v) => f0.format(Math.round(v)),
    pct(v, casas = 2) {
      return (casas === 0 ? f0 : casas === 1 ? f1 : f2).format(v) + "%";
    },
    compacto(v) {
      const a = Math.abs(v);
      if (a >= 1e6) return f1.format(a / 1e6).replace(/,0$/, "") + " mi";
      if (a >= 1e3) return f0.format(a / 1e3) + " mil";
      return f0.format(a);
    },
    /* "12,3 mi de eleitores", "916 mil eleitores" */
    quantos(v, coisa) {
      const c = A.fmt.compacto(v);
      return c + (c.endsWith(" mi") ? " de " : " ") + coisa;
    },
    sinal: (v) => (v > 0 ? "+" : v < 0 ? "−" : ""),
    pp(v) {
      const s = v > 0.05 ? "+" : v < -0.05 ? "−" : "";
      return s + f1.format(Math.abs(v)).replace("-", "") + " p.p.";
    },
  };

  /* Tempo em segundos contados a partir das 17h (Brasília) do dia da eleição. */
  A.tempo = {
    partes(seg) {
      const dia = 86400;
      const total = (((17 * 3600 + Math.round(seg)) % dia) + dia) % dia;
      return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
    },
    relogio(seg) {
      const [h, m, s] = A.tempo.partes(seg);
      return `${dois(h)}:${dois(m)}:${dois(s)}`;
    },
    curta(seg) {
      const [h, m] = A.tempo.partes(seg);
      return `${h}h${dois(m)}`;
    },
    marca(seg) {
      const [h, m] = A.tempo.partes(seg);
      return m === 0 ? `${h}h` : `${h}h${dois(m)}`;
    },
    passouMeiaNoite: (seg) => 17 * 3600 + seg >= 86400,
    duracao(seg) {
      seg = Math.round(Math.abs(seg));
      const h = Math.floor(seg / 3600);
      const m = Math.floor((seg % 3600) / 60);
      const s = seg % 60;
      if (h) return `${h}h${dois(m)}`;
      if (m) return s ? `${m} min ${s} s` : `${m} min`;
      return `${s} s`;
    },
  };

  /* ---------- Séries de totalização ---------- */

  /* Último índice i com arr[i] <= v (arr crescente); -1 se v vem antes do primeiro. */
  A.ultimoAte = function (arr, v) {
    let lo = 0;
    let hi = arr.length - 1;
    if (hi < 0 || v < arr[0]) return -1;
    while (lo < hi) {
      const meio = (lo + hi + 1) >> 1;
      if (arr[meio] <= v) lo = meio;
      else hi = meio - 1;
    }
    return lo;
  };

  /* Valor de ys em x por interpolação linear; null antes do primeiro ponto. */
  A.interpolar = function (xs, ys, x) {
    const i = A.ultimoAte(xs, x);
    if (i < 0) return null;
    if (i >= xs.length - 1 || xs[i + 1] === xs[i]) return ys[i];
    const f = (x - xs[i]) / (xs[i + 1] - xs[i]);
    return ys[i] + (ys[i + 1] - ys[i]) * f;
  };

  /* Série com arrays paralelos de valores acumulados. a e b são os dois candidatos. */
  class Serie {
    constructor(totais) {
      this.totais = totais; // { secoes, aptos }
      this.t = [];
      this.sec = [];
      this.aptos = [];
      this.a = [];
      this.b = [];
      this.outros = [];
      this.pst = [];
      this.pa = [];
      this.pb = [];
      this.margem = [];
    }

    get n() {
      return this.t.length;
    }

    adicionar(p) {
      const validos = p.a + p.b;
      this.t.push(p.t);
      this.sec.push(p.sec);
      this.aptos.push(p.aptos);
      this.a.push(p.a);
      this.b.push(p.b);
      this.outros.push(p.outros || 0);
      this.pst.push((p.sec / this.totais.secoes) * 100);
      const pa = validos ? (p.a / validos) * 100 : 50;
      this.pa.push(pa);
      this.pb.push(100 - pa);
      this.margem.push(p.a - p.b);
    }

    ponto(i) {
      return {
        i,
        t: this.t[i],
        sec: this.sec[i],
        aptos: this.aptos[i],
        a: this.a[i],
        b: this.b[i],
        pst: this.pst[i],
        pa: this.pa[i],
        pb: this.pb[i],
        margem: this.margem[i],
        outros: this.outros[i],
      };
    }

    /* Trocas de liderança: índices onde o líder muda (ignora empates exatos). */
    trocas() {
      const lista = [];
      let anterior = 0;
      for (let i = 0; i < this.n; i++) {
        const s = Math.sign(this.margem[i]);
        if (s !== 0 && s !== anterior) {
          if (anterior !== 0) lista.push(i);
          anterior = s;
        }
      }
      return lista;
    }

    /* Estimativa do que falta: eleitores aptos não apurados e votos válidos esperados. */
    restante(i) {
      const aptosFaltam = Math.max(0, this.totais.aptos - this.aptos[i]);
      const taxaValidos = this.aptos[i] ? (this.a[i] + this.b[i]) / this.aptos[i] : 0.75;
      const validosFaltam = aptosFaltam * taxaValidos;
      const vantagem = Math.abs(this.margem[i]);
      const definido = vantagem > aptosFaltam;
      const precisa = validosFaltam > 0 ? (validosFaltam + vantagem) / (2 * validosFaltam) : Infinity;
      return { aptosFaltam, validosFaltam, definido, precisa: precisa * 100 };
    }
  }
  A.Serie = Serie;

  /* Monta a série de 2022 a partir dos incrementos do arquivo gerado. */
  A.serie2022 = function (dados) {
    const inc = dados.incrementos;
    const s = new Serie(dados.totais);
    let sec = 0, aptos = 0, a = 0, b = 0, outros = 0;
    for (let i = 0; i < inc.t.length; i++) {
      sec += inc.sec[i];
      aptos += inc.aptos[i];
      a += inc.lula[i];
      b += inc.bolsonaro[i];
      outros += inc.brancos[i] + inc.nulos[i];
      s.adicionar({ t: inc.t[i], sec, aptos, a, b, outros });
    }
    return s;
  };

  /* ---------- SVG ---------- */

  A.svg = function (tag, attrs, pai) {
    const el = document.createElementNS(SVG, tag);
    if (attrs) A.attrs(el, attrs);
    if (pai) pai.appendChild(el);
    return el;
  };

  A.attrs = function (el, attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) el.removeAttribute(k);
      else el.setAttribute(k, v);
    }
    return el;
  };

  A.html = function (tag, classe, pai, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    if (pai) pai.appendChild(el);
    return el;
  };

  const r1 = (v) => Math.round(v * 10) / 10;

  function passoBonito(bruto) {
    const exp = Math.floor(Math.log10(bruto));
    const f = bruto / 10 ** exp;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * 10 ** exp;
  }

  A.ticksBonitos = function (min, max, alvo = 5) {
    const passo = passoBonito((max - min) / alvo);
    const ticks = [];
    for (let v = Math.ceil(min / passo) * passo; v <= max + passo * 1e-9; v += passo) {
      ticks.push(Math.round(v / passo) * passo);
    }
    return ticks;
  };

  A.dominioBonito = function (min, max, alvo = 5) {
    const passo = passoBonito((max - min || 1) / alvo);
    return [Math.floor(min / passo) * passo, Math.ceil(max / passo) * passo];
  };

  let contador = 0;

  /* Área de plotagem em SVG: escalas lineares, grade, eixos, cursor e alvo de ponteiro.
     O desenho dos dados fica com a página, em cfg.aoDesenhar(plot). */
  class Plot {
    constructor(raiz, cfg) {
      this.id = "p" + ++contador;
      this.raiz = raiz;
      this.cfg = cfg;
      this.svg = A.svg("svg", { role: "img", "aria-label": cfg.rotulo || "" }, raiz);
      this.defs = A.svg("defs", null, this.svg);
      this.g = {};
      for (const nome of ["grade", "fundo", "sombra", "area", "linha", "anota", "marca", "cursor"]) {
        this.g[nome] = A.svg("g", { class: "g-" + nome }, this.svg);
      }
      this.g.cursor.style.pointerEvents = "none";
      this.alvo = A.svg("rect", { fill: "transparent" }, this.svg);
      this.alvo.style.cursor = "crosshair";
      this.g.topo = A.svg("g", { class: "g-topo" }, this.svg);
      this.recorte = A.svg("clipPath", { id: this.id + "-area" }, this.defs);
      this.recorteRet = A.svg("rect", null, this.recorte);

      const mover = (e) => {
        const p = this.posicao(e);
        if (cfg.aoPairar) cfg.aoPairar(this.invX(p.x), p.x, p.y, e);
      };
      this.alvo.addEventListener("pointermove", mover);
      this.alvo.addEventListener("pointerdown", mover);
      this.alvo.addEventListener("pointerleave", (e) => {
        if (e.pointerType === "mouse" && cfg.aoPairar) cfg.aoPairar(null);
      });

      this.observador = new ResizeObserver(() => this.medir());
      this.observador.observe(raiz);
      this.medir(true);
    }

    medir(forcar) {
      const w = Math.max(260, Math.round(this.raiz.clientWidth));
      if (!forcar && w === this.w) return;
      this.w = w;
      this.h = this.cfg.altura(w);
      this.m = typeof this.cfg.margem === "function" ? this.cfg.margem(w) : this.cfg.margem;
      A.attrs(this.svg, { viewBox: `0 0 ${w} ${this.h}`, width: w, height: this.h });
      this.x0 = this.m.l;
      this.x1 = w - this.m.r;
      this.y0 = this.m.t;
      this.y1 = this.h - this.m.b;
      const area = { x: this.x0, y: this.y0, width: this.x1 - this.x0, height: this.y1 - this.y0 };
      A.attrs(this.alvo, area);
      A.attrs(this.recorteRet, { x: this.x0 - 2, y: this.y0 - 6, width: area.width + 4, height: area.height + 12 });
      this.desenhar();
    }

    get recorteUrl() {
      return `url(#${this.id}-area)`;
    }

    x(v) {
      const [a, b] = this.cfg.x.dominio;
      return this.x0 + ((v - a) / (b - a)) * (this.x1 - this.x0);
    }

    y(v) {
      const [a, b] = this.cfg.y.dominio;
      return this.y1 - ((v - a) / (b - a)) * (this.y1 - this.y0);
    }

    invX(px) {
      const [a, b] = this.cfg.x.dominio;
      return a + ((px - this.x0) / (this.x1 - this.x0)) * (b - a);
    }

    posicao(e) {
      const r = this.svg.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) * this.w) / r.width,
        y: ((e.clientY - r.top) * this.h) / r.height,
      };
    }

    desenhar() {
      this.eixos();
      if (this.cfg.aoDesenhar) this.cfg.aoDesenhar(this);
    }

    eixos() {
      const g = this.g.grade;
      g.textContent = "";
      const cx = this.cfg.x;
      const cy = this.cfg.y;
      const yt = cy.ticks ? cy.ticks(cy.dominio, this) : A.ticksBonitos(cy.dominio[0], cy.dominio[1], 4);
      for (const v of yt) {
        const y = Math.round(this.y(v)) + 0.5;
        A.svg("line", { class: "linha-grade", x1: this.x0, x2: this.x1, y1: y, y2: y }, g);
        const t = A.svg("text", { class: "rotulo-eixo", x: this.x0 - 8, y, "text-anchor": "end", dy: "0.32em" }, g);
        t.textContent = cy.formato ? cy.formato(v) : String(v);
      }
      const xt = cx.ticks ? cx.ticks(cx.dominio, this) : A.ticksBonitos(cx.dominio[0], cx.dominio[1], 5);
      const base = Math.round(this.y1) + 0.5;
      A.svg("line", { class: "linha-base", x1: this.x0, x2: this.x1, y1: base, y2: base }, g);
      xt.forEach((v, k) => {
        const x = Math.round(this.x(v)) + 0.5;
        A.svg("line", { class: "linha-base", x1: x, x2: x, y1: base, y2: base + 5 }, g);
        const ancora = k === 0 && x - this.x0 < 18 ? "start" : k === xt.length - 1 && this.x1 - x < 18 ? "end" : "middle";
        const t = A.svg("text", { class: "rotulo-eixo", x, y: base + 18, "text-anchor": ancora }, g);
        t.textContent = cx.formato ? cx.formato(v) : String(v);
      });
    }

    /* Cursor vertical com pontos sobre as séries: pontos = [{ y, classe }]. */
    cursor(xv, pontos) {
      const g = this.g.cursor;
      g.textContent = "";
      if (xv === null || xv === undefined) return;
      const x = Math.round(this.x(xv)) + 0.5;
      if (x < this.x0 - 1 || x > this.x1 + 1) return;
      A.svg("line", { class: "cursor", x1: x, x2: x, y1: this.y0, y2: this.y1 }, g);
      for (const p of pontos || []) {
        if (p.y === null || p.y === undefined || isNaN(p.y)) continue;
        A.svg("circle", { class: "cursor-ponto " + p.classe, cx: x, cy: this.y(p.y), r: 4.5 }, g);
      }
    }

    destruir() {
      this.observador.disconnect();
      this.svg.remove();
    }
  }
  A.Plot = Plot;

  /* Caminho de linha de inicio a fim, pulando pontos que caem no mesmo pixel. */
  A.caminho = function (plot, xs, ys, fim, inicio = 0) {
    let d = "";
    let ux = -Infinity;
    let uy = 0;
    let aberto = false;
    for (let i = inicio; i <= fim; i++) {
      const v = ys[i];
      if (v === null || v === undefined || Number.isNaN(v)) {
        aberto = false;
        continue;
      }
      const px = plot.x(xs[i]);
      const py = plot.y(v);
      if (!aberto) {
        d += "M" + r1(px) + "," + r1(py);
        aberto = true;
      } else if (px - ux >= 0.6 || Math.abs(py - uy) >= 0.6 || i === fim) {
        d += "L" + r1(px) + "," + r1(py);
      } else {
        continue;
      }
      ux = px;
      uy = py;
    }
    return d;
  };

  /* Área entre a linha e um valor de base (y em unidades de dado). */
  A.caminhoArea = function (plot, xs, ys, fim, base, inicio = 0) {
    const linha = A.caminho(plot, xs, ys, fim, inicio);
    if (!linha) return "";
    let primeiro = inicio;
    while (primeiro <= fim && (ys[primeiro] === null || ys[primeiro] === undefined)) primeiro++;
    const yb = r1(plot.y(base));
    return `${linha}L${r1(plot.x(xs[fim]))},${yb}L${r1(plot.x(xs[primeiro]))},${yb}Z`;
  };

  /* Rótulo do valor na ponta de uma linha; vira para a esquerda se não couber à direita. */
  A.rotuloPonta = function (g, p, x, y, texto) {
    const largura = texto.length * 7.1;
    const cabe = x + 9 + largura <= p.w - 2;
    const t = A.svg("text", { class: "rotulo-dado", x: cabe ? x + 9 : x - 9, y, "text-anchor": cabe ? "start" : "end" }, g);
    t.textContent = texto;
    return t;
  };

  /* ---------- Dica (tooltip) ---------- */

  class Dica {
    constructor(raiz) {
      this.raiz = raiz;
      this.el = A.html("div", "dica", raiz);
      this.el.hidden = true;
      this.el.setAttribute("aria-hidden", "true");
    }

    /* conteudo: { titulo, linhas: [{ classe, valor, rotulo }], rodape: [texto] } */
    mostrar(px, py, conteudo) {
      const el = this.el;
      el.textContent = "";
      A.html("div", "dica-titulo", el, conteudo.titulo);
      for (const l of conteudo.linhas || []) {
        const linha = A.html("div", "dica-linha", el);
        if (l.classe) A.html("i", "chave " + l.classe, linha);
        A.html("strong", null, linha, l.valor);
        A.html("span", null, linha, l.rotulo);
      }
      if (conteudo.rodape && conteudo.rodape.length) {
        A.html("div", "dica-sep", el);
        for (const t of conteudo.rodape) A.html("div", "dica-linha", el).appendChild(document.createTextNode(t));
      }
      el.hidden = false;
      const larg = this.raiz.clientWidth;
      const alt = this.raiz.clientHeight;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let left = px + 16;
      if (left + w > larg - 4) left = px - w - 16;
      if (left < 4) left = Math.max(4, Math.min(larg - w - 4, px - w / 2));
      let top = py - h / 2;
      top = Math.max(4, Math.min(alt - h - 4, top));
      el.style.left = left + "px";
      el.style.top = top + "px";
    }

    esconder() {
      this.el.hidden = true;
    }
  }
  A.Dica = Dica;

  /* ---------- Acessibilidade ---------- */

  A.anunciar = function (texto) {
    const el = document.getElementById("anuncio");
    if (!el) return;
    el.textContent = "";
    window.setTimeout(() => {
      el.textContent = texto;
    }, 60);
  };

  /* Liga um grupo de rádios (segmentado) a uma função. */
  A.aoEscolher = function (nome, fn) {
    document.querySelectorAll(`input[name="${nome}"]`).forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) fn(input.value);
      });
    });
  };

  A.ticksTempo = function (dominio, plot) {
    const passo = plot.x1 - plot.x0 > 560 ? 1800 : 3600;
    const lista = [];
    for (let v = Math.ceil(dominio[0] / passo) * passo; v <= dominio[1]; v += passo) lista.push(v);
    return lista;
  };

  A.ticksPct = function (dominio, plot) {
    const passo = plot.x1 - plot.x0 > 560 ? 10 : 25;
    const lista = [];
    for (let v = dominio[0]; v <= dominio[1] + 1e-9; v += passo) lista.push(v);
    return lista;
  };
})();

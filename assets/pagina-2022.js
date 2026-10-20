/* A virada de 2022: reprodução animada da totalização do 2º turno, com os dados do TSE. */
(function () {
  "use strict";

  const A = window.Apuracao;
  const D = window.APURACAO_2022;
  const F = A.fmt;
  const T = A.tempo;
  const S = A.serie2022(D);
  const N = S.n;
  const ULTIMO = N - 1;

  const FIM_EIXO = 4 * 3600; // o eixo de horário vai das 17h às 21h
  const TAXA = FIM_EIXO / 75; // segundos de apuração por segundo real, em 1×
  const LENTO = 0.08; // câmera lenta durante a gangorra
  const SEGURAR = 3.6; // segundos de pausa em cada momento-chave, em 1×
  const iFimEixo = A.ultimoAte(S.t, FIM_EIXO);
  const trocas = S.trocas();
  const NOME = { a: "Lula", b: "Bolsonaro" };
  const PLAY = "M3 1.5v11l9-5.5z";
  const PAUSA = "M2.5 1.5h3.2v11H2.5zM8.3 1.5h3.2v11H8.3z";

  const $ = (id) => document.getElementById(id);
  const porId = Object.fromEntries(D.momentos.map((m) => [m.id, m]));
  const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const est = {
    tempo: S.t[ULTIMO], // a página abre com a noite inteira desenhada
    tocando: false,
    jaTocou: false,
    velocidade: 1,
    parar: true,
    eixo: "tempo",
    seguraAte: 0,
    legenda: null,
    hover: null,
    janelas: [],
  };

  /* ---------- Momentos-chave ---------- */

  function textoMomento(m) {
    const p = S.ponto(m.i);
    const pst = F.pct(p.pst);
    const pa = F.pct(p.pa);
    const pb = F.pct(p.pb);
    const vant = F.inteiro(Math.abs(p.margem));
    switch (m.id) {
      case "abertura":
        return {
          titulo: "Primeira parcial",
          texto: `Às ${T.curta(p.t)}, com ${F.inteiro(p.sec)} seções totalizadas (${pst}), Lula aparece com ${pa} dos votos válidos.`,
        };
      case "bolsonaro_assume":
        return {
          titulo: "Bolsonaro assume a liderança",
          texto: `Com ${pst} das seções apuradas, Bolsonaro passa à frente. Ele ficaria na liderança por ${T.duracao(porId.gangorra.t - p.t)}.`,
        };
      case "pico_bolsonaro":
        return {
          titulo: "A maior vantagem de Bolsonaro",
          texto: `${vant} votos a mais que Lula (${pb} a ${pa}), com ${pst} das seções apuradas.`,
        };
      case "metade":
        return {
          titulo: "Metade das seções",
          texto: `Com metade das seções apuradas, Bolsonaro ainda tem ${vant} votos de vantagem (${pb} a ${pa}).`,
        };
      case "gangorra": {
        const seguinte = trocas.find((i) => i > m.i);
        return {
          titulo: "A gangorra",
          texto: `Com ${pst} das seções, Lula passa à frente pela primeira vez e perde a liderança ${T.duracao(S.t[seguinte] - p.t)} depois. Em ${T.duracao(S.t[m.ate] - p.t)}, a liderança troca de mãos ${m.trocas} vezes.`,
        };
      }
      case "virada_definitiva":
        return {
          titulo: "A virada",
          texto: `Às ${T.relogio(p.t)}, com ${pst} das seções, Lula passa à frente por ${vant} votos e não perde mais a liderança.`,
        };
      case "matematica":
        return {
          titulo: "Matematicamente eleito",
          texto: `A vantagem de Lula, ${vant} votos, passa a superar todos os eleitores aptos das seções que faltam apurar (${F.inteiro(m.restantes)}). Já são ${pst} das seções.`,
        };
      case "final":
        return {
          titulo: "100% apurado",
          texto: `Lula termina com ${pa} (${F.inteiro(p.a)} votos) e Bolsonaro com ${pb} (${F.inteiro(p.b)}). Diferença de ${vant} votos; a liderança trocou de mãos ${m.trocas_total} vezes.`,
        };
      default:
        return { titulo: m.id, texto: "" };
    }
  }

  const momentos = D.momentos.map((m, k) => Object.assign({ num: k + 1 }, m, textoMomento(m)));

  /* ---------- Eixo e índices ---------- */

  const X = () => (est.eixo === "tempo" ? S.t : S.pst);
  const indice = () => A.ultimoAte(S.t, est.tempo);
  const fimDesenho = (i) => (i < 0 ? -1 : est.eixo === "tempo" ? Math.min(i, iFimEixo) : i);
  const xDoIndice = (i) => (est.eixo === "tempo" ? Math.min(S.t[i], FIM_EIXO) : S.pst[i]);
  const lider = (i) => (S.margem[i] > 0 ? "a" : S.margem[i] < 0 ? "b" : null);
  const emCameraLenta = (t) => t >= porId.gangorra.t - 5 && t < porId.virada_definitiva.t + 3;

  function configX() {
    return est.eixo === "tempo"
      ? { dominio: [0, FIM_EIXO], ticks: A.ticksTempo, formato: T.marca }
      : { dominio: [0, 100], ticks: A.ticksPct, formato: (v) => v + "%" };
  }

  /* Índice mais próximo de um valor do eixo, sem passar do que já foi apurado na reprodução. */
  function indiceEmX(xv) {
    const xs = X();
    const limite = fimDesenho(indice());
    let i = Math.max(0, A.ultimoAte(xs, xv));
    if (i < N - 1 && Math.abs(xs[i + 1] - xv) < Math.abs(xs[i] - xv)) i++;
    return Math.min(i, limite);
  }

  function desdeQuando(i) {
    let inicio = 0;
    for (const k of trocas) if (k <= i) inicio = k;
    return S.t[inicio];
  }

  /* ---------- Gráfico 1: a corrida ---------- */

  function desenharCorrida(p) {
    const i = indice();
    const fim = fimDesenho(i);
    const xs = X();
    const gf = p.g.fundo;
    const gl = p.g.linha;
    const gm = p.g.marca;
    gf.textContent = gl.textContent = gm.textContent = "";

    const y50 = Math.round(p.y(50)) + 0.5;
    A.svg("line", { class: "linha-ref", x1: p.x0, x2: p.x1, y1: y50, y2: y50 }, gf);

    if (fim >= 0) {
      A.svg("path", { class: "serie s-b", d: A.caminho(p, xs, S.pb, fim) }, gl);
      A.svg("path", { class: "serie s-a", d: A.caminho(p, xs, S.pa, fim) }, gl);
      const hx = p.x(xs[fim]);
      const quem = lider(fim) || "a";
      for (const c of ["a", "b"]) {
        const v = c === "a" ? S.pa[fim] : S.pb[fim];
        const hy = p.y(v);
        A.svg("circle", { class: "ponta p-" + c, cx: hx, cy: hy, r: 4.5 }, gm);
        A.rotuloPonta(gm, p, hx, hy + (c === quem ? -8 : 16), F.pct(v));
      }
    }
    desenharPinos(p, i);
  }

  /* Pinos numerados numa faixa acima do gráfico; pinos próximos descem para a fila seguinte. */
  function desenharPinos(p, i) {
    const g = p.g.topo;
    g.textContent = "";
    const filas = Math.max(1, Math.floor((p.m.t - 8) / 24));
    const ultimoX = new Array(filas).fill(-Infinity);
    for (const m of momentos) {
      if (i < 0 || m.i > i) continue;
      const x = p.x(xDoIndice(m.i));
      let fila = ultimoX.findIndex((u) => x - u >= 24);
      if (fila < 0) fila = ultimoX.indexOf(Math.min(...ultimoX));
      ultimoX[fila] = x;
      const cy = 14 + fila * 24;
      const v = lider(m.i) === "b" ? S.pb[m.i] : S.pa[m.i];
      const grupo = A.svg("g", {
        class: "pino",
        tabindex: "0",
        role: "button",
        "aria-label": `Momento ${m.num}: ${m.titulo}, ${T.curta(m.t)}`,
      }, g);
      A.svg("line", { x1: x, x2: x, y1: cy + 10, y2: p.y(v) - 6 }, grupo);
      A.svg("circle", { cx: x, cy, r: 10 }, grupo);
      A.svg("text", { x, y: cy }, grupo).textContent = String(m.num);
      grupo.addEventListener("click", () => irPara(m));
      grupo.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          irPara(m);
        }
      });
    }
  }

  /* ---------- Gráfico 2: a diferença em votos ---------- */

  const domMargem = A.dominioBonito(Math.min(...S.margem) * 1.15, Math.max(...S.margem) * 1.1, 6);

  function recortes(p) {
    if (!p.acima) {
      p.acima = A.svg("rect", null, A.svg("clipPath", { id: p.id + "-acima" }, p.defs));
      p.abaixo = A.svg("rect", null, A.svg("clipPath", { id: p.id + "-abaixo" }, p.defs));
    }
    const y0 = p.y(0);
    A.attrs(p.acima, { x: p.x0 - 10, y: p.y0 - 10, width: p.x1 - p.x0 + 20, height: y0 - p.y0 + 10 });
    A.attrs(p.abaixo, { x: p.x0 - 10, y: y0, width: p.x1 - p.x0 + 20, height: p.y1 - y0 + 10 });
  }

  function desenharMargem(p) {
    recortes(p);
    const i = indice();
    const fim = fimDesenho(i);
    const xs = X();
    const gf = p.g.fundo;
    const ga = p.g.area;
    const gl = p.g.linha;
    const gm = p.g.marca;
    gf.textContent = ga.textContent = gl.textContent = gm.textContent = "";

    // Os rótulos ocupam os cantos que a curva de 2022 não visita: Lula só lidera à direita, Bolsonaro à esquerda.
    const y0 = Math.round(p.y(0)) + 0.5;
    A.svg("line", { class: "linha-ref", x1: p.x0, x2: p.x1, y1: y0, y2: y0 }, gf);
    A.svg("text", { class: "rotulo-lado", x: p.x0 + 6, y: y0 - 8 }, gf).textContent = "↑ Lula à frente";
    A.svg("text", { class: "rotulo-lado", x: p.x1 - 6, y: y0 + 17, "text-anchor": "end" }, gf).textContent = "↓ Bolsonaro à frente";

    if (fim < 0) return;
    const area = A.caminhoArea(p, xs, S.margem, fim, 0);
    const linha = A.caminho(p, xs, S.margem, fim);
    A.svg("path", { class: "area-a", d: area, "clip-path": `url(#${p.id}-acima)` }, ga);
    A.svg("path", { class: "area-b", d: area, "clip-path": `url(#${p.id}-abaixo)` }, ga);
    A.svg("path", { class: "serie s-a", d: linha, "clip-path": `url(#${p.id}-acima)` }, gl);
    A.svg("path", { class: "serie s-b", d: linha, "clip-path": `url(#${p.id}-abaixo)` }, gl);

    const pico = porId.pico_bolsonaro;
    if (i >= pico.i) {
      const px = p.x(xDoIndice(pico.i));
      const py = p.y(S.margem[pico.i]);
      A.svg("circle", { class: "ponta p-b", cx: px, cy: py, r: 4 }, gm);
      const t = A.svg("text", { class: "rotulo-dado", x: px + 8, y: py + 4 }, gm);
      t.textContent = `Bolsonaro +${F.compacto(S.margem[pico.i])}, ${T.curta(S.t[pico.i])}`;
    }
    const hx = p.x(xs[fim]);
    const hy = p.y(S.margem[fim]);
    const quem = S.margem[fim] >= 0 ? "a" : "b";
    A.svg("circle", { class: "ponta p-" + quem, cx: hx, cy: hy, r: 4.5 }, gm);
    A.rotuloPonta(gm, p, hx, hy + (quem === "a" ? -8 : 16), F.sinal(S.margem[fim]) + F.compacto(S.margem[fim]));
  }

  /* ---------- Gráfico 3: os votos que chegavam ---------- */

  function calcularJanelas() {
    const xs = X();
    const passo = est.eixo === "tempo" ? 300 : 2.5;
    const fim = est.eixo === "tempo" ? FIM_EIXO : 100;
    const lista = [];
    for (let x0 = 0; x0 < fim - 1e-9; x0 += passo) {
      const i0 = A.ultimoAte(xs, x0);
      const i1 = A.ultimoAte(xs, x0 + passo);
      if (i1 < 0 || i1 === i0) continue;
      const a0 = i0 >= 0 ? S.a[i0] : 0;
      const b0 = i0 >= 0 ? S.b[i0] : 0;
      lista.push({ x0, x1: x0 + passo, i0, i1, a0, b0 });
    }
    est.janelas = lista;
  }

  /* Votos da janela até o índice i (a janela pode estar só começando). */
  function votosJanela(j, i) {
    const k = Math.min(i, j.i1);
    if (k <= j.i0) return null;
    const da = S.a[k] - j.a0;
    const db = S.b[k] - j.b0;
    if (da + db <= 0) return null;
    return { da, db, parcial: k < j.i1, pa: (da / (da + db)) * 100 };
  }

  function barra(x, w, yBase, yFim) {
    const h = Math.abs(yFim - yBase);
    if (h < 0.5) return "";
    const r = Math.min(4, w / 2, h);
    const s = yFim < yBase ? -1 : 1;
    const f = (v) => Math.round(v * 10) / 10;
    return `M${f(x)},${f(yBase)}V${f(yFim - s * r)}Q${f(x)},${f(yFim)} ${f(x + r)},${f(yFim)}H${f(x + w - r)}Q${f(x + w)},${f(yFim)} ${f(x + w)},${f(yFim - s * r)}V${f(yBase)}Z`;
  }

  function desenharLotes(p) {
    const i = indice();
    const gl = p.g.linha;
    const gf = p.g.fundo;
    gl.textContent = gf.textContent = "";
    const [dmin, dmax] = p.cfg.y.dominio;
    const yb = p.y(50);
    for (const j of est.janelas) {
      const v = votosJanela(j, i);
      if (!v) continue;
      const xa = p.x(j.x0);
      const xb = p.x(j.x1);
      const w = Math.max(1, Math.min(24, xb - xa - 2));
      const y = p.y(Math.max(dmin, Math.min(dmax, v.pa)));
      const classe = (v.pa >= 50 ? "barra-a" : "barra-b") + (v.parcial ? " parcial" : "") + (est.hover === j ? " barra-ativa" : "");
      A.svg("path", { class: classe, d: barra((xa + xb) / 2 - w / 2, w, yb, y) }, gl);
    }
    const y50 = Math.round(yb) + 0.5;
    A.svg("line", { class: "linha-base", x1: p.x0, x2: p.x1, y1: y50, y2: y50 }, gl);
  }

  function descricaoLotes() {
    const fimTotal = porId.virada_definitiva.i;
    let k = est.janelas.length - 1;
    while (k >= 0) {
      const v = votosJanela(est.janelas[k], ULTIMO);
      if (!v || v.pa <= 50) break;
      k--;
    }
    const j = est.janelas[k + 1];
    if (!j) return;
    const tempo = est.eixo === "tempo";
    const desde = tempo ? `A partir das ${T.marca(j.x0)}` : `A partir de ${F.inteiro(j.x0)}% das seções`;
    const atras = j.i0 < fimTotal ? ", mesmo enquanto ainda estava atrás no total" : "";
    $("desc-lotes").textContent =
      `Parcela de Lula entre os votos válidos de cada lote apurado (${tempo ? "a cada 5 minutos" : "a cada 2,5% das seções"}). ${desde}, Lula venceu todos os lotes${atras}.`;
  }

  /* ---------- Cursor e dicas ---------- */

  function pairar(origem, xv, px, py) {
    const graficos = [corrida, margem, lotes];
    if (xv === null || xv === undefined || indice() < 0) {
      est.hover = null;
      graficos.forEach((g) => g.cursor(null));
      [dicaCorrida, dicaMargem, dicaLotes].forEach((d) => d.esconder());
      desenharLotes(lotes);
      return;
    }
    if (origem === "lotes") {
      const j = est.janelas.find((j) => xv >= j.x0 && xv < j.x1) || null;
      const v = j && votosJanela(j, indice());
      est.hover = v ? j : null;
      desenharLotes(lotes);
      dicaCorrida.esconder();
      dicaMargem.esconder();
      graficos.forEach((g) => g.cursor(null));
      if (!v) return dicaLotes.esconder();
      const rotulo = est.eixo === "tempo" ? `${T.curta(j.x0)} às ${T.curta(j.x1)}` : `${F.pct(j.x0, 1)} a ${F.pct(j.x1, 1)} das seções`;
      dicaLotes.mostrar(px, py, {
        titulo: rotulo + (v.parcial ? " · em andamento" : ""),
        linhas: [
          { classe: "k-a", valor: F.pct(v.pa), rotulo: "Lula" },
          { classe: "k-b", valor: F.pct(100 - v.pa), rotulo: "Bolsonaro" },
        ],
        rodape: [`${F.inteiro(v.da + v.db)} votos válidos no lote`],
      });
      return;
    }
    const i = indiceEmX(xv);
    est.hover = null;
    const xh = xDoIndice(i);
    corrida.cursor(xh, [{ y: S.pa[i], classe: "p-a" }, { y: S.pb[i], classe: "p-b" }]);
    margem.cursor(xh, [{ y: S.margem[i], classe: S.margem[i] >= 0 ? "p-a" : "p-b" }]);
    lotes.cursor(xh, []);
    const conteudo = {
      titulo: `${T.relogio(S.t[i])} · ${F.pct(S.pst[i])} das seções`,
      linhas: [
        { classe: "k-a", valor: F.pct(S.pa[i]), rotulo: "Lula" },
        { classe: "k-b", valor: F.pct(S.pb[i]), rotulo: "Bolsonaro" },
      ],
      rodape: [
        S.margem[i] === 0
          ? "Empate"
          : `${NOME[lider(i)]} à frente por ${F.inteiro(Math.abs(S.margem[i]))} votos`,
      ],
    };
    const alvo = origem === "corrida" ? dicaCorrida : dicaMargem;
    (origem === "corrida" ? dicaMargem : dicaCorrida).esconder();
    dicaLotes.esconder();
    const plot = origem === "corrida" ? corrida : margem;
    alvo.mostrar(plot.x(xh), py, conteudo);
  }

  /* ---------- Placar ---------- */

  function partes(el, lista) {
    el.textContent = "";
    for (const p of lista) {
      if (typeof p === "string") el.appendChild(document.createTextNode(p));
      else A.html("strong", null, el, p.forte);
    }
  }

  function atualizarPlacar(i) {
    const relogio = Math.min(est.tempo, S.t[ULTIMO]);
    $("relogio").textContent = T.relogio(relogio);
    $("relogio-data").textContent = `${T.passouMeiaNoite(relogio) ? "31" : "30"} out. 2022 · horário de Brasília`;
    $("placar").classList.toggle("sem-dados", i < 0);
    if (i < 0) {
      $("pct-a").textContent = $("pct-b").textContent = "—";
      $("votos-a").textContent = $("votos-b").textContent = "0 votos";
      $("selo-a").hidden = $("selo-b").hidden = true;
      $("progresso").style.width = "0%";
      $("pst").textContent = "0%";
      partes($("diferenca"), ["Urnas fechadas às 17h. Aguardando a primeira parcial."]);
      $("falta").textContent = "";
      return;
    }
    const p = S.ponto(i);
    $("pct-a").textContent = F.pct(p.pa).replace("%", "");
    $("pct-b").textContent = F.pct(p.pb).replace("%", "");
    $("votos-a").textContent = F.inteiro(p.a) + " votos";
    $("votos-b").textContent = F.inteiro(p.b) + " votos";
    const quem = lider(i);
    $("selo-a").hidden = quem !== "a";
    $("selo-b").hidden = quem !== "b";
    $("progresso").style.width = p.pst.toFixed(3) + "%";
    $("pst").textContent = F.pct(p.pst);

    if (quem) {
      partes($("diferenca"), [
        "Diferença: ",
        { forte: `${NOME[quem]} +${F.inteiro(Math.abs(p.margem))} votos` },
        `, na frente desde ${T.curta(desdeQuando(i))}`,
      ]);
    } else {
      partes($("diferenca"), [{ forte: "Empate" }]);
    }

    const r = S.restante(i);
    const atras = quem === "a" ? "Bolsonaro" : "Lula";
    if (p.sec >= S.totais.secoes) {
      $("falta").textContent = "Todas as seções apuradas.";
    } else if (r.definido) {
      partes($("falta"), [
        { forte: "Resultado matematicamente definido" },
        `: faltam ${F.inteiro(r.aptosFaltam)} eleitores aptos.`,
      ]);
    } else if (r.precisa > 100) {
      partes($("falta"), [
        `${atras} precisaria de `,
        { forte: "mais que todos" },
        ` os cerca de ${F.quantos(r.validosFaltam, "votos válidos")} que faltam.`,
      ]);
    } else {
      partes($("falta"), [
        `Para empatar, ${atras} precisaria de `,
        { forte: F.pct(Math.min(r.precisa, 100)) },
        ` dos cerca de ${F.quantos(r.validosFaltam, "votos válidos")} que faltam.`,
      ]);
    }
  }

  /* ---------- Legenda de momento ---------- */

  const gCorrida = $("g-corrida");
  const elLegenda = A.html("div", "legenda-momento", gCorrida);
  elLegenda.hidden = true;
  let plotCorrida = null;

  function mostrarLegenda(m, comBotao) {
    est.legenda = m;
    elLegenda.textContent = "";
    const topo = A.html("div", "legenda-momento-topo", elLegenda);
    A.html("span", "numero", topo, String(m.num));
    A.html("span", "legenda-momento-hora", topo, `${T.relogio(m.t)} · ${F.pct(S.pst[m.i])} das seções`);
    A.html("h3", null, elLegenda, m.titulo);
    A.html("p", null, elLegenda, m.texto);
    if (comBotao) {
      const b = A.html("button", "botao", elLegenda, "Continuar");
      b.type = "button";
      b.addEventListener("click", () => {
        est.seguraAte = 1;
        agendar();
      });
    }
    posicionarLegenda();
    elLegenda.hidden = false;
    document.querySelectorAll(".momento").forEach((b) => b.classList.toggle("ativo", b.dataset.id === m.id));
    A.anunciar(`${T.curta(m.t)}. ${m.titulo}. ${m.texto}`);
  }

  function posicionarLegenda(p = plotCorrida) {
    const m = est.legenda;
    if (!m || !p) return;
    const x = p.x(xDoIndice(m.i));
    const direita = x < p.w * 0.52;
    elLegenda.style.left = direita ? "auto" : p.x0 + 8 + "px";
    elLegenda.style.right = direita ? "8px" : "auto";
    elLegenda.style.top = p.m.t + 6 + "px";
  }

  function fecharLegenda() {
    est.legenda = null;
    elLegenda.hidden = true;
    document.querySelectorAll(".momento.ativo").forEach((b) => b.classList.remove("ativo"));
  }

  /* ---------- Reprodução ---------- */

  let raf = 0;
  let ultimoQuadro = 0;

  function agendar() {
    if (!raf) raf = requestAnimationFrame(passo);
  }

  function passo(agora) {
    raf = 0;
    const dt = ultimoQuadro ? Math.min(0.1, (agora - ultimoQuadro) / 1000) : 0;
    ultimoQuadro = agora;
    if (est.tocando) avancar(dt, agora);
    desenhar();
    if (est.tocando) agendar();
    else ultimoQuadro = 0;
  }

  function avancar(dt, agora) {
    if (est.seguraAte) {
      if (agora < est.seguraAte) return;
      est.seguraAte = 0;
      fecharLegenda();
    }
    const lento = est.parar && emCameraLenta(est.tempo);
    $("chip-lento").hidden = !lento;
    const novo = est.tempo + dt * TAXA * est.velocidade * (lento ? LENTO : 1);
    if (est.parar) {
      const m = momentos.find((m) => m.t > est.tempo && m.t <= novo && m.t <= FIM_EIXO);
      if (m) {
        est.tempo = m.t;
        est.seguraAte = agora + (SEGURAR / Math.sqrt(est.velocidade)) * 1000;
        mostrarLegenda(m, true);
        return;
      }
    }
    if (novo >= FIM_EIXO) {
      est.tempo = S.t[ULTIMO];
      terminar();
      return;
    }
    est.tempo = novo;
  }

  function terminar() {
    est.tocando = false;
    est.seguraAte = 0;
    $("chip-lento").hidden = true;
    mostrarLegenda(momentos[momentos.length - 1], false);
    atualizarBotao();
  }

  function tocar() {
    if (est.tempo >= S.t[ULTIMO]) est.tempo = 0;
    fecharLegenda();
    est.tocando = true;
    est.jaTocou = true;
    est.seguraAte = 0;
    atualizarBotao();
    agendar();
  }

  function pausar() {
    est.tocando = false;
    est.seguraAte = 0;
    $("chip-lento").hidden = true;
    atualizarBotao();
  }

  function atualizarBotao() {
    const fim = est.tempo >= S.t[ULTIMO];
    let texto = "Continuar";
    if (est.tocando) texto = "Pausar";
    else if (fim) texto = est.jaTocou ? "Rever" : "Começar";
    else if (est.tempo <= 0) texto = "Começar";
    $("tocar-texto").textContent = texto;
    $("icone-tocar").setAttribute("d", est.tocando ? PAUSA : PLAY);
  }

  function irPara(m, rolar) {
    pausar();
    est.tempo = m.t;
    desenhar();
    mostrarLegenda(m, false);
    atualizarBotao();
    if (rolar) gCorrida.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "center" });
  }

  function buscar(tempo) {
    pausar();
    fecharLegenda();
    est.tempo = Math.max(0, Math.min(S.t[ULTIMO], tempo));
    desenhar();
  }

  let ultimoI = -2;
  function desenhar(forcar) {
    const i = indice();
    if (forcar || i !== ultimoI) {
      ultimoI = i;
      desenharCorrida(corrida);
      desenharMargem(margem);
      desenharLotes(lotes);
    }
    atualizarPlacar(i);
    const faixa = $("tempo");
    const v = est.tempo >= S.t[ULTIMO] ? 1000 : Math.round((Math.min(est.tempo, FIM_EIXO) / FIM_EIXO) * 1000);
    if (+faixa.value !== v) faixa.value = v;
    faixa.style.setProperty("--progresso", v / 10 + "%");
    faixa.setAttribute("aria-valuetext", T.relogio(Math.min(est.tempo, S.t[ULTIMO])));
  }

  /* ---------- Conteúdo fixo ---------- */

  function montarLide() {
    const pico = S.ponto(porId.pico_bolsonaro.i);
    const virada = S.ponto(porId.virada_definitiva.i);
    partes($("lide"), [
      "Bolsonaro assumiu a liderança nos primeiros minutos e chegou a ter ",
      { forte: `${F.inteiro(Math.abs(pico.margem))} votos` },
      ` de vantagem, às ${T.curta(pico.t)}. Às `,
      { forte: T.curta(virada.t) },
      ", com ",
      { forte: F.pct(virada.pst) },
      " das seções apuradas, Lula virou e não perdeu mais a liderança. Aperte Começar para rever a noite segundo a segundo, com os dados do TSE.",
    ]);
  }

  function montarMomentos() {
    const ol = $("momentos");
    for (const m of momentos) {
      const li = A.html("li", null, ol);
      const b = A.html("button", "momento", li);
      b.type = "button";
      b.dataset.id = m.id;
      const topo = A.html("div", "momento-topo", b);
      A.html("span", "numero", topo, String(m.num));
      A.html("span", "momento-hora", topo, T.relogio(m.t));
      A.html("span", "momento-pct", topo, F.pct(S.pst[m.i]));
      A.html("h3", null, b, m.titulo);
      A.html("p", null, b, m.texto);
      b.addEventListener("click", () => irPara(m, true));
    }
  }

  function montarTabela() {
    const corpo = $("tabela");
    const linha = (i, rotulo) => {
      const tr = A.html("tr", null, corpo);
      const quem = lider(i);
      A.html("td", quem ? "lider-" + quem : null, tr, rotulo);
      A.html("td", null, tr, F.pct(S.pst[i]));
      A.html("td", null, tr, F.pct(S.pa[i]));
      A.html("td", null, tr, F.pct(S.pb[i]));
      A.html("td", null, tr, F.inteiro(Math.abs(S.margem[i])));
      A.html("td", null, tr, quem ? NOME[quem] : "Empate");
    };
    for (let t = 900; t <= FIM_EIXO; t += 900) linha(A.ultimoAte(S.t, t), T.curta(t));
    linha(ULTIMO, `${T.curta(S.t[ULTIMO])} (fim)`);
  }

  /* ---------- Montagem ---------- */

  const dicaCorrida = new A.Dica(gCorrida);
  const corrida = new A.Plot(gCorrida, {
    rotulo: "Linhas com o percentual de votos válidos de Lula e de Bolsonaro ao longo da apuração",
    altura: (w) => (w < 560 ? 300 : 390),
    margem: (w) => ({ t: w < 560 ? 80 : 56, r: w < 560 ? 56 : 74, b: 30, l: 42 }),
    x: configX(),
    y: { dominio: [42, 58], ticks: () => [42, 46, 50, 54, 58], formato: (v) => v + "%" },
    aoDesenhar: (p) => {
      posicionarLegenda(p);
      desenharCorrida(p);
    },
    aoPairar: (xv, px, py) => pairar("corrida", xv, px, py),
  });
  plotCorrida = corrida;

  const gMargem = $("g-margem");
  const dicaMargem = new A.Dica(gMargem);
  const margem = new A.Plot(gMargem, {
    rotulo: "Área com a diferença de votos entre Lula e Bolsonaro ao longo da apuração",
    altura: (w) => (w < 560 ? 230 : 260),
    margem: (w) => ({ t: 14, r: w < 420 ? 58 : 66, b: 30, l: 50 }),
    x: configX(),
    y: {
      dominio: domMargem,
      ticks: (d) => A.ticksBonitos(d[0], d[1], 4),
      formato: (v) => (v === 0 ? "0" : F.sinal(v) + F.compacto(v)),
    },
    aoDesenhar: desenharMargem,
    aoPairar: (xv, px, py) => pairar("margem", xv, px, py),
  });

  calcularJanelas();
  const gLotes = $("g-lotes");
  const dicaLotes = new A.Dica(gLotes);
  const lotes = new A.Plot(gLotes, {
    rotulo: "Barras com a parcela de Lula nos votos válidos apurados em cada lote",
    altura: (w) => (w < 560 ? 230 : 260),
    margem: { t: 14, r: 12, b: 30, l: 42 },
    x: configX(),
    y: { dominio: [32, 68], ticks: () => [40, 50, 60], formato: (v) => v + "%" },
    aoDesenhar: desenharLotes,
    aoPairar: (xv, px, py) => pairar("lotes", xv, px, py),
  });

  montarLide();
  montarMomentos();
  montarTabela();
  descricaoLotes();
  atualizarBotao();
  desenhar(true);

  /* ---------- Eventos ---------- */

  $("tocar").addEventListener("click", () => (est.tocando ? pausar() : tocar()));
  $("reiniciar").addEventListener("click", () => {
    buscar(0);
    atualizarBotao();
  });
  $("tempo").addEventListener("input", (e) => {
    const v = +e.target.value;
    buscar(v >= 1000 ? S.t[ULTIMO] : (v / 1000) * FIM_EIXO);
    atualizarBotao();
  });
  $("parar").addEventListener("change", (e) => {
    est.parar = e.target.checked;
    if (!est.parar && est.seguraAte) est.seguraAte = 1;
  });
  A.aoEscolher("velocidade", (v) => {
    est.velocidade = +v;
  });
  A.aoEscolher("eixo", (v) => {
    est.eixo = v;
    for (const p of [corrida, margem, lotes]) p.cfg.x = configX();
    calcularJanelas();
    descricaoLotes();
    $("tempo-fim").textContent = "21h · fim às 00h18";
    pairar(null);
    [corrida, margem, lotes].forEach((p) => p.desenhar());
    posicionarLegenda();
    desenhar(true);
  });

  /* Teclado no gráfico principal: setas percorrem a apuração mostrando a dica. */
  let cursorTeclado = null;
  gCorrida.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(e.key)) return;
    if (e.target !== gCorrida) return;
    e.preventDefault();
    if (e.key === "Escape") {
      cursorTeclado = null;
      pairar(null);
      return;
    }
    const [d0, d1] = corrida.cfg.x.dominio;
    const passo = est.eixo === "tempo" ? 60 : 0.5;
    const limite = xDoIndice(Math.max(0, fimDesenho(indice())));
    if (cursorTeclado === null) cursorTeclado = limite;
    if (e.key === "ArrowLeft") cursorTeclado -= passo;
    if (e.key === "ArrowRight") cursorTeclado += passo;
    if (e.key === "Home") cursorTeclado = d0;
    if (e.key === "End") cursorTeclado = limite;
    cursorTeclado = Math.max(d0, Math.min(limite, cursorTeclado));
    pairar("corrida", cursorTeclado, corrida.x(cursorTeclado), corrida.m.t + 40);
  });
  gCorrida.addEventListener("blur", () => {
    cursorTeclado = null;
    pairar(null);
  });

  /* Espaço inicia ou pausa quando o foco não está num controle. */
  document.addEventListener("keydown", (e) => {
    if (e.key !== " " || e.repeat) return;
    const alvo = e.target;
    if (alvo !== document.body && alvo !== document.documentElement) return;
    e.preventDefault();
    if (est.tocando) pausar();
    else tocar();
  });
})();

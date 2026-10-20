/* 2026 ao vivo, com a sombra de 2022: lê a totalização do TSE no navegador e compara com a noite da virada. */
(function () {
  "use strict";

  const A = window.Apuracao;
  const F = A.fmt;
  const T = A.tempo;
  const S22 = A.serie2022(window.APURACAO_2022);
  const $ = (id) => document.getElementById(id);

  /* ---------- Eleição e endereços do TSE ---------- */

  // Códigos de https://resultados.tse.jus.br/oficial/comum/config/ele-c.json (pleito de 25/10/2026).
  const ELEICAO = "6258"; // Eleição Ordinária Federal 2026, 2º turno
  const BASE = "https://resultados.tse.jus.br/oficial/ele2026/" + ELEICAO + "/dados/";
  const ARQ = "-c0001-e" + ELEICAO.padStart(6, "0") + "-u.json"; // cargo 0001 = Presidente
  const URL_BR = BASE + "br/br" + ARQ;
  const urlUF = (uf) => BASE + uf + "/" + uf + ARQ;
  const FECHAMENTO = Date.parse("2026-10-25T17:00:00-03:00");
  const GUARDA = "apuracao:ele2026:" + ELEICAO + ":v1";

  const INTERVALO = 15000; // placar nacional durante a apuração
  const INTERVALO_UF = 2500; // um estado por vez, em rodízio
  const INTERVALO_ESPERA = 5 * 60000; // antes do dia da eleição
  const FIM_EIXO = 4 * 3600;

  const PADRAO = {
    a: { numero: "13", nome: "Lula", curto: "Lula", partido: "PT" },
    b: { numero: "22", nome: "Flávio Bolsonaro", curto: "Flávio", partido: "PL" },
  };
  const FICTICIOS = {
    a: { numero: "", nome: "Candidato A", curto: "A", partido: "" },
    b: { numero: "", nome: "Candidato B", curto: "B", partido: "" },
  };

  // [sigla, nome, coluna, linha, seções, eleitores aptos]; totais do 2º turno de 2026 (TSE, br-e006258-ab.json).
  const UFS = [
    ["rr", "Roraima", 2, 0, 1519, 401540],
    ["ap", "Amapá", 3, 0, 1914, 576910],
    ["am", "Amazonas", 1, 1, 8157, 2798661],
    ["pa", "Pará", 2, 1, 20827, 6262063],
    ["ma", "Maranhão", 3, 1, 18093, 5183049],
    ["ce", "Ceará", 4, 1, 23765, 6996521],
    ["rn", "Rio Grande do Norte", 5, 1, 8115, 2659867],
    ["ac", "Acre", 0, 2, 2270, 613715],
    ["ro", "Rondônia", 1, 2, 4698, 1265926],
    ["to", "Tocantins", 2, 2, 4384, 1182041],
    ["pi", "Piauí", 3, 2, 10225, 2704695],
    ["pe", "Pernambuco", 4, 2, 21418, 7223227],
    ["pb", "Paraíba", 5, 2, 10712, 3248434],
    ["mt", "Mato Grosso", 1, 3, 8287, 2637879],
    ["go", "Goiás", 2, 3, 15686, 5080385],
    ["ba", "Bahia", 3, 3, 35476, 11312891],
    ["se", "Sergipe", 4, 3, 5923, 1740093],
    ["al", "Alagoas", 5, 3, 7101, 2442081],
    ["ms", "Mato Grosso do Sul", 1, 4, 7106, 2024437],
    ["df", "Distrito Federal", 2, 4, 6969, 2258995],
    ["mg", "Minas Gerais", 3, 4, 52062, 16372144],
    ["es", "Espírito Santo", 4, 4, 9844, 2991515],
    ["sp", "São Paulo", 2, 5, 103656, 34123591],
    ["rj", "Rio de Janeiro", 3, 5, 37675, 12857526],
    ["pr", "Paraná", 2, 6, 27142, 8613628],
    ["rs", "Rio Grande do Sul", 1, 7, 27547, 8522318],
    ["sc", "Santa Catarina", 2, 7, 17326, 5734687],
    ["zz", "Exterior", 5, 7, 1351, 916683],
  ];
  const TOTAIS = {
    secoes: UFS.reduce((s, u) => s + u[4], 0),
    aptos: UFS.reduce((s, u) => s + u[5], 0),
  };
  const NOME_UF = Object.fromEntries(UFS.map((u) => [u[0], u[1]]));

  /* ---------- Leitura dos arquivos do TSE ---------- */

  const numero = (v) => {
    const n = Number(String(v === undefined || v === null ? "" : v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  function dataTSE(d, h) {
    if (!d || !h) return null;
    const [dia, mes, ano] = String(d).split("/");
    const t = Date.parse(`${ano}-${mes}-${dia}T${h}-03:00`);
    return Number.isFinite(t) ? t : null;
  }

  /* Converte o JSON "-u.json" do TSE no formato usado pela página. */
  function lerTSE(json) {
    if (!json || !json.s || !json.e || !json.v) throw new Error("formato inesperado");
    const candidatos = [];
    for (const cargo of json.carg || []) {
      for (const agr of cargo.agr || []) {
        for (const par of agr.par || []) {
          for (const c of par.cand || []) {
            // No 1º turno o TSE marca e = "s" também para quem foi ao 2º turno; só vale com situação de eleito.
            const eleito = c.e === "s" && !/turno|não eleito/i.test(c.st || "");
            candidatos.push({ n: String(c.n), votos: numero(c.vap), eleito });
          }
        }
      }
    }
    const a = candidatos.find((c) => c.n === PADRAO.a.numero);
    const b = candidatos.find((c) => c.n === PADRAO.b.numero);
    if (!a || !b) throw new Error("candidatos não encontrados no arquivo");
    return {
      gerado: dataTSE(json.dg, json.hg),
      totalizado: dataTSE(json.dt, json.ht),
      secoes: numero(json.s.ts),
      apuradas: numero(json.s.st),
      aptos: numero(json.e.te),
      aptosApurados: numero(json.e.est),
      brancos: numero(json.v.vb),
      nulos: numero(json.v.tvn),
      a: a.votos,
      b: b.votos,
      eleito: a.eleito ? "a" : b.eleito ? "b" : null,
      andamento: String(json.and || ""),
      final: json.tf === "s",
    };
  }

  const encerrada = (u) => !!u && (u.final || u.andamento === "f");

  /* ---------- Conjuntos de dados: ao vivo e simulação ---------- */

  function novoConjunto(nomes) {
    return { serie: new A.Serie({ ...TOTAIS }), ultimo: null, ufs: {}, nomes, lido: 0, fonte: "tse" };
  }

  const vivo = novoConjunto(PADRAO);
  let atual = vivo; // aponta para a simulação enquanto ela roda

  /* Acrescenta um instante à série quando há totalização nova. Devolve true se acrescentou. */
  function ingerir(conj, snap) {
    conj.ultimo = snap;
    if (!snap.totalizado || snap.apuradas <= 0) return false;
    const s = conj.serie;
    if (snap.secoes && snap.secoes !== s.totais.secoes && s.n === 0) {
      s.totais = { secoes: snap.secoes, aptos: snap.aptos };
    }
    const t = (snap.totalizado - FECHAMENTO) / 1000;
    const n = s.n;
    if (n) {
      if (t <= s.t[n - 1] || snap.apuradas < s.sec[n - 1]) return false;
      if (snap.apuradas === s.sec[n - 1] && snap.a === s.a[n - 1] && snap.b === s.b[n - 1]) return false;
    }
    s.adicionar({
      t,
      sec: snap.apuradas,
      aptos: snap.aptosApurados,
      a: snap.a,
      b: snap.b,
      outros: snap.brancos + snap.nulos,
    });
    return true;
  }

  function guardar() {
    try {
      const s = vivo.serie;
      const pacote = { totais: s.totais, t: s.t, sec: s.sec, aptos: s.aptos, a: s.a, b: s.b, outros: s.outros, fonte: vivo.fonte };
      localStorage.setItem(GUARDA, JSON.stringify(pacote));
    } catch (e) {
      /* sem armazenamento local: a curva vale só enquanto a página estiver aberta */
    }
  }

  function recuperar() {
    try {
      const g = JSON.parse(localStorage.getItem(GUARDA) || "null");
      if (!g || !Array.isArray(g.t) || !g.totais) return;
      const s = new A.Serie(g.totais);
      for (let i = 0; i < g.t.length; i++) {
        s.adicionar({ t: g.t[i], sec: g.sec[i], aptos: g.aptos[i], a: g.a[i], b: g.b[i], outros: g.outros[i] || 0 });
      }
      vivo.serie = s;
      vivo.fonte = g.fonte || "tse";
    } catch (e) {
      /* dado guardado ilegível: começa do zero */
    }
  }

  /* Junta à série os instantes gravados pelo coletor (scripts/coletor-2026.mjs), quando a página
     está publicada no mesmo lugar que o arquivo. Fora disso, a leitura falha em silêncio. */
  async function lerColeta() {
    try {
      const r = await fetch("dados/2026-2t-coleta.json", { cache: "no-store" });
      if (!r.ok) return;
      const c = await r.json();
      if (c.eleicao !== ELEICAO || !Array.isArray(c.pontos) || !c.pontos.length) return;
      const s = vivo.serie;
      const porTempo = new Map(c.pontos.map((p) => [p[0], p]));
      for (let i = 0; i < s.n; i++) {
        if (!porTempo.has(s.t[i])) porTempo.set(s.t[i], [s.t[i], s.sec[i], s.aptos[i], s.a[i], s.b[i], s.outros[i]]);
      }
      if (porTempo.size === s.n) return;
      const nova = new A.Serie(c.totais || s.totais);
      let ultimaSec = -1;
      for (const p of [...porTempo.values()].sort((x, y) => x[0] - y[0])) {
        if (p[1] < ultimaSec) continue;
        ultimaSec = p[1];
        nova.adicionar({ t: p[0], sec: p[1], aptos: p[2], a: p[3], b: p[4], outros: p[5] });
      }
      vivo.serie = nova;
      guardar();
      if (atual === vivo) renderizar();
    } catch (e) {
      /* sem arquivo do coletor: segue só com a leitura ao vivo */
    }
  }

  function apagarGuardado() {
    try {
      localStorage.removeItem(GUARDA);
    } catch (e) {
      /* nada a apagar */
    }
    vivo.serie = new A.Serie({ ...TOTAIS });
    vivo.fonte = "tse";
    if (vivo.ultimo) ingerir(vivo, vivo.ultimo);
  }

  /* ---------- Leitura periódica ---------- */

  let falhas = 0;
  let bloqueado = false;
  let timerBR = 0;
  let timerUF = 0;
  let rodizioUF = 0;
  let ufsLigadas = false;

  document.addEventListener("securitypolicyviolation", (e) => {
    if (String(e.blockedURI || "").includes("tse.jus.br")) {
      bloqueado = true;
      atualizarStatus();
    }
  });

  async function buscarJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function lerBR() {
    clearTimeout(timerBR);
    try {
      const snap = lerTSE(await buscarJSON(URL_BR));
      falhas = 0;
      vivo.lido = Date.now();
      const antes = vivo.serie.n ? Math.sign(vivo.serie.margem[vivo.serie.n - 1]) : 0;
      if (ingerir(vivo, snap)) {
        guardar();
        const s = vivo.serie;
        const depois = Math.sign(s.margem[s.n - 1]);
        if (antes && depois && antes !== depois) avisarTroca(depois > 0 ? "a" : "b", s.n - 1);
      }
      if (snap.apuradas > 0) ligarUFs();
      if (atual === vivo) renderizar();
    } catch (e) {
      falhas++;
    }
    atualizarStatus();
    timerBR = setTimeout(lerBR, proximoIntervalo());
  }

  function proximoIntervalo() {
    if (falhas) return Math.min(60000, INTERVALO * 2 ** Math.min(falhas - 1, 2));
    if (encerrada(vivo.ultimo)) return 5 * 60000;
    if (Date.now() < FECHAMENTO - 10 * 60000 && !(vivo.ultimo && vivo.ultimo.apuradas > 0)) return INTERVALO_ESPERA;
    return INTERVALO;
  }

  function ligarUFs() {
    if (ufsLigadas) return;
    ufsLigadas = true;
    lerProximaUF();
  }

  async function lerProximaUF() {
    const uf = UFS[rodizioUF % UFS.length][0];
    rodizioUF++;
    const primeiraVolta = !vivo.ufs[uf];
    try {
      vivo.ufs[uf] = lerTSE(await buscarJSON(urlUF(uf)));
      if (atual === vivo) renderizarEstados();
    } catch (e) {
      /* tenta de novo na próxima volta do rodízio */
    }
    const espera = encerrada(vivo.ultimo) ? 60000 : primeiraVolta ? 300 : INTERVALO_UF;
    timerUF = setTimeout(lerProximaUF, espera);
  }

  function atualizarAgora() {
    lerBR();
    if (ufsLigadas) {
      clearTimeout(timerUF);
      lerProximaUF();
    }
  }

  /* ---------- Avisos de troca de liderança ---------- */

  let avisos = false;
  let audio = null;

  function bip() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.5);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.55);
    } catch (e) {
      /* sem áudio neste navegador */
    }
  }

  function avisarTroca(quem, i) {
    const nome = vivo.nomes[quem].nome;
    const texto = `${nome} passa à frente com ${F.pct(vivo.serie.pst[i])} das seções apuradas.`;
    A.anunciar(texto);
    if (!avisos) return;
    bip();
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Virada na apuração", { body: texto, tag: "virada" });
      }
    } catch (e) {
      /* notificações indisponíveis: fica o som e o anúncio */
    }
  }

  /* ---------- Simulação ---------- */

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Modelo fictício: cada estado começa e termina de apurar num ritmo próprio, e os mais lentos
     pendem para A, para que a noite tenha virada como em 2022. Os números não significam nada. */
  function criarModelo(semente) {
    const rnd = mulberry32(semente);
    const ufs = UFS.map(([uf, , , , secoes, aptos]) => {
      const duracao = (55 + rnd() * 150) * 60;
      const tarde = duracao / (205 * 60); // entre 0,27 (estado rápido) e 1 (o mais lento)
      return {
        uf,
        secoes,
        aptos,
        atraso: (1 + rnd() * 9) * 60,
        duracao,
        parcelaA: Math.min(0.66, Math.max(0.34, 0.495 + (tarde - 0.63) * 0.22 + (rnd() - 0.5) * 0.1)),
        ruido: (rnd() - 0.5) * 0.08,
      };
    });
    const zero = () => ({ apuradas: 0, aptosApurados: 0, a: 0, b: 0, brancos: 0, nulos: 0, secoes: 0, aptos: 0 });
    function estado(u, t) {
      const x = Math.max(0, Math.min(1, (t - u.atraso) / u.duracao));
      const f = 1 - Math.pow(1 - x, 2.2);
      const aptosApurados = Math.round(u.aptos * f);
      const comparecem = aptosApurados * 0.79;
      const validos = Math.round(comparecem * 0.95);
      const a = Math.round(validos * (u.parcelaA + u.ruido * (1 - f)));
      return {
        apuradas: Math.round(u.secoes * f),
        aptosApurados,
        a,
        b: validos - a,
        brancos: Math.round(comparecem * 0.017),
        nulos: Math.round(comparecem * 0.033),
        secoes: u.secoes,
        aptos: u.aptos,
      };
    }
    function snap(e, quando) {
      const final = e.apuradas >= e.secoes;
      return {
        gerado: quando,
        totalizado: e.apuradas > 0 ? quando : null,
        secoes: e.secoes,
        apuradas: e.apuradas,
        aptos: e.aptos,
        aptosApurados: e.aptosApurados,
        brancos: e.brancos,
        nulos: e.nulos,
        a: e.a,
        b: e.b,
        eleito: null,
        andamento: final ? "f" : e.apuradas ? "p" : "n",
        final,
      };
    }
    return {
      fim: Math.max(...ufs.map((u) => u.atraso + u.duracao)),
      instante(t) {
        const quando = FECHAMENTO + t * 1000;
        const br = zero();
        const porUF = {};
        for (const u of ufs) {
          const e = estado(u, t);
          porUF[u.uf] = snap(e, quando);
          for (const k in br) br[k] += e[k];
        }
        return { br: snap(br, quando), porUF };
      },
    };
  }

  const sim = { modelo: null, conj: null, tempo: 0, ultimoBR: 0, ultimoUF: 0, raf: 0, quadro: 0 };
  const VELOCIDADE_SIM = 170; // segundos simulados por segundo real

  function iniciarSimulacao() {
    cancelAnimationFrame(sim.raf);
    sim.modelo = criarModelo(Math.floor(Math.random() * 2 ** 31));
    sim.conj = novoConjunto(FICTICIOS);
    sim.conj.fonte = "simulacao";
    sim.tempo = 0;
    sim.ultimoBR = -Infinity;
    sim.ultimoUF = -Infinity;
    sim.quadro = 0;
    atual = sim.conj;
    $("aviso-simulacao").hidden = false;
    $("marca-dagua").hidden = false;
    $("simular").hidden = true;
    renderizar();
    sim.raf = requestAnimationFrame(passoSimulacao);
  }

  function passoSimulacao(agora) {
    const dt = sim.quadro ? Math.min(0.1, (agora - sim.quadro) / 1000) : 0;
    sim.quadro = agora;
    sim.tempo = Math.min(sim.modelo.fim, sim.tempo + dt * VELOCIDADE_SIM);
    const terminou = sim.tempo >= sim.modelo.fim;
    if (sim.tempo - sim.ultimoBR >= 20 || terminou) {
      const inst = sim.modelo.instante(sim.tempo);
      ingerir(sim.conj, inst.br);
      sim.ultimoBR = sim.tempo;
      if (sim.tempo - sim.ultimoUF >= 60 || terminou) {
        sim.conj.ufs = inst.porUF;
        sim.ultimoUF = sim.tempo;
      }
      renderizar();
    }
    if (!terminou && atual === sim.conj) sim.raf = requestAnimationFrame(passoSimulacao);
    else atualizarStatus();
  }

  function sairSimulacao() {
    cancelAnimationFrame(sim.raf);
    atual = vivo;
    $("aviso-simulacao").hidden = true;
    $("marca-dagua").hidden = true;
    $("simular").hidden = false;
    renderizar();
  }

  /* ---------- Estado da conexão ---------- */

  function contagem(ms) {
    const min = Math.max(0, Math.floor(ms / 60000));
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = min % 60;
    return (d ? `${d} d ` : "") + (d || h ? `${h} h ` : "") + `${m} min`;
  }

  const horaLocal = (ms) =>
    new Date(ms).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  function atualizarStatus() {
    const u = vivo.ultimo;
    let estado = "conectando";
    let texto = "Conectando ao TSE…";
    let detalhe = "";
    if (atual !== vivo) {
      const fim = sim.modelo && sim.tempo >= sim.modelo.fim;
      estado = "simulacao";
      texto = fim ? "Simulação concluída" : "Simulação";
      detalhe = `Relógio simulado: ${T.relogio(sim.tempo)}`;
    } else if (bloqueado) {
      estado = "bloqueado";
      texto = "Sem acesso ao TSE aqui";
      detalhe = "Este visualizador bloqueia conexões externas, então aqui só funcionam a sombra de 2022 e a simulação. A leitura ao vivo funciona na página publicada no GitHub ou no arquivo 2026.html aberto no navegador.";
    } else if (falhas && !u) {
      estado = "erro";
      texto = "O TSE não respondeu";
      detalhe = `Nova tentativa em ${Math.round(proximoIntervalo() / 1000)} s.`;
    } else if (falhas) {
      estado = "erro";
      texto = "Conexão instável";
      detalhe = `Último dado lido às ${horaLocal(vivo.lido)}. Tentando de novo.`;
    } else if (u && encerrada(u)) {
      estado = "encerrada";
      texto = "Apuração encerrada";
      detalhe = u.totalizado ? `Totalização final às ${horaLocal(u.totalizado)}.` : "";
    } else if (u && u.apuradas > 0) {
      estado = "aovivo";
      texto = "Ao vivo";
      detalhe = `Totalização das ${horaLocal(u.totalizado || u.gerado)} · conferido às ${horaLocal(vivo.lido)}`;
    } else if (u) {
      estado = "aguardando";
      const falta = FECHAMENTO - Date.now();
      texto = falta > 0 ? "Aguardando" : "Urnas fechadas";
      detalhe =
        falta > 0
          ? `As urnas fecham domingo, 25 de outubro, às 17h de Brasília. Faltam ${contagem(falta)}.`
          : "Aguardando a primeira parcial do TSE.";
    }
    const el = $("status");
    el.dataset.estado = estado;
    $("status-texto").textContent = texto;
    $("status-detalhe").textContent = detalhe;
    const aoVivo = document.querySelector('meta[name="versao-ao-vivo"]');
    const link = $("abrir-ao-vivo");
    link.hidden = !(estado === "bloqueado" && aoVivo);
    if (aoVivo) link.href = aoVivo.content;
  }

  /* ---------- Eixos ---------- */

  const est = { eixo: "pst" };
  const virada22 = (() => {
    const trocas = S22.trocas();
    return trocas[trocas.length - 1];
  })();

  function fimTempo(s) {
    const ultimo = s.n ? s.t[s.n - 1] : 0;
    return Math.min(8 * 3600, Math.max(FIM_EIXO, Math.ceil((ultimo + 600) / 1800) * 1800));
  }

  function configX(s) {
    return est.eixo === "tempo"
      ? { dominio: [0, fimTempo(s)], ticks: A.ticksTempo, formato: T.marca }
      : { dominio: [0, 100], ticks: A.ticksPct, formato: (v) => v + "%" };
  }

  const xs = (s) => (est.eixo === "tempo" ? s.t : s.pst);

  function fim22(p) {
    return est.eixo === "tempo" ? A.ultimoAte(S22.t, p.cfg.x.dominio[1]) : S22.n - 1;
  }

  /* Valor de 2022 no mesmo ponto do eixo (mesmo % de seções ou mesmo horário). */
  function em2022(campo, x) {
    return A.interpolar(est.eixo === "tempo" ? S22.t : S22.pst, S22[campo], x);
  }

  /* ---------- Gráfico: a corrida e a sombra ---------- */

  function dominioCorrida(s) {
    let desvio = 8;
    for (let i = 0; i < s.n; i++) if (s.pst[i] >= 1) desvio = Math.max(desvio, Math.abs(s.pa[i] - 50) + 0.5);
    desvio = Math.min(25, Math.ceil(desvio / 2) * 2);
    return [50 - desvio, 50 + desvio];
  }

  function desenharCorrida(p) {
    const s = atual.serie;
    const nomes = atual.nomes;
    for (const g of ["fundo", "sombra", "linha", "marca", "anota"]) p.g[g].textContent = "";
    const y50 = Math.round(p.y(50)) + 0.5;
    A.svg("line", { class: "linha-ref", x1: p.x0, x2: p.x1, y1: y50, y2: y50 }, p.g.fundo);

    const x22 = est.eixo === "tempo" ? S22.t : S22.pst;
    const f22 = fim22(p);
    for (const c of ["b", "a"]) {
      const ys = c === "a" ? S22.pa : S22.pb;
      const d = A.caminho(p, x22, ys, f22);
      A.svg("path", { class: "sombra-larga sa-" + c, d }, p.g.sombra);
      A.svg("path", { class: "sombra-fio sf-" + c, d }, p.g.sombra);
    }
    // A virada de 2022 fica marcada na sombra, com o rótulo junto ao eixo para não disputar espaço com 2026.
    if (virada22 <= f22) {
      const vx = p.x(x22[virada22]);
      A.svg("line", { class: "linha-ref", x1: vx, x2: vx, y1: y50 + 5, y2: p.y1 - 20 }, p.g.anota);
      A.svg("circle", { class: "marco-2022", cx: vx, cy: y50, r: 4 }, p.g.anota);
      const t = A.svg("text", { class: "rotulo-lado", x: vx, y: p.y1 - 8, "text-anchor": "middle" }, p.g.anota);
      t.textContent = `virada de 2022 · ${est.eixo === "tempo" ? T.curta(S22.t[virada22]) : F.pct(S22.pst[virada22], 0)}`;
    }

    if (!s.n) {
      const t = A.svg("text", { class: "texto-vazio", x: (p.x0 + p.x1) / 2, y: p.y(50) + 44, "text-anchor": "middle" }, p.g.anota);
      A.svg("tspan", { x: (p.x0 + p.x1) / 2, dy: 0 }, t).textContent = "A curva de 2026 aparece aqui";
      A.svg("tspan", { x: (p.x0 + p.x1) / 2, dy: 16 }, t).textContent = "com a primeira parcial do TSE";
      return;
    }

    const X = xs(s);
    const fim = s.n - 1;
    const clip = p.recorteUrl;
    A.svg("path", { class: "serie s-b", d: A.caminho(p, X, s.pb, fim), "clip-path": clip }, p.g.linha);
    A.svg("path", { class: "serie s-a", d: A.caminho(p, X, s.pa, fim), "clip-path": clip }, p.g.linha);

    for (const i of s.trocas()) {
      const tx = p.x(X[i]);
      A.svg("circle", { class: "ponta p-" + (s.margem[i] > 0 ? "a" : "b"), cx: tx, cy: y50, r: 4 }, p.g.marca);
    }

    const hx = p.x(X[fim]);
    const lidera = s.margem[fim] >= 0 ? "a" : "b";
    const [d0, d1] = p.cfg.y.dominio;
    for (const c of ["a", "b"]) {
      const v = c === "a" ? s.pa[fim] : s.pb[fim];
      const hy = p.y(Math.max(d0, Math.min(d1, v)));
      A.svg("circle", { class: "ponta p-" + c, cx: hx, cy: hy, r: 4.5 }, p.g.marca);
      const texto = (p.w < 560 ? "" : nomes[c].curto + " ") + F.pct(v);
      A.rotuloPonta(p.g.marca, p, hx, hy + (c === lidera ? -8 : 16), texto);
    }
  }

  /* ---------- Gráfico: a diferença ---------- */

  function dominioMargem(s) {
    let min = Math.min(...S22.margem);
    let max = Math.max(...S22.margem);
    for (let i = 0; i < s.n; i++) {
      min = Math.min(min, s.margem[i]);
      max = Math.max(max, s.margem[i]);
    }
    return A.dominioBonito(min * 1.15, max * 1.1, 6);
  }

  function recortes(p) {
    if (!p.acima) {
      p.acima = A.svg("rect", null, A.svg("clipPath", { id: p.id + "-acima" }, p.defs));
      p.abaixo = A.svg("rect", null, A.svg("clipPath", { id: p.id + "-abaixo" }, p.defs));
    }
    const y0 = p.y(0);
    A.attrs(p.acima, { x: p.x0 - 10, y: p.y0 - 10, width: p.x1 - p.x0 + 20, height: Math.max(0, y0 - p.y0 + 10) });
    A.attrs(p.abaixo, { x: p.x0 - 10, y: y0, width: p.x1 - p.x0 + 20, height: Math.max(0, p.y1 - y0 + 10) });
  }

  function desenharMargem(p) {
    recortes(p);
    const s = atual.serie;
    for (const g of ["fundo", "sombra", "area", "linha", "marca"]) p.g[g].textContent = "";
    const acima = `url(#${p.id}-acima)`;
    const abaixo = `url(#${p.id}-abaixo)`;
    const y0 = Math.round(p.y(0)) + 0.5;
    A.svg("line", { class: "linha-ref", x1: p.x0, x2: p.x1, y1: y0, y2: y0 }, p.g.fundo);

    const x22 = est.eixo === "tempo" ? S22.t : S22.pst;
    const d22 = A.caminho(p, x22, S22.margem, fim22(p));
    A.svg("path", { class: "sombra-larga sa-a", d: d22, "clip-path": acima }, p.g.sombra);
    A.svg("path", { class: "sombra-larga sa-b", d: d22, "clip-path": abaixo }, p.g.sombra);

    if (!s.n) return;
    const X = xs(s);
    const fim = s.n - 1;
    const area = A.caminhoArea(p, X, s.margem, fim, 0);
    const linha = A.caminho(p, X, s.margem, fim);
    A.svg("path", { class: "area-a", d: area, "clip-path": acima }, p.g.area);
    A.svg("path", { class: "area-b", d: area, "clip-path": abaixo }, p.g.area);
    A.svg("path", { class: "serie s-a", d: linha, "clip-path": acima }, p.g.linha);
    A.svg("path", { class: "serie s-b", d: linha, "clip-path": abaixo }, p.g.linha);
    const hx = p.x(X[fim]);
    const hy = p.y(s.margem[fim]);
    const quem = s.margem[fim] >= 0 ? "a" : "b";
    A.svg("circle", { class: "ponta p-" + quem, cx: hx, cy: hy, r: 4.5 }, p.g.marca);
    A.rotuloPonta(p.g.marca, p, hx, hy + (quem === "a" ? -8 : 16), F.sinal(s.margem[fim]) + F.compacto(s.margem[fim]));
  }

  /* ---------- Cursor e dicas ---------- */

  function indiceEmX(s, xv) {
    const X = xs(s);
    if (!s.n || xv < X[0]) return -1;
    let i = Math.max(0, A.ultimoAte(X, xv));
    if (i < s.n - 1 && Math.abs(X[i + 1] - xv) < Math.abs(X[i] - xv)) i++;
    return i;
  }

  function pairar(origem, xv, px, py) {
    if (xv === null || xv === undefined) {
      corrida.cursor(null);
      margem.cursor(null);
      dicaCorrida.esconder();
      dicaMargem.esconder();
      return;
    }
    const s = atual.serie;
    const nomes = atual.nomes;
    const [d0, d1] = corrida.cfg.x.dominio;
    xv = Math.max(d0, Math.min(d1, xv));
    const i = indiceEmX(s, xv);
    const temDado = i >= 0 && Math.abs(xs(s)[i] - xv) <= (d1 - d0) * 0.03;
    const xh = temDado ? xs(s)[i] : xv;
    const a22 = em2022("pa", xh);
    const m22 = em2022("margem", xh);
    const pontosCorrida = [];
    if (temDado) pontosCorrida.push({ y: s.pa[i], classe: "p-a" }, { y: s.pb[i], classe: "p-b" });
    corrida.cursor(xh, pontosCorrida);
    margem.cursor(xh, temDado ? [{ y: s.margem[i], classe: s.margem[i] >= 0 ? "p-a" : "p-b" }] : []);

    const titulo = est.eixo === "tempo" ? T.relogio(xh) : `${F.pct(xh)} das seções`;
    const linhas = [];
    if (temDado) {
      linhas.push(
        { classe: "k-a", valor: F.pct(s.pa[i]), rotulo: `${nomes.a.nome}, ${atual === vivo ? "2026" : "simulação"}` },
        { classe: "k-b", valor: F.pct(s.pb[i]), rotulo: nomes.b.nome },
      );
    }
    if (a22 !== null) {
      linhas.push(
        { classe: "sombra k-a", valor: F.pct(a22), rotulo: "Lula, 2022" },
        { classe: "sombra k-b", valor: F.pct(100 - a22), rotulo: "Jair Bolsonaro" },
      );
    }
    const rodape = [];
    if (temDado) {
      const quem = s.margem[i] > 0 ? "a" : "b";
      rodape.push(`${nomes[quem].curto} à frente por ${F.inteiro(Math.abs(s.margem[i]))} votos`);
      rodape.push(est.eixo === "tempo" ? `${F.pct(s.pst[i])} das seções` : `Totalização das ${T.relogio(s.t[i])}`);
    }
    if (m22 !== null) rodape.push(`Em 2022: ${m22 >= 0 ? "Lula" : "Bolsonaro"} +${F.inteiro(Math.abs(m22))} votos`);
    const conteudo = { titulo, linhas, rodape };
    if (origem === "corrida") {
      dicaMargem.esconder();
      dicaCorrida.mostrar(corrida.x(xh), py, conteudo);
    } else {
      dicaCorrida.esconder();
      dicaMargem.mostrar(margem.x(xh), py, conteudo);
    }
  }

  /* ---------- Placar ---------- */

  function partes(el, lista) {
    el.textContent = "";
    for (const p of lista) {
      if (typeof p === "string") el.appendChild(document.createTextNode(p));
      else A.html("strong", null, el, p.forte);
    }
  }

  function atualizarNomes(conj) {
    const n = conj.nomes;
    $("nome-a").textContent = n.a.nome;
    $("nome-b").textContent = n.b.nome;
    $("num-a").textContent = n.a.partido ? `${n.a.partido} · ${n.a.numero}` : "fictício";
    $("num-b").textContent = n.b.partido ? `${n.b.partido} · ${n.b.numero}` : "fictício";
    const sufixo = conj === vivo ? " 2026" : " (simulação)";
    $("leg-a").textContent = n.a.nome + sufixo;
    $("leg-b").textContent = n.b.nome + sufixo;
    $("leg-uf-a").textContent = `${n.a.curto} lidera`;
    $("leg-uf-b").textContent = `${n.b.curto} lidera`;
    $("leg-m-a").textContent = `${n.a.curto} à frente`;
    $("leg-m-b").textContent = `${n.b.curto} à frente`;
  }

  function atualizarPlacar(conj) {
    const s = conj.serie;
    const u = conj.ultimo;
    const nomes = conj.nomes;
    const temDado = s.n > 0;
    $("placar").classList.toggle("sem-dados", !temDado);
    if (!temDado) {
      $("pct-a").textContent = $("pct-b").textContent = "—";
      $("votos-a").textContent = $("votos-b").textContent = conj === vivo ? "aguardando" : "0 votos";
      $("selo-a").hidden = $("selo-b").hidden = true;
      $("progresso").style.width = "0%";
      $("pst").textContent = "0%";
      $("relogio").textContent = "--:--:--";
      $("relogio-data").textContent = "última totalização";
      $("diferenca").textContent =
        Date.now() < FECHAMENTO && conj === vivo
          ? "A apuração começa quando as urnas fecharem, às 17h de domingo."
          : "Aguardando a primeira parcial.";
      $("falta").textContent = "";
      partes($("comparacao-texto"), [
        "Em 2022, Lula terminou com ",
        { forte: F.pct(S22.pa[S22.n - 1]) },
        " contra ",
        { forte: F.pct(S22.pb[S22.n - 1]) },
        " de Jair Bolsonaro, depois de passar a noite atrás até as 18h44.",
      ]);
      return;
    }
    const i = s.n - 1;
    const p = s.ponto(i);
    $("pct-a").textContent = F.pct(p.pa).replace("%", "");
    $("pct-b").textContent = F.pct(p.pb).replace("%", "");
    $("votos-a").textContent = F.inteiro(p.a) + " votos";
    $("votos-b").textContent = F.inteiro(p.b) + " votos";
    const quem = p.margem > 0 ? "a" : p.margem < 0 ? "b" : null;
    $("selo-a").hidden = quem !== "a";
    $("selo-b").hidden = quem !== "b";
    if (u && u.eleito) {
      $("selo-" + u.eleito).hidden = false;
      $("selo-" + u.eleito).textContent = "Eleito";
    } else {
      $("selo-a").textContent = $("selo-b").textContent = "À frente";
    }
    $("progresso").style.width = p.pst.toFixed(3) + "%";
    $("pst").textContent = F.pct(p.pst);
    $("relogio").textContent = T.relogio(p.t);
    $("relogio-data").textContent = "totalização · horário de Brasília";

    const trocas = s.trocas();
    const desde = trocas.length ? s.t[trocas[trocas.length - 1]] : s.t[0];
    partes($("diferenca"), quem
      ? ["Diferença: ", { forte: `${nomes[quem].curto} +${F.inteiro(Math.abs(p.margem))} votos` }, `, na frente desde ${T.curta(desde)}`]
      : [{ forte: "Empate" }]);

    const r = s.restante(i);
    const atras = quem === "a" ? nomes.b.curto : nomes.a.curto;
    if (p.sec >= s.totais.secoes) $("falta").textContent = "Todas as seções apuradas.";
    else if (r.definido) partes($("falta"), [{ forte: "Matematicamente definido" }, `: faltam ${F.inteiro(r.aptosFaltam)} eleitores aptos.`]);
    else partes($("falta"), [`Faltam cerca de ${F.quantos(r.validosFaltam, "votos válidos")}.`]);

    const a22 = em2022("pa", est.eixo === "tempo" ? p.t : p.pst);
    if (a22 === null) {
      $("comparacao-texto").textContent = "Em 2022, a esta altura, o TSE ainda não tinha divulgado parcial.";
    } else {
      const ponto = est.eixo === "tempo" ? `às ${T.curta(p.t)}` : `com ${F.pct(p.pst)} das seções`;
      const delta = p.pa - a22;
      const lista = [
        `Em 2022, ${ponto}, Lula tinha `,
        { forte: F.pct(a22) },
        " e Jair Bolsonaro, ",
        { forte: F.pct(100 - a22) },
        ". ",
      ];
      if (conj === vivo) {
        lista.push(Math.abs(delta) < 0.05
          ? "Lula está exatamente onde estava."
          : `Lula está ${F.pp(delta).replace("+", "").replace("−", "")} ${delta > 0 ? "acima" : "abaixo"} daquele ponto.`);
      }
      partes($("comparacao-texto"), lista);
    }
  }

  /* ---------- Cenários ---------- */

  function valorCenario(el, pa, nomes) {
    el.textContent = "";
    A.html("i", "chave bloco k-a", el);
    el.appendChild(document.createTextNode(`${nomes.a.curto} ${F.pct(pa)}`));
    A.html("span", "vs", el, "×");
    A.html("i", "chave bloco k-b", el);
    el.appendChild(document.createTextNode(`${nomes.b.curto} ${F.pct(100 - pa)}`));
  }

  function cenarioEstados(conj) {
    let a = 0;
    let b = 0;
    let cobertos = 0;
    const pendentes = [];
    for (const [uf, , , , , aptos] of UFS) {
      const u = conj.ufs[uf];
      if (!u || u.apuradas <= 0 || u.a + u.b <= 0) {
        pendentes.push(aptos);
        continue;
      }
      cobertos += aptos;
      const taxa = (u.a + u.b) / Math.max(1, u.aptosApurados);
      const faltam = Math.max(0, u.aptos - u.aptosApurados) * taxa;
      const pa = u.a / (u.a + u.b);
      a += u.a + faltam * pa;
      b += u.b + faltam * (1 - pa);
    }
    if (a + b <= 0) return null;
    return { pa: (a / (a + b)) * 100, cobertura: cobertos / TOTAIS.aptos, pendentes: pendentes.length };
  }

  function atualizarCenarios(conj) {
    const s = conj.serie;
    const nomes = conj.nomes;
    const n = s.n - 1;
    if (n >= 0 && s.sec[n] >= s.totais.secoes) {
      for (const id of ["cen-estados", "cen-sombra"]) valorCenario($(id), s.pa[n], nomes);
      $("cen-estados-nota").textContent = $("cen-sombra-nota").textContent = "Apuração concluída: este é o resultado.";
      atualizarVirar(s, nomes);
      return;
    }
    const ce = cenarioEstados(conj);
    if (ce && ce.cobertura >= 0.8) {
      valorCenario($("cen-estados"), ce.pa, nomes);
      $("cen-estados-nota").textContent =
        `Com dados de ${UFS.length - ce.pendentes} das ${UFS.length} unidades (${F.pct(ce.cobertura * 100, 0)} do eleitorado). Soma aos votos já apurados os que faltam em cada estado, na proporção atual daquele estado.`;
    } else {
      $("cen-estados").textContent = "—";
      $("cen-estados-nota").textContent = "Aparece quando houver parciais de estados com ao menos 80% do eleitorado. Soma aos votos já apurados os que faltam em cada estado, na proporção atual daquele estado.";
    }

    const i = s.n - 1;
    const a22 = i >= 0 && s.pst[i] >= 1 ? A.interpolar(S22.pst, S22.pa, s.pst[i]) : null;
    if (a22 !== null) {
      const pa = Math.max(0, Math.min(100, S22.pa[S22.n - 1] + (s.pa[i] - a22)));
      valorCenario($("cen-sombra"), pa, nomes);
      const final22 = S22.pa[S22.n - 1];
      $("cen-sombra-nota").textContent =
        `Em 2022, com ${F.pct(s.pst[i])} das seções, Lula tinha ${F.pct(a22)} e terminou com ${F.pct(final22)} (${F.pp(final22 - a22)}). O cenário aplica a mesma variação ao número de agora.`;
    } else {
      $("cen-sombra").textContent = "—";
      $("cen-sombra-nota").textContent = "Aparece a partir de 1% das seções. Aplica ao resultado final de 2022 a diferença entre Lula agora e Lula em 2022 com o mesmo percentual de seções.";
    }
    atualizarVirar(s, nomes);
  }

  function atualizarVirar(s, nomes) {
    const i = s.n - 1;
    if (i >= 0) {
      const r = s.restante(i);
      const quem = s.margem[i] > 0 ? "a" : "b";
      const atras = quem === "a" ? "b" : "a";
      const el = $("cen-virar");
      if (s.sec[i] >= s.totais.secoes) {
        el.textContent = "Apuração concluída";
        $("cen-virar-nota").textContent = `${nomes[quem].nome} terminou à frente por ${F.inteiro(Math.abs(s.margem[i]))} votos.`;
      } else if (r.definido) {
        el.textContent = "Matematicamente definido";
        $("cen-virar-nota").textContent = `A vantagem de ${nomes[quem].curto} supera os ${F.inteiro(r.aptosFaltam)} eleitores aptos que faltam apurar.`;
      } else if (r.precisa > 100) {
        el.textContent = `${nomes[atras].curto}: mais que 100%`;
        $("cen-virar-nota").textContent = `A diferença já é maior que os cerca de ${F.quantos(r.validosFaltam, "votos válidos")} esperados nas seções que faltam.`;
      } else {
        el.textContent = `${nomes[atras].curto} precisa de ${F.pct(r.precisa)}`;
        $("cen-virar-nota").textContent = `dos cerca de ${F.quantos(r.validosFaltam, "votos válidos")} que faltam, para empatar. Estimativa com a proporção de votos válidos por eleitor apto já apurada.`;
      }
    } else {
      $("cen-virar").textContent = "—";
      $("cen-virar-nota").textContent = "Parcela dos votos válidos que faltam de que quem está atrás precisa para empatar.";
    }
  }

  /* ---------- Estados ---------- */

  const tiles = {};
  const elEstados = document.querySelector(".estados");
  elEstados.style.position = "relative";
  const dicaUF = new A.Dica(elEstados);

  function montarMapa() {
    const mapa = $("mapa-uf");
    for (const [uf, nome, col, lin] of UFS) {
      const b = A.html("button", "uf", mapa);
      b.type = "button";
      b.style.gridColumn = String(col + 1);
      b.style.gridRow = String(lin + 1);
      b.dataset.uf = uf;
      const nivel = A.html("span", "uf-nivel", b);
      A.html("span", "uf-sigla", b, uf === "zz" ? "EXT" : uf.toUpperCase());
      const pct = A.html("span", "uf-pct", b, "—");
      tiles[uf] = { b, nivel, pct, nome };
      const mostrar = () => dicaEstado(uf);
      b.addEventListener("pointerenter", mostrar);
      b.addEventListener("focus", mostrar);
      b.addEventListener("click", mostrar);
      b.addEventListener("pointerleave", () => dicaUF.esconder());
      b.addEventListener("blur", () => dicaUF.esconder());
    }
  }

  function dicaEstado(uf) {
    const t = tiles[uf];
    const u = atual.ufs[uf];
    const nomes = atual.nomes;
    const caixa = t.b.getBoundingClientRect();
    const base = elEstados.getBoundingClientRect();
    const px = caixa.right - base.left;
    const py = caixa.top - base.top + caixa.height / 2;
    const linhas = [];
    const rodape = [];
    if (u && u.a + u.b > 0) {
      const pa = (u.a / (u.a + u.b)) * 100;
      linhas.push({ classe: "k-a", valor: F.pct(pa), rotulo: nomes.a.nome }, { classe: "k-b", valor: F.pct(100 - pa), rotulo: nomes.b.nome });
      rodape.push(`${F.pct((u.apuradas / u.secoes) * 100)} das seções apuradas`);
      rodape.push(`Diferença: ${F.inteiro(Math.abs(u.a - u.b))} votos`);
    } else {
      rodape.push("Sem parcial ainda");
    }
    dicaUF.mostrar(px, py, { titulo: t.nome, linhas, rodape });
  }

  function renderizarEstados() {
    const ufs = atual.ufs;
    const nomes = atual.nomes;
    const restantes = [];
    for (const [uf, nome, , , secoes, aptos] of UFS) {
      const t = tiles[uf];
      const u = ufs[uf];
      const pst = u ? (u.apuradas / (u.secoes || secoes)) * 100 : 0;
      const validos = u ? u.a + u.b : 0;
      const pa = validos ? (u.a / validos) * 100 : null;
      const lider = pa === null ? null : pa >= 50 ? "a" : "b";
      t.b.classList.toggle("l-a", lider === "a");
      t.b.classList.toggle("l-b", lider === "b");
      t.nivel.style.height = pst.toFixed(1) + "%";
      t.pct.textContent = pa === null ? "—" : F.pct(lider === "a" ? pa : 100 - pa, 0);
      t.b.setAttribute(
        "aria-label",
        pa === null
          ? `${nome}: sem parcial`
          : `${nome}: ${F.pct(pst, 0)} apurado, ${nomes[lider].nome} com ${F.pct(lider === "a" ? pa : 100 - pa)}`,
      );
      const faltam = u ? Math.max(0, u.aptos - u.aptosApurados) : aptos;
      restantes.push({ uf, nome, faltam, pst, pa, lider });
    }
    const lista = $("faltam");
    lista.textContent = "";
    const top = restantes.filter((r) => r.faltam > 0).sort((x, y) => y.faltam - x.faltam).slice(0, 6);
    if (!top.length) {
      A.html("li", "faltam-vazio", lista, "Todos os estados terminaram de apurar.");
      return;
    }
    for (const r of top) {
      const li = A.html("li", "faltam-item" + (r.lider ? " l-" + r.lider : ""), lista);
      A.html("strong", null, li, r.nome);
      A.html("span", "faltam-num", li, "faltam " + F.quantos(r.faltam, "eleitores"));
      const barra = A.html("span", "faltam-barra", li);
      A.html("i", null, barra).style.width = r.pst.toFixed(1) + "%";
      const quem = r.lider ? `${nomes[r.lider].curto} lidera com ${F.pct(r.lider === "a" ? r.pa : 100 - r.pa, 1)}` : "sem parcial";
      A.html("span", null, li, `${F.pct(r.pst, 1)} apurado · ${quem}`);
    }
  }

  /* ---------- Título e anúncios ---------- */

  const tituloOriginal = document.title;

  function atualizarTitulo(conj) {
    const s = conj.serie;
    if (conj !== vivo || !s.n) {
      document.title = tituloOriginal;
      return;
    }
    const i = s.n - 1;
    document.title = `${conj.nomes.a.curto} ${F.pct(s.pa[i])} × ${F.pct(s.pb[i])} ${conj.nomes.b.curto} · ${F.pct(s.pst[i], 0)} apurado`;
  }

  /* ---------- Histórico em CSV (publicado pelo TSE depois da eleição) ---------- */

  function lerHistoricoCSV(texto) {
    const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
    const limpa = (c) => c.trim().replace(/^"|"$/g, "").trim();
    const cab = linhas[0].split(";").map(limpa);
    const col = (nome) => cab.indexOf(nome);
    const cands = cab
      .map((c) => (c.match(/^(.+)_QT_VOTOS_TOT_ACUMULADO$/) || [])[1])
      .filter((c) => c && c !== "BRANCO" && c !== "NULO");
    if (cands.length !== 2) throw new Error("não encontrei os dois candidatos do 2º turno");
    const ca = cands.includes("LULA") ? "LULA" : cands[0];
    const cb = cands.find((c) => c !== ca);
    const idx = {
      eleicao: col("CD_ELEICAO"),
      data: col("DT_TOTALIZACAO"),
      ts: col("QT_SECOES_TOTAL"),
      te: col("QT_APTOS_TOTAL"),
      sec: col("QT_SECOES_TOT_ACUMULADO"),
      aptos: col("QT_APTOS_TOT_ACUMULADO"),
      a: col(ca + "_QT_VOTOS_TOT_ACUMULADO"),
      b: col(cb + "_QT_VOTOS_TOT_ACUMULADO"),
      br: col("BRANCO_QT_VOTOS_TOT_ACUMULADO"),
      nu: col("NULO_QT_VOTOS_TOT_ACUMULADO"),
    };
    if (Object.values(idx).some((v) => v < 0)) throw new Error("faltam colunas do histórico de totalização");
    const primeira = linhas[1].split(";").map(limpa);
    if (primeira[idx.eleicao] !== ELEICAO) throw new Error("este arquivo não é do 2º turno de 2026");
    const s = new A.Serie({ secoes: +primeira[idx.ts], aptos: +primeira[idx.te] });
    for (const linha of linhas.slice(1)) {
      const c = linha.split(";").map(limpa);
      const [d, h] = c[idx.data].split(" ");
      const quando = dataTSE(d, h);
      if (quando === null) continue;
      const t = (quando - FECHAMENTO) / 1000;
      if (s.n && t <= s.t[s.n - 1]) continue;
      s.adicionar({ t, sec: +c[idx.sec], aptos: +c[idx.aptos], a: +c[idx.a], b: +c[idx.b], outros: +c[idx.br] + +c[idx.nu] });
    }
    if (!s.n) throw new Error("nenhuma linha válida");
    return s;
  }

  /* ---------- Desenho geral ---------- */

  function renderizar() {
    const s = atual.serie;
    corrida.cfg.x = configX(s);
    margem.cfg.x = configX(s);
    corrida.cfg.y.dominio = dominioCorrida(s);
    margem.cfg.y.dominio = dominioMargem(s);
    corrida.desenhar();
    margem.desenhar();
    atualizarNomes(atual);
    atualizarPlacar(atual);
    atualizarCenarios(atual);
    renderizarEstados();
    atualizarTitulo(atual);
    atualizarStatus();
  }

  /* ---------- Montagem ---------- */

  $("url-br").textContent = URL_BR;
  montarMapa();
  recuperar();

  const gCorrida = $("g-corrida");
  const dicaCorrida = new A.Dica(gCorrida);
  const corrida = new A.Plot(gCorrida, {
    rotulo: "Linhas com o percentual de votos válidos em 2026, sobre faixas com a apuração de 2022",
    altura: (w) => (w < 560 ? 300 : 400),
    margem: (w) => ({ t: 20, r: w < 560 ? 58 : 124, b: 30, l: 42 }),
    x: configX(atual.serie),
    y: { dominio: dominioCorrida(atual.serie), ticks: (d) => A.ticksBonitos(d[0], d[1], 4), formato: (v) => v + "%" },
    aoDesenhar: desenharCorrida,
    aoPairar: (xv, px, py) => pairar("corrida", xv, px, py),
  });

  const gMargem = $("g-margem");
  const dicaMargem = new A.Dica(gMargem);
  const margem = new A.Plot(gMargem, {
    rotulo: "Diferença de votos em 2026, sobre a diferença de 2022",
    altura: (w) => (w < 560 ? 230 : 280),
    margem: (w) => ({ t: 14, r: w < 420 ? 58 : 66, b: 30, l: 50 }),
    x: configX(atual.serie),
    y: {
      dominio: dominioMargem(atual.serie),
      ticks: (d) => A.ticksBonitos(d[0], d[1], 4),
      formato: (v) => (v === 0 ? "0" : F.sinal(v) + F.compacto(v)),
    },
    aoDesenhar: desenharMargem,
    aoPairar: (xv, px, py) => pairar("margem", xv, px, py),
  });

  renderizar();
  lerColeta().then(lerBR);
  setInterval(() => {
    if (atual === vivo && (!vivo.ultimo || vivo.ultimo.apuradas === 0)) atualizarStatus();
  }, 1000);
  setInterval(() => {
    if (vivo.ultimo && vivo.ultimo.apuradas > 0 && !encerrada(vivo.ultimo)) lerColeta();
  }, 5 * 60000);

  /* ---------- Eventos ---------- */

  $("simular").addEventListener("click", iniciarSimulacao);
  $("nova-simulacao").addEventListener("click", iniciarSimulacao);
  $("sair-simulacao").addEventListener("click", sairSimulacao);
  $("atualizar").addEventListener("click", atualizarAgora);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && atual === vivo) atualizarAgora();
  });

  $("avisar").addEventListener("click", async () => {
    const botao = $("avisar");
    avisos = !avisos;
    botao.setAttribute("aria-pressed", String(avisos));
    botao.textContent = avisos ? "Avisos ligados" : "Avisar quando a liderança mudar";
    if (avisos) {
      bip();
      try {
        if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
      } catch (e) {
        /* sem permissão: o aviso fica no som e no anúncio */
      }
    }
  });

  A.aoEscolher("eixo", (v) => {
    est.eixo = v;
    pairar(null);
    renderizar();
  });

  let confirmarLimpeza = 0;
  $("limpar").addEventListener("click", () => {
    const botao = $("limpar");
    if (Date.now() > confirmarLimpeza) {
      confirmarLimpeza = Date.now() + 4000;
      botao.textContent = "Clique de novo para confirmar";
      setTimeout(() => {
        if (Date.now() > confirmarLimpeza) botao.textContent = "Apagar a curva guardada neste navegador";
      }, 4100);
      return;
    }
    confirmarLimpeza = 0;
    botao.textContent = "Apagar a curva guardada neste navegador";
    apagarGuardado();
    renderizar();
  });

  $("csv").addEventListener("change", async (e) => {
    const arquivo = e.target.files && e.target.files[0];
    if (!arquivo) return;
    const status = $("csv-status");
    try {
      const texto = new TextDecoder("iso-8859-1").decode(await arquivo.arrayBuffer());
      vivo.serie = lerHistoricoCSV(texto);
      vivo.fonte = "csv";
      guardar();
      if (atual !== vivo) sairSimulacao();
      else renderizar();
      status.textContent = `${F.inteiro(vivo.serie.n)} registros carregados de ${arquivo.name}.`;
    } catch (err) {
      status.textContent = `Não consegui usar este arquivo: ${err.message}.`;
    }
    e.target.value = "";
  });

  /* Teclado no gráfico principal: setas percorrem o eixo mostrando a dica. */
  let cursorTeclado = null;
  gCorrida.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(e.key)) return;
    e.preventDefault();
    if (e.key === "Escape") {
      cursorTeclado = null;
      pairar(null);
      return;
    }
    const [d0, d1] = corrida.cfg.x.dominio;
    const passo = est.eixo === "tempo" ? 60 : 0.5;
    if (cursorTeclado === null) cursorTeclado = atual.serie.n ? xs(atual.serie)[atual.serie.n - 1] : d0;
    if (e.key === "ArrowLeft") cursorTeclado -= passo;
    if (e.key === "ArrowRight") cursorTeclado += passo;
    if (e.key === "Home") cursorTeclado = d0;
    if (e.key === "End") cursorTeclado = d1;
    cursorTeclado = Math.max(d0, Math.min(d1, cursorTeclado));
    pairar("corrida", cursorTeclado, corrida.x(cursorTeclado), corrida.m.t + 40);
  });
  gCorrida.addEventListener("blur", () => {
    cursorTeclado = null;
    pairar(null);
  });
})();

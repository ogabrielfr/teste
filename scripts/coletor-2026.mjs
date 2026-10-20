#!/usr/bin/env node
/* Coletor da apuração de 2026.

   O TSE publica só o placar do momento. Este script lê o placar nacional a cada
   15 segundos e grava a série em dados/2026-2t-coleta.json; a página 2026.html usa
   esse arquivo para mostrar a curva desde as 17h a quem abrir a página mais tarde.

   Uso:
     node scripts/coletor-2026.mjs                  # só grava o arquivo
     node scripts/coletor-2026.mjs --commit 360     # também faz commit e push a cada 6 min
     node scripts/coletor-2026.mjs --ate 2026-10-26T03:00:00Z --intervalo 15
*/
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

const ELEICAO = "6258"; // 2º turno federal de 2026
const URL_PADRAO = `https://resultados.tse.jus.br/oficial/ele2026/${ELEICAO}/dados/br/br-c0001-e${ELEICAO.padStart(6, "0")}-u.json`;
const FECHAMENTO = Date.parse("2026-10-25T17:00:00-03:00");

function opcoes(argv) {
  const o = { ate: "2026-10-26T03:00:00Z", intervalo: 15, commit: 0, saida: "dados/2026-2t-coleta.json", url: URL_PADRAO };
  for (let i = 0; i < argv.length; i += 2) {
    const chave = argv[i].replace(/^--/, "");
    if (!(chave in o)) throw new Error(`opção desconhecida: ${argv[i]}`);
    o[chave] = typeof o[chave] === "number" ? Number(argv[i + 1]) : argv[i + 1];
  }
  o.ate = Date.parse(o.ate);
  return o;
}

const numero = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function dataTSE(d, h) {
  if (!d || !h) return null;
  const [dia, mes, ano] = String(d).split("/");
  const t = Date.parse(`${ano}-${mes}-${dia}T${h}-03:00`);
  return Number.isFinite(t) ? t : null;
}

/* Mesmo recorte que a página faz do arquivo "-u.json" do TSE. */
function lerTSE(json) {
  const votos = {};
  for (const cargo of json.carg || []) {
    for (const agr of cargo.agr || []) {
      for (const par of agr.par || []) {
        for (const c of par.cand || []) votos[String(c.n)] = numero(c.vap);
      }
    }
  }
  if (!("13" in votos) || !("22" in votos)) throw new Error("candidatos 13 e 22 não encontrados");
  return {
    totalizado: dataTSE(json.dt, json.ht),
    secoes: numero(json.s.ts),
    apuradas: numero(json.s.st),
    aptos: numero(json.e.te),
    aptosApurados: numero(json.e.est),
    a: votos["13"],
    b: votos["22"],
    outros: numero(json.v.vb) + numero(json.v.tvn),
    encerrada: json.tf === "s" || json.and === "f",
  };
}

async function carregar(saida) {
  try {
    const dados = JSON.parse(await readFile(saida, "utf8"));
    if (dados.eleicao === ELEICAO && Array.isArray(dados.pontos)) return dados;
  } catch {
    /* primeiro uso: começa vazio */
  }
  return { eleicao: ELEICAO, fonte: URL_PADRAO, candidatos: { a: "13", b: "22" }, totais: null, atualizado: null, pontos: [] };
}

async function gravar(saida, dados) {
  await mkdir(dirname(saida), { recursive: true });
  const tmp = saida + ".tmp";
  await writeFile(tmp, JSON.stringify(dados) + "\n");
  await rename(tmp, saida);
}

function git(...args) {
  return execFileSync("git", args, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

function publicar(saida, pontos) {
  try {
    git("add", saida);
    if (!git("status", "--porcelain", "--", saida)) return;
    git("commit", "-m", `Coleta da apuração 2026: ${pontos} instantes`);
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        git("push");
        return;
      } catch {
        git("pull", "--rebase", "--autostash");
      }
    }
    console.error("push falhou três vezes; tenta de novo no próximo ciclo");
  } catch (e) {
    console.error("git:", e.message);
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const o = opcoes(process.argv.slice(2));
  const dados = await carregar(o.saida);
  let ultimoCommit = Date.now();
  let pendente = false;
  console.log(`Coletando ${o.url} até ${new Date(o.ate).toISOString()} (${dados.pontos.length} instantes já gravados).`);

  while (Date.now() < o.ate) {
    try {
      const r = await fetch(o.url, { headers: { "cache-control": "no-cache" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const snap = lerTSE(await r.json());
      dados.totais = { secoes: snap.secoes, aptos: snap.aptos };
      const anterior = dados.pontos[dados.pontos.length - 1];
      if (snap.totalizado && snap.apuradas > 0) {
        const t = (snap.totalizado - FECHAMENTO) / 1000;
        if (!anterior || (t > anterior[0] && snap.apuradas >= anterior[1])) {
          dados.pontos.push([t, snap.apuradas, snap.aptosApurados, snap.a, snap.b, snap.outros]);
          dados.atualizado = new Date().toISOString();
          await gravar(o.saida, dados);
          pendente = true;
          console.log(`${new Date().toISOString()} ${(100 * snap.apuradas / snap.secoes).toFixed(2)}% apurado`);
        }
      }
      if (snap.encerrada && snap.apuradas >= snap.secoes) {
        console.log("Apuração encerrada.");
        break;
      }
    } catch (e) {
      console.error(new Date().toISOString(), "falha ao ler o TSE:", e.message);
    }
    if (o.commit && pendente && Date.now() - ultimoCommit >= o.commit * 1000) {
      publicar(o.saida, dados.pontos.length);
      ultimoCommit = Date.now();
      pendente = false;
    }
    await dormir(o.intervalo * 1000);
  }
  if (o.commit && pendente) publicar(o.saida, dados.pontos.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

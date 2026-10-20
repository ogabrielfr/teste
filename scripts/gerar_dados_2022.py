"""Gera dados/2022-2t-br.js a partir do histórico de totalização do TSE.

Fonte: Portal de Dados Abertos do TSE, "Histórico de totalização - Presidente
(BR) - 2º turno 2022" (zip com o CSV e o leiame.pdf). Uso:

    python3 scripts/gerar_dados_2022.py

O CSV traz uma linha por instante de totalização, com valores do instante
(QT_*_TOT) e acumulados (QT_*_TOT_ACUMULADO). O arquivo gerado guarda apenas os
incrementos de cada instante, em colunas, e a página reconstrói os acumulados
somando. O script confere que essa soma bate com os acumulados do TSE.
"""

import csv
import io
import json
import zipfile
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ZIP = RAIZ / "dados" / "fonte" / "Historico_Totalizacao_Presidente_BR_2T_2022.zip"
CSV = "Historico_Totalizacao_Presidente_BR_2T_2022.csv"
SAIDA = RAIZ / "dados" / "2022-2t-br.js"

# Instante zero da série: fechamento das urnas, 17h de Brasília.
INICIO = datetime(2022, 10, 30, 17, 0, 0)

COLUNAS = {
    "sec": "QT_SECOES_TOT",
    "aptos": "QT_APTOS_TOT",
    "lula": "LULA_QT_VOTOS_TOT",
    "bolsonaro": "JAIR_BOLSONARO_QT_VOTOS_TOT",
    "brancos": "BRANCO_QT_VOTOS_TOT",
    "nulos": "NULO_QT_VOTOS_TOT",
}


def ler_linhas():
    with zipfile.ZipFile(ZIP) as z, z.open(CSV) as bruto:
        texto = io.TextIOWrapper(bruto, encoding="latin-1", newline="")
        leitor = csv.reader(texto, delimiter=";")
        cabecalho = [c.strip() for c in next(leitor)]
        for linha in leitor:
            yield dict(zip(cabecalho, (c.strip() for c in linha)))


def main():
    linhas = list(ler_linhas())
    if not linhas:
        raise SystemExit("CSV vazio")

    total_secoes = int(linhas[0]["QT_SECOES_TOTAL"])
    total_aptos = int(linhas[0]["QT_APTOS_TOTAL"])

    serie = {"t": []}
    serie.update({k: [] for k in COLUNAS})
    acumulado = {k: 0 for k in COLUNAS}
    anterior = None
    pontos = []  # acumulados por instante, para calcular os momentos

    for d in linhas:
        if d["SG_UE_UF"] != "BR":
            raise SystemExit(f"UF inesperada: {d['SG_UE_UF']}")
        quando = datetime.strptime(d["DT_TOTALIZACAO"], "%d/%m/%Y %H:%M:%S")
        if anterior and quando <= anterior:
            raise SystemExit(f"Instantes fora de ordem em {quando}")
        anterior = quando

        serie["t"].append(int((quando - INICIO).total_seconds()))
        for chave, coluna in COLUNAS.items():
            valor = int(d[coluna])
            serie[chave].append(valor)
            acumulado[chave] += valor
            esperado = int(d[coluna + "_ACUMULADO"])
            if acumulado[chave] != esperado:
                raise SystemExit(f"{coluna}: soma {acumulado[chave]} != {esperado} em {quando}")

        soma_votos = sum(int(d[COLUNAS[k]]) for k in ("lula", "bolsonaro", "brancos", "nulos"))
        if soma_votos != int(d["QT_VOTOS_TOTAL"]):
            raise SystemExit(f"Votos do instante não fecham em {quando}")

        pontos.append(dict(acumulado, t=serie["t"][-1]))

    momentos = calcular_momentos(pontos, total_secoes, total_aptos)

    dados = {
        "fonte": {
            "nome": "TSE — Histórico de totalização, Presidente, BR, 2º turno 2022",
            "arquivo": CSV,
            "url": "https://dadosabertos.tse.jus.br/",
        },
        "inicio": "2022-10-30T17:00:00-03:00",
        "totais": {"secoes": total_secoes, "aptos": total_aptos},
        "candidatos": [
            {"id": "lula", "nome": "Lula", "numero": 13, "partido": "PT"},
            {"id": "bolsonaro", "nome": "Jair Bolsonaro", "numero": 22, "partido": "PL"},
        ],
        "incrementos": serie,
        "momentos": momentos,
    }

    js = (
        "// Gerado por scripts/gerar_dados_2022.py. Não edite à mão.\n"
        "// Incrementos por instante de totalização; acumule para obter os totais.\n"
        "window.APURACAO_2022 = "
        + json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    SAIDA.write_text(js, encoding="utf-8")

    final = pontos[-1]
    print(f"{len(pontos)} instantes, {SAIDA.stat().st_size / 1024:.0f} KB -> {SAIDA.relative_to(RAIZ)}")
    print(f"Final: Lula {final['lula']:,} x Bolsonaro {final['bolsonaro']:,}")
    for m in momentos:
        print(f"  {m['id']:<22} i={m['i']:<5} t={m['t']:<6} {m.get('nota', '')}")


def lider(p):
    if p["lula"] > p["bolsonaro"]:
        return "lula"
    if p["bolsonaro"] > p["lula"]:
        return "bolsonaro"
    return None


def calcular_momentos(pontos, total_secoes, total_aptos):
    """Índices dos instantes que a página destaca, calculados a partir da série."""
    n = len(pontos)
    lideres = [lider(p) for p in pontos]
    trocas = [i for i in range(1, n) if lideres[i] != lideres[i - 1]]

    bolsonaro_assume = next(i for i in range(n) if lideres[i] == "bolsonaro")
    pico = max(range(n), key=lambda i: pontos[i]["bolsonaro"] - pontos[i]["lula"])
    metade = next(i for i in range(n) if pontos[i]["sec"] * 2 >= total_secoes)
    primeira_virada = next(i for i in range(pico, n) if lideres[i] == "lula")
    # A partir daqui Lula não perde mais a liderança.
    definitiva = next(i for i in range(n) if all(l == "lula" for l in lideres[i:]))
    trocas_gangorra = [i for i in trocas if primeira_virada <= i <= definitiva]
    mais_apertado = min(range(primeira_virada, definitiva + 1),
                        key=lambda i: abs(pontos[i]["lula"] - pontos[i]["bolsonaro"]))

    def vantagem_garantida(i):
        p = pontos[i]
        restantes = total_aptos - p["aptos"]
        return abs(p["lula"] - p["bolsonaro"]) > restantes

    matematica = next(i for i in range(n) if all(vantagem_garantida(j) for j in range(i, n)))

    def m(ident, i, **extra):
        return {"id": ident, "i": i, "t": pontos[i]["t"], **extra}

    return [
        m("abertura", 0),
        m("bolsonaro_assume", bolsonaro_assume),
        m("pico_bolsonaro", pico,
          nota=f"vantagem de {pontos[pico]['bolsonaro'] - pontos[pico]['lula']} votos"),
        m("metade", metade),
        m("gangorra", primeira_virada, ate=definitiva, trocas=len(trocas_gangorra),
          mais_apertado=mais_apertado,
          nota=f"{len(trocas_gangorra)} trocas até i={definitiva}; menor margem em i={mais_apertado}"),
        m("virada_definitiva", definitiva),
        m("matematica", matematica, restantes=total_aptos - pontos[matematica]["aptos"]),
        m("final", n - 1, trocas_total=len(trocas)),
    ]


if __name__ == "__main__":
    main()

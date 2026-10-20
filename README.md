# Apuração do 2º turno: 2022 e 2026 ao vivo

Duas páginas interativas sobre a apuração da eleição presidencial, feitas com os dados do TSE.

| Página | O que faz |
| --- | --- |
| `2022.html` · **A virada de 2022** | Reproduz, segundo a segundo, a totalização do 2º turno entre Lula e Jair Bolsonaro. Tem botão Começar, quatro velocidades, pausa automática nos momentos-chave, câmera lenta na "gangorra" das 18h42, linha do tempo arrastável, eixo por horário ou por % de seções, gráfico da diferença em votos, gráfico dos votos que chegavam a cada 5 minutos e tabela de 15 em 15 minutos. |
| `2026.html` · **2026 ao vivo, com a sombra de 2022** | No domingo, 25/10/2026, lê a totalização do TSE no navegador a cada 15 segundos (Lula × Flávio Bolsonaro) e desenha a corrida por cima da curva de 2022, comparando no mesmo % de seções apuradas. Mostra os estados num mapa de quadradinhos, onde estão os votos que faltam, três cenários aritméticos para o resultado e avisa (som e notificação) quando a liderança muda. Antes da eleição, mostra uma contagem regressiva e oferece uma simulação com números fictícios. |
| `index.html` | Página de entrada com as duas versões. |

Não há dependências nem etapa de build: são arquivos estáticos (HTML, CSS e JavaScript puro).

## Como abrir

- **GitHub Pages (recomendado para o ao vivo):** em *Settings → Pages*, escolha *Deploy from a branch*, o branch `claude/gracious-hopper-3c4p79` e a pasta `/ (root)`. O site fica em `https://ogabrielfr.github.io/teste/`.
- **No computador:** `python3 -m http.server 8000` nesta pasta e abra `http://localhost:8000/`. Abrir o `2026.html` direto pelo arquivo também funciona.
- No visualizador de artifacts do Claude, a página 2026 não consegue falar com o TSE (o visualizador bloqueia conexões externas). Ela avisa isso e continua mostrando a sombra de 2022 e a simulação.

## Como a página 2026 lê o TSE

Os endereços vêm da configuração pública do site de resultados, `https://resultados.tse.jus.br/oficial/comum/config/ele-c.json`, que lista o pleito de 25/10/2026 com a eleição `6258` (Eleição Ordinária Federal 2026, 2º turno).

- Placar nacional: `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json`
- Por estado: `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/<uf>/<uf>-c0001-e006258-u.json` (inclui `zz`, exterior)
- Campos usados: `s.st` e `s.ts` (seções apuradas e total), `e.est` e `e.te` (eleitores aptos apurados e total), `v.vb` e `v.tvn` (brancos e nulos), `carg[].agr[].par[].cand[]` com `n` (número) e `vap` (votos), `dt`/`ht` (hora da totalização) e `tf`/`and` (apuração finalizada).
- O servidor do TSE responde com `Access-Control-Allow-Origin`, então o navegador lê os arquivos direto, sem servidor intermediário. Os arquivos do 2º turno já estão publicados, zerados, desde 15/10.
- Em 2022 o placar ficava em `dados-simplificados/.../-r.json`. Em 2026 o caminho mudou para `dados/.../-u.json`, que é o que o site oficial usa.

O TSE publica só o placar do momento, sem histórico. A curva de 2026 começa quando a página é aberta e fica guardada no navegador (recarregar não apaga). Para quem abrir tarde, há duas saídas:

1. **Coletor (opcional):** `scripts/coletor-2026.mjs` lê o placar nacional a cada 15 s e grava `dados/2026-2t-coleta.json`; a página publicada no GitHub Pages junta esse arquivo à curva. O workflow `.github/workflows/coletor-2026.yml` roda o coletor no GitHub Actions e faz commit a cada 6 minutos. Ele **só roda se você ligar**: pela aba *Actions → Coletor da apuração 2026 → Run workflow* no domingo, ou criando a variável de repositório `COLETOR_2026` com o valor `ligado` para a execução agendada das 16h37 de Brasília.
2. **Histórico oficial:** depois da eleição o TSE costuma publicar o histórico completo de totalização no Portal de Dados Abertos (como o arquivo de 2022 usado aqui). Em *Como esta página lê o TSE → Carregar histórico (CSV do TSE)* a página aceita esse CSV e redesenha a noite inteira.

## Dados de 2022

- Fonte: `dados/fonte/Historico_Totalizacao_Presidente_BR_2T_2022.zip` (TSE, *Histórico de totalização · Presidente · BR · 2º turno 2022*), com 5.286 registros entre 17h00min51s de 30/10 e 00h18min04s de 31/10.
- `python3 scripts/gerar_dados_2022.py` gera `dados/2022-2t-br.js`: os incrementos de cada instante, em colunas, e os momentos-chave calculados a partir da série. O script confere que a soma dos incrementos bate com os acumulados do próprio TSE.
- Momentos calculados: primeira parcial (17h00, Lula 50,59%), Bolsonaro assume (17h07), maior vantagem de Bolsonaro (790.791 votos às 17h56), metade das seções (18h26), a gangorra (5 trocas de liderança entre 18h42min53s e 18h44min50s), a virada (18h44min50s, 68,32% das seções, por 48 votos), matematicamente eleito (19h56min20s, quando a vantagem superou os eleitores aptos que faltavam) e o fim (Lula 50,90%, diferença de 2.139.645 votos).

## Estrutura

```
index.html, 2022.html, 2026.html   páginas
assets/apuracao.css                estilos e cores (tema claro e escuro)
assets/apuracao.js                 formatação, séries e gráficos SVG compartilhados
assets/pagina-2022.js              reprodução de 2022
assets/pagina-2026.js              leitura do TSE, simulação, estados e cenários
dados/                             dados de 2022 e, no domingo, a coleta de 2026
scripts/                           geração dos dados de 2022 e coletor de 2026
```

## Limites

- Os cenários da página 2026 são contas com o que já foi apurado, não previsões.
- Navegadores reduzem a frequência de leitura em abas em segundo plano; ao voltar para a aba, a página atualiza na hora.
- Resultado oficial é o divulgado pelo TSE.

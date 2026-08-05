# Compara Interativa

Dashboard interno para a equipe **comercial e marketing** visualizar empreendimentos
num mapa e **comparar dois deles lado a lado** — características e fluxos de pagamento,
com o melhor indicador de cada linha destacado automaticamente.

Uso interno, base única compartilhada, sem login (não é multiusuário).

---

## Como rodar

Requisitos: **Node 20 ou superior**.

```bash
npm install     # instala tudo (raiz, api e web)
npm run dev     # sobe a API e a interface juntas
```

Abra **http://localhost:5273**.

A base nasce **vazia**. Para conhecer a ferramenta com dados fictícios:

```bash
npm run seed          # insere 3 empreendimentos de exemplo (prefixados com "[exemplo]")
npm run seed:limpar   # remove só os exemplos, preservando o que você cadastrou
```

### Outros comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | API (:3210) + interface (:5273) em modo desenvolvimento |
| `npm run build` | Gera a versão de produção da interface em `web/dist` |
| `npm run start` | Sobe só a API |
| `npm run typecheck` | Confere os tipos do TypeScript |

---

## O que a ferramenta faz

**Mapa** — cada empreendimento é um marcador; ao passar o mouse aparece um resumo
(nome, construtora, localização e valor do m²) e ao clicar ele é selecionado. Tem zoom
e agrupa os marcadores em *clusters* quando há muitos empreendimentos próximos.
Usa Leaflet com OpenStreetMap: **sem token, sem conta, sem custo**.

**Painel de detalhes** (lado direito) — galeria de fotos, nome, construtora, localização,
dormitórios, metragem, valor do m², status, entrega, as **unidades** e os fluxos de pagamento.
A capa navega entre as fotos e um clique amplia em tela cheia (setas e Esc no teclado).

**Comparativo A vs B** — a tela se divide comparando os dois empreendimentos.
O melhor indicador de cada linha fica **destacado em verde**, e o cabeçalho mostra
quantos indicadores cada lado venceu. Escolhendo uma **unidade** de cada lado, entra
também a tabela unidade × unidade (metragem, dormitórios, vagas, andar, posição e preço).

**Filtros e busca** — cidade, construtora, tipo, status, dormitórios, faixa de metragem
e faixa de valor do m²; busca por nome, construtora, cidade ou bairro (ignora acentos:
"agua verde" encontra "Água Verde").

**Indicadores** — quantidade de empreendimentos, preço médio do m², maior e menor
metragem, mais barato e mais caro (esses dois são clicáveis e levam ao empreendimento).

**Calculadora do CUB** — dentro do cadastro, o botão **Calcular valor com CUB** simula
a evolução das parcelas até o fim da obra e vira um fluxo de pagamento pronto.

---

## Cadastro em três etapas

O botão **Adicionar empreendimento** abre um formulário de três etapas (com o cadastro
salvo, dá para pular de uma para outra clicando no título da etapa):

**1. Dados do empreendimento** — nome (único campo obrigatório), construtora, cidade,
bairro, endereço, latitude, longitude, valor médio do m², metragem mínima e máxima,
dormitórios, suítes, banheiros, vagas, status da obra, entrega prevista, tipo,
fotos e observações.

> Sem **latitude e longitude** o empreendimento é cadastrado normalmente, mas não
> aparece no mapa. O painel avisa quantos estão nessa situação.

**Fotos** — arraste os arquivos (ou escolha do computador) direto no formulário: JPG, PNG,
WEBP, GIF ou AVIF, até 12 MB cada. A **primeira foto é a capa** — arraste as miniaturas para
reordenar ou use o botão de alvo para promover uma delas. Escolher fotos antes de salvar
funciona: elas sobem assim que o cadastro é criado. Os arquivos ficam em
`api/data/uploads/` (fora do Git, como o banco) e são servidos em `/uploads/<arquivo>`.
Excluir a foto — ou o empreendimento inteiro — apaga o arquivo do disco.

**2. Unidades** — as plantas que o corretor vende. Cada uma tem identificação, torre/bloco,
andar e número, posição solar (Norte, Sul, Leste, Oeste e as diagonais) e face (frente, fundos,
lateral, esquina), metragem privativa e total, dormitórios, suítes, banheiros, vagas, valor,
valor do m² e situação (disponível, reservada, vendida). **Cada unidade tem os próprios fluxos
de pagamento**, abertos dentro do cartão dela.

> O valor do m² da unidade é calculado a partir do preço e da metragem privativa — informe
> só se quiser sobrescrever. Com unidades cadastradas, o painel passa a mostrar a **faixa**
> delas (metragem, dormitórios e vagas) no lugar dos campos gerais.

**3. Fluxos de pagamento** — as tabelas que valem para o **empreendimento inteiro**.
Um empreendimento pode ter **vários** (tabela padrão, plano obra, à vista…), cada um com
entrada, parcelamento, reforços, chaves, financiamento, descrição livre e observações.
No comparativo, o seletor de fluxo mostra primeiro as tabelas da unidade escolhida e
depois as gerais.

---

## Calculadora do CUB

O botão **Calcular valor com CUB** aparece junto dos fluxos de pagamento — tanto nos
gerais do empreendimento quanto nos de cada unidade (aí o valor do imóvel já vem
preenchido com o valor da unidade).

**O que você informa:** valor do imóvel (opcional, só referência), **valor de entrada**,
parcela inicial, meses restantes de obra e o percentual mensal do CUB — com atalhos para
0,35%, 0,60%, 0,70%, 0,75% e 1,00%. Os campos aceitam `2.000,50`, `2000.50` ou `R$ 2.000`.

A **entrada abate o valor do imóvel**: o resumo mostra o *saldo após a entrada* (o que as
parcelas atacam), o *desembolso até a entrega* (entrada + parcelas) e o *saldo na entrega*
— o que sobra para financiar quando a obra termina. Entrada maior que o valor do imóvel é
recusada, e uma entrada que faça as parcelas passarem do saldo aparece como
"pago a mais que o saldo".

**Como a conta é feita:** juros compostos sobre a parcela, mês a mês —
`parcela do mês = parcela anterior × (1 + CUB)`. O **valor do imóvel não entra na
conta**; o reajuste incide só sobre a parcela.

> A parcela é **arredondada em centavos a cada mês** antes do próximo reajuste, que é
> como a construtora emite o boleto (o mês seguinte corrige o valor efetivamente
> cobrado). Com 2.000,00 a 0,70% isso dá 2.014,00 → 2.028,10 → 2.042,30. O modo de
> precisão total existe (`arredondarPorMes: false`) e difere em centavos.

**O que você vê:** o resumo em destaque (entrada e saldo, parcela final, total pago na
obra, entrada + parcelas, saldo na entrega, total de reajuste e percentual acumulado), a
tabela mês a mês (parcela antes, % do CUB, valor do reajuste, parcela atual e
acumulado pago) e três gráficos — evolução da parcela, reajuste de cada mês e total
pago acumulado. Todos desenhados em SVG no próprio projeto, com tooltip ao passar o
mouse; **a tabela é a leitura exata** — nenhum valor existe só no gráfico.

**Botões:** *Simular*, *Limpar*, *Exportar PDF*, *Exportar Excel* e
**Gerar fluxo de pagamento**.

- **Exportar Excel** baixa um `.csv` com BOM e separador `;` — abre no Excel em
  português com dois cliques, sem passar por biblioteca nenhuma.
- **Exportar PDF** abre a folha de impressão do navegador com o **resumo e a tabela mês
  a mês** — é só escolher "Salvar como PDF". Os gráficos ficam só na tela; no papel a
  tabela cumpre o papel deles. Se o navegador bloquear pop-up, a tela avisa.
- **Gerar fluxo de pagamento** cria o fluxo com o nome `CUB 0,70% · 36x`, o número de
  parcelas, a parcela inicial, a entrada (em R$ e em % do imóvel) e um resumo na descrição.
  O fluxo guarda os parâmetros da simulação (`cub_percentual`, `cub_meses`,
  `cub_valor_imovel`, `cub_parcela_inicial`, `cub_entrada`) e ganha o selo **CUB** no cartão.

### Trocar o percentual fixo pela tabela oficial

O cálculo não sabe de onde vem o percentual: ele pergunta a uma **fonte de índice**
(`web/src/lib/cub.ts`).

```ts
interface FonteIndice {
  descricao: string
  percentualDoMes: (mes: number) => number   // 1 = primeiro mês de obra
}
```

Hoje a calculadora passa `indiceFixo(0.7)`. Quando existir a tabela oficial, passe
`indiceDaTabela([0.62, 0.58, 0.71, …], reserva)` no lugar — a mesma função `simular()`
roda sem alteração, e a coluna "% CUB" da tabela passa a mostrar o índice de cada mês
sozinha. Meses além da tabela caem no percentual de reserva, então uma tabela curta
não zera o resto da simulação.

---

## Como o "melhor indicador" é decidido

O destaque verde só aparece quando **os dois lados têm o dado preenchido** — se um
estiver em branco, ninguém vence (destacar seria enganoso). Valores iguais viram *empate*.

| Indicador | Vence |
|---|---|
| Valor médio do m² | o **menor** |
| Metragem mínima e máxima | a **maior** |
| Dormitórios, suítes, banheiros, vagas | o **maior** |
| Status da obra | a obra **mais avançada** |
| Entrega prevista | a **mais próxima** |
| Valor da unidade e valor do m² | o **menor** |
| Metragem da unidade (privativa e total) | a **maior** |
| Andar | o **mais alto** |
| Posição solar, face, torre e situação | ninguém — é preferência do cliente |
| Entrada | a **menor** (exige menos caixa) |
| Parcelamento | **mais** parcelas (dilui o desembolso) |
| Reforços | **menos** reforços |
| Chaves | o **menor** percentual |
| Financiamento | o **maior** percentual |

Essas regras ficam todas em `web/src/lib/comparar.ts` — cada uma tem uma `direcao`
(`maior` ou `menor`) e um texto de critério que aparece ao passar o mouse na linha.
Para mudar qualquer uma, basta trocar a direção ali; a interface se ajusta sozinha.

---

## Como o projeto é organizado

```
compara-interativa/
├── api/                     API local (Fastify + SQLite)
│   ├── src/
│   │   ├── db.js            schema das tabelas e sanitização dos campos
│   │   ├── server.js        rotas REST
│   │   └── seed.js          exemplos opcionais
│   └── data/
│       ├── compara.db       o banco inteiro (criado no 1º start, fora do Git)
│       └── uploads/         as fotos enviadas (fora do Git)
└── web/                     interface (React + TypeScript + Vite)
    └── src/
        ├── components/      Mapa, PainelDetalhe, Comparativo, formulários…
        ├── lib/
        │   ├── comparar.ts  regras do "melhor indicador"
        │   ├── cub.ts       simulação do CUB (fonte de índice plugável)
        │   ├── exportarSimulacao.ts  CSV para Excel e folha de impressão"
        │   ├── dashboard.ts filtros, busca e cálculo dos indicadores
        │   ├── format.ts    formatação em pt-BR (R$, m², datas)
        │   ├── imagens.ts   capa e galeria de cada empreendimento
        │   ├── unidades.ts  rótulo, posição, valor do m² e faixas das unidades
        │   └── opcoes.ts    status da obra, tipos e suas ordens
        └── styles/          design system (tokens.css) e estilos
```

**Banco de dados:** um único arquivo SQLite em `api/data/compara.db`. Backup é copiar
esse arquivo; ele **não vai para o Git** (cada instalação tem os próprios dados).

**Quatro tabelas:** `empreendimentos`, `unidades`, `fluxos_pagamento` e `imagens` — tudo 1:N
com cascata (excluir o empreendimento leva unidades, fluxos e fotos; excluir a unidade leva os
fluxos dela). Da foto, o banco guarda só o nome do arquivo, o nome original e a posição; o
arquivo em si vive em `api/data/uploads/`.

O fluxo de pagamento tem `unidade_id`: **em branco = tabela geral** do empreendimento,
preenchido = tabela daquela unidade. As colunas `cub_*` guardam os parâmetros da
simulação que gerou o fluxo (ficam nulas nos fluxos digitados à mão). Foi assim que as tabelas já cadastradas continuaram
valendo quando as unidades entraram.

### Rotas da API

| Método | Rota | Faz |
|---|---|---|
| `GET` | `/api/empreendimentos` | lista tudo com os fluxos aninhados |
| `GET` | `/api/empreendimentos/:id` | busca um |
| `POST` | `/api/empreendimentos` | cria |
| `PUT` | `/api/empreendimentos/:id` | edita (só os campos enviados) |
| `DELETE` | `/api/empreendimentos/:id` | exclui (leva os fluxos junto) |
| `POST` | `/api/fluxos` | cria fluxo |
| `PUT` | `/api/fluxos/:id` | edita fluxo |
| `DELETE` | `/api/fluxos/:id` | exclui fluxo |
| `GET` | `/api/empreendimentos/:id/unidades` | lista as unidades com os fluxos delas |
| `POST` | `/api/unidades` | cria unidade |
| `PUT` | `/api/unidades/:id` | edita unidade |
| `DELETE` | `/api/unidades/:id` | exclui unidade (leva os fluxos dela) |
| `POST` | `/api/empreendimentos/:id/imagens` | envia fotos (multipart, várias de uma vez) |
| `PUT` | `/api/empreendimentos/:id/imagens/ordem` | reordena — o primeiro id vira a capa |
| `DELETE` | `/api/imagens/:id` | exclui a foto e o arquivo do disco |
| `GET` | `/uploads/<arquivo>` | serve a foto enviada |
| `GET` | `/api/health` | status da API |

---

## Notas técnicas

- **Sem dependências externas em tempo de execução** além dos tiles do OpenStreetMap:
  as fontes são as do sistema, e os ícones e os gráficos são SVG desenhados no próprio
  projeto — sem biblioteca de gráfico, sem gerador de PDF, sem CDN.
- **Campo em branco vira `NULL`**, nunca `0` ou string vazia — é o que permite ao
  comparativo distinguir "não informado" de "zero".
- A interface carrega a base inteira e trabalha em memória (filtros, busca e comparativo
  são instantâneos). Para uso interno com dezenas ou centenas de empreendimentos, sobra folga.
- **Upload sem biblioteca de imagem:** o arquivo é gravado em streaming com nome gerado
  (`randomUUID`) — o nome enviado pelo cliente nunca toca o disco. Arquivo fora dos formatos
  aceitos ou acima de 12 MB é recusado com o motivo, **sem derrubar o resto do lote**.
- O campo **link de imagem** continua existindo (fica recolhido no formulário) e serve de
  capa para quem não enviou nenhuma foto.
- Layout responsivo e tema claro; respeita `prefers-reduced-motion`.

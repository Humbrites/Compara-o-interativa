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

**Painel de detalhes** (lado direito) — galeria de fotos e, na sequência da conversa de
venda: **quem é o imóvel** (nome, construtora, localização e selos de status, entrega e
unidades), **quanto custa** (o preço de entrada em destaque e a faixa do m²), **o que fazer
com ele** (comparar, simular investimento, calcular o CUB) e, por último, os blocos que
abrem e fecham — ficha técnica, unidades, observações e localização. Ficha e unidades
começam abertas; o resto fica recolhido para a tela não despejar tudo de uma vez.
A capa navega entre as fotos e um clique amplia em tela cheia (setas e Esc no teclado).

**Comparativo A vs B** — a tela se divide comparando os dois empreendimentos.
O melhor indicador de cada linha fica **destacado em verde**, e o cabeçalho mostra
quantos indicadores cada lado venceu. Escolhendo uma **unidade** de cada lado, entra
também a tabela unidade × unidade (metragem, dormitórios, vagas, andar, posição e preço).

**Filtros e busca** — cidade, construtora, tipo, status, dormitórios, faixa de metragem
e faixa de valor do m²; busca por nome, construtora, cidade ou bairro (ignora acentos:
"agua verde" encontra "Água Verde").

**Indicadores de mercado** — a faixa do cabeçalho traz Selic, dólar, IPCA, IGP-M, INCC e TR
atualizados diariamente pelo Banco Central, cada um com a variação, a seta de tendência e o
acumulado de 12 meses.

**Calculadora do CUB** — dentro do cadastro, o botão **Calcular valor com CUB** simula
a evolução das parcelas até o fim da obra e vira um fluxo de pagamento pronto.

**Simulador de investimento** — o botão **Investimento**, no painel do imóvel, projeta
quanto ele pode render até a entrega (com ou sem a correção do CUB) e exporta a
**apresentação em PDF** com os dados do empreendimento e os números da simulação.

---

## Cadastro em duas etapas

O botão **Adicionar empreendimento** abre um formulário de duas etapas (com o cadastro
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

> **Foto é opcional.** Dá para cadastrar sem nenhuma e enviar depois — no painel, o
> empreendimento sem foto mostra *"Não há fotos disponíveis no momento"* no lugar da capa.
> Se o envio falhar, o cadastro já está salvo: as fotos ficam na fila para tentar de novo e
> as etapas do topo seguem liberadas. Lotes grandes vão de 20 em 20 (o teto da API por
> requisição), então mandar 50 fotos de uma vez funciona.

**2. Unidades** — as plantas que o corretor vende. Cada uma tem identificação, torre/bloco,
andar e número, posição solar (Norte, Sul, Leste, Oeste e as diagonais) e face (frente, fundos,
lateral, esquina), metragem privativa e total, dormitórios, suítes, banheiros, vagas, valor,
valor do m² e situação (disponível, reservada, vendida). **Cada unidade tem os próprios fluxos
de pagamento**, abertos dentro do cartão dela.

> **O valor do m² se preenche sozinho.** Assim que a **metragem total** e o **valor** estão
> na tela, o campo aparece calculado (`valor ÷ metragem total`) e é esse número que fica
> gravado. Sem metragem total, a conta usa a privativa — e a dica do campo diz qual base
> entrou. O preço vem do **valor da unidade**; se ele estiver em branco, vale o **valor
> total do imóvel** informado na tabela de pagamento — inclusive enquanto ele ainda está
> sendo digitado, na unidade nova ou no fluxo aberto na edição: **não há botão a apertar**.
> A conta aparece embaixo do campo (`R$ 800.000 ÷ 80 m² = R$ 10.000/m²`), então dá para
> conferir de onde saiu o número. Digitar outro valor ali assume o comando — a dica vira
> "informado à mão" e aparece um **"Voltar ao cálculo automático"**. Reabrindo a unidade,
> um m² que bate com a conta continua acompanhando o valor; um que foi ajustado à mão é
> preservado.
>
> ⚠️ **Separador de milhar**: "800.000" é lido como oitocentos mil, tanto na tela quanto na
> API. Antes disso o ponto virava decimal e o campo gravava **800** — o m² saía mil vezes
> menor, calado.
>
> Com unidades cadastradas, o painel passa a mostrar a **faixa** delas (metragem,
> dormitórios e vagas) no lugar dos campos gerais.

**Fluxo de pagamento** — a tabela de venda mora **dentro da unidade** e a mesma unidade
pode ter várias (tabela padrão, plano obra, proposta de um cliente…). Cada uma traz o
**valor total do imóvel**, entrada, parcelamento, reforços, chaves, financiamento,
descrição livre e observações. O valor total é o campo que define o preço da unidade
quando ela não tem valor próprio — e é dele que sai o valor do m².

> As **tabelas gerais** (do empreendimento inteiro) são o formato antigo. O painel mostra
> um bloco com elas enquanto sobrar alguma, com "copiar para a unidade…" e excluir; a
> migração é manual, na sua mão. No comparativo, o seletor de fluxo mostra primeiro as
> tabelas da unidade escolhida e depois as gerais.

---

## Indicadores de mercado

A faixa do cabeçalho mostra seis índices que aparecem em toda conversa de venda:

| Indicador | O que é | Série no SGS |
|---|---|---|
| **Selic** | meta definida pelo Copom, em % ao ano | 432 |
| **Dólar** | PTAX de venda, em R$ | 1 |
| **IPCA** | inflação oficial do mês | 433 |
| **IGP-M** | o índice do reajuste de aluguel | 189 |
| **INCC** | custo da construção (INCC-DI/FGV) | 192 |
| **TR** | taxa referencial do mês | 7811 |

Cada cartão traz o valor, a variação em relação à leitura anterior (**verde para alta,
vermelho para baixa**, com seta), e o **acumulado de 12 meses** nos índices mensais. A data
e a hora da última atualização ficam à direita, junto do botão de atualizar agora.

**De onde vem:** da API pública do **Banco Central** (`api.bcb.gov.br`, o SGS) — sem
cadastro, sem token, sem contrato. Quem consulta é a **nossa API**, não o navegador: assim
não há CORS, uma consulta serve todas as abas abertas e o número não depende da rede de
quem está com a tela aberta.

**Cache e falhas:** o resultado fica em `api/data/indicadores.json` (fora do Git) com
validade de **6 horas** — a tela revalida ao abrir e a cada 30 minutos, e o servidor decide
se vale mesmo consultar. Se o Banco Central não responder, a faixa mostra o **último dado
bom** com o aviso *"sem conexão — dados de &lt;data&gt;"*, em vez de sumir ou mentir que o
número é de agora. Uma série fora do ar não derruba as outras (cada uma é independente), e
enquanto os números não chegam a faixa mostra o esqueleto dos cartões.

> ⚠️ Duas armadilhas do SGS já tratadas: a série da Selic **recusa** `ultimos/N` acima de
> ~30 (HTTP 400) e publica a meta vigente com **data no futuro** — por isso ela é buscada
> por período e as leituras adiante de hoje são descartadas.

`GET /api/indicadores` devolve tudo pronto; `?forcar=1` fura o cache (é o que o botão de
atualizar faz).

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

## Simulador de investimento

O botão **Investimento**, no painel do imóvel, abre um módulo **independente**: o cálculo
não depende do cadastro nem da calculadora do CUB, então serve para qualquer imóvel —
inclusive um que nem está aqui ("Digitar tudo à mão").

Se o imóvel *estiver* cadastrado, dá para poupar digitação: o seletor **"Usar um imóvel
cadastrado"** preenche o **valor de compra**, o **prazo** (meses até a entrega prevista), a
**entrada**, a **parcela mensal**, o **número de parcelas** e os **reforços** — tudo da
tabela de venda daquela unidade. O que já foi pago e a expectativa de valorização
continuam por sua conta.

> **O valor de compra segue a unidade escolhida.** Trocar de unidade troca o preço na hora —
> e o preço dela é o *valor da unidade* ou, na falta dele, o valor do imóvel guardado na
> **tabela de pagamento**. Sem unidade escolhida vale a **mais barata** — e a tabela de
> venda vem da **mesma** unidade, senão a parcela seria de um imóvel e o preço de outro.
> Se nenhuma tiver preço, entra a tabela geral do empreendimento e, por último,
> `valor do m² × metragem mínima`.
> A lista de unidades mostra o preço de cada uma, e o aviso abaixo do seletor diz qual
> número entrou. O painel do imóvel tem o botão
**Simular investimento**, que já abre com ele escolhido — e "Digitar tudo à mão" volta ao
modo livre a qualquer momento.

**O que você informa:** valor de compra (obrigatório), entrada, **valor já pago** (entrada
+ parcelas + reforços + balões pagos **até hoje** — é o que define a rentabilidade), tempo
até a entrega (em **meses ou anos**) e a valorização anual esperada, com atalhos de 5% a 20%.

**Pagamentos até a entrega** (bloco opcional) — parcela mensal, quantas parcelas ainda
faltam (em branco = até a entrega), quantidade de reforços e o valor de cada um. É isso que
faz a dívida **andar** durante a obra: o saldo devedor cai a cada pagamento em vez de ficar
parado até a entrega. A linha abaixo mostra o total previsto sem correção. Sem preencher
nada, a simulação se comporta como antes (dívida parada).

O **saldo devedor sai da conta sozinho**: `valor de compra − valor já pago`, com piso em
zero (pagar mais que o combinado não vira dívida negativa). Ele acompanha o que você
digita, e o campo continua editável — escrever outro valor ali assume o comando e aparece
um **"Voltar ao cálculo automático"** para desfazer. Como o *valor já pago* soma a entrada,
uma entrada maior que ele é sinal de conta pela metade: a tela avisa, porque nesse caso o
saldo calculado sairia maior que o real.

**A conta:** valorização composta sobre o valor de compra —
`valor na entrega = compra × (1 + valorização)^anos`, com o prazo convertido para anos
(18 meses = 1,5 ano).

| Indicador | Como sai |
|---|---|
| Valor estimado na entrega | compra corrigida pela valorização |
| Ganho patrimonial | entrega − compra |
| Saldo na entrega | o que sobra da dívida depois do cronograma da obra |
| Investido até a entrega | valor já pago + parcelas e reforços do período |
| Patrimônio líquido | entrega − saldo na entrega |
| Lucro potencial | entrega − investido (**não** desconta a dívida) |
| Rentabilidade | lucro ÷ investido × 100 |
| ROI | patrimônio líquido ÷ investido — "R$ X,XX para cada R$ 1,00 investido" |

> **ROI e rentabilidade seriam o mesmo número** se ambos fossem lucro ÷ investido. Aqui a
> rentabilidade carrega o percentual e o ROI carrega o multiplicador patrimonial, que é a
> leitura que o investidor faz na conversa. O **lucro potencial** avisa no próprio card
> que não desconta o saldo devedor — para o número "no bolso", olhe o patrimônio líquido.

Sem informar o valor já pago, rentabilidade e ROI aparecem como "—" em vez de inventar
divisão por zero. O gráfico mostra a curva de valorização até a entrega.

### Considerar o CUB — as duas conclusões

Logo abaixo da valorização anual há a opção **"Considerar a correção do CUB no saldo
devedor"**. Marcada, abre o campo da **correção (CUB/INCC)** — em **% ao mês ou % ao ano**,
como o índice estiver na sua mão, com a conversão da outra unidade logo na dica e a correção
acumulada no período ao lado dos atalhos. O resultado passa a sair em **duas conclusões
lado a lado**.

**A conta é um cronograma, não uma fórmula fechada.** Mês a mês, na ordem em que a
construtora fecha o boleto:

```
correção   = saldo × índice          (o saldo é corrigido primeiro)
parcela    = parcela base × (1 + índice)^mês   (reajustada pelo mesmo índice)
saldo      = saldo + correção − pagamento      (nunca abaixo de zero)
```

| | Só o empreendimento | Com o CUB |
|---|---|---|
| Índice sobre a dívida | nenhum | corrige todo mês |
| Parcelas | valor combinado | reajustadas pelo mesmo índice |
| Amortização | a mesma | a mesma |
| Valorização do imóvel | a mesma | a mesma |

Muda **uma coisa só**: o índice. Por isso as duas conclusões mostram também o **pago
durante a obra** e o **investido até a entrega** — com CUB, sai mais dinheiro do bolso nas
parcelas reajustadas, e esconder isso comparando só o saldo final contaria metade da
história. Cada quadro fecha com a frase que se lê para o cliente, e a linha abaixo resume
quanto o índice acrescentou à dívida, quanto disso saiu do bolso e quanto o patrimônio
líquido encolheu.

Abaixo das conclusões, a seção **Evolução do saldo devedor** mostra o gráfico da dívida até
a entrega e a tabela ano a ano (saldo no início, correção, pago no mês, saldo no fim e o
saldo *sem* correção para comparar) — com "ver mês a mês" para abrir o cronograma inteiro.
Sem saldo devedor não há o que corrigir: a tela avisa que as duas conclusões dão no mesmo.

Desmarcada a opção, o campo some, o percentual é esquecido e volta a existir uma leitura
só. As duas conclusões e a evolução da obra vão para o PDF.

> **Por que o índice não pode ser dividido por 12.** "12% ao ano" são 0,9489% ao mês
> (`(1,12)^(1/12) − 1`), não 1%. O campo converte por raiz e mostra o resultado na dica —
> digitar o índice anual num campo mensal inflava a dívida em dezenas de pontos.

### Exportar PDF (a apresentação para o cliente)

O botão **Exportar PDF**, no rodapé do simulador, abre a folha de impressão do navegador
(mesma mecânica do PDF do CUB — é só escolher "Salvar como PDF"; se o navegador bloquear
pop-up, a tela avisa). A folha vem na ordem da conversa de venda:

1. **O imóvel** — nome, construtora, cidade e bairro, e a grade com unidade escolhida,
   metragem, dormitórios, suítes, vagas, valor do m², entrega prevista e status da obra.
   Com uma unidade escolhida os números são os dela; sem unidade valem as faixas das
   unidades cadastradas e, na falta delas, os campos gerais do empreendimento. **Campo
   vazio não vira célula** — o que não foi cadastrado simplesmente não aparece.
2. **Valor estimado na entrega** em destaque, com o **ROI** ao lado.
3. **O investimento** (o que foi simulado) e a **projeção na entrega** (ganho patrimonial,
   patrimônio líquido, lucro potencial, rentabilidade e valorização do período).
4. A **tabela de valorização** até a entrega e a nota de que a projeção é uma estimativa,
   não garantia de rentabilidade — com o lembrete de que o lucro potencial não desconta o
   saldo devedor.

Simulação sem imóvel escolhido gera o mesmo PDF **sem o bloco do imóvel** — o simulador
segue servindo para um imóvel que nem está cadastrado aqui.

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
│   │   ├── indicadores.js   índices do Banco Central (busca, cache e fallback)
│   │   └── seed.js          exemplos opcionais
│   └── data/
│       ├── compara.db       o banco inteiro (criado no 1º start, fora do Git)
│       ├── indicadores.json cache dos índices de mercado (fora do Git)
│       └── uploads/         as fotos enviadas (fora do Git)
└── web/                     interface (React + TypeScript + Vite)
    └── src/
        ├── components/      Mapa, PainelDetalhe, Comparativo, formulários…
        ├── lib/
        │   ├── comparar.ts  regras do "melhor indicador"
        │   ├── cub.ts       simulação do CUB (fonte de índice plugável)
        │   ├── exportarSimulacao.ts  CSV para Excel e folha de impressão"
        │   ├── dashboard.ts filtros e busca
        │   ├── format.ts    formatação em pt-BR (R$, m², datas)
        │   ├── imagens.ts   capa e galeria de cada empreendimento
        │   ├── investimento.ts  simulador de investimento (módulo à parte)
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
| `GET` | `/api/indicadores` | índices de mercado (cache de 6h; `?forcar=1` refaz a consulta) |
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

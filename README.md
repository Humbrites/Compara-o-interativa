# Compara Interativa

Dashboard interno para a equipe **comercial e marketing** visualizar empreendimentos
num mapa e **comparar dois deles lado a lado** — características e fluxos de pagamento,
com o melhor indicador de cada linha destacado automaticamente.

Sistema **multiempresa**: cada cliente tem a própria base, o próprio time e o próprio
plano. O acesso é por login com senha e verificação em duas etapas opcional, e quem vende
administra clientes, planos e renovações pela tela de **Administrador**.

---

## Como rodar

Requisitos: **Node 20 ou superior**.

```bash
npm install     # instala tudo (raiz, api e web)
npm run dev     # sobe a API e a interface juntas
```

Abra **http://localhost:5273**.

O sistema pede login. Como **não existe cadastro aberto** (quem vende provisiona), a primeira
conta nasce pela linha de comando:

```bash
npm run provisionar -- --conta "Imobiliária Alfa" --plano equipe \
                       --nome "Ana Souza" --email ana@alfa.com.br --usuario ana
```

O comando imprime um **link de definição de senha** (vale 48 horas). Abra o link, escolha a
senha e entre. Daí em diante, quem administra a conta convida o resto da equipe pela própria
interface, em **Conta e equipe**.

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
| `npm run teste` | Roda os testes da API (TOTP, sessão, assentos, isolamento) |
| `npm run provisionar -- --listar` | Lista as contas, o plano e os assentos em uso |

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

### Condições calculadas (clique na tabela)

O cartão do fluxo mostra o que foi **cadastrado** ("10%", "36x", "3 reforços"). **Clicar
nele abre as condições calculadas** — o que o corretor precisa dizer em voz alta:

| Bloco | O que traz |
|---|---|
| Composição do valor | valor do imóvel, quanto sai do bolso **até a entrega** (entrada + parcelas + reforços) e a barra com a fatia de cada parte |
| Tabela das partes | entrada, parcelas, reforços, chaves e financiamento **em reais**, o % que cada uma representa do imóvel e como foi cadastrada (`36 × R$ 2.500`) |
| Conferência | a soma das partes contra o valor do imóvel — avisa quanto falta alocar ou quanto passou |
| Reajuste pelo CUB | só nas tabelas geradas pela calculadora: parcela inicial → final, reajuste acumulado, total das parcelas, saldo que vai para o financiamento, o gráfico da parcela e a **tabela mês a mês**, com exportação em Excel e PDF |

Percentuais viram reais usando o **valor total do imóvel** da tabela; se ela não tiver esse
campo, entra o preço da unidade (a tela diz de onde veio o número). Sem nenhum dos dois, os
percentuais ficam sem conversão e a tela explica o porquê em vez de mostrar campos vazios.

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
se vale mesmo consultar. Enquanto os números não chegam, a faixa mostra o esqueleto dos
cartões. Quando algo dá errado, em três níveis:

| Situação | O que acontece |
|---|---|
| Uma série não responde | o cartão **continua na faixa** com o último valor conhecido, destacado em laranja, e o rodapé avisa *"1 índice sem atualizar"* |
| Cache incompleto | vale só **20 minutos** (não 6 horas), para a série que faltou ganhar nova chance logo |
| Banco Central inteiro fora | a faixa mostra o último dado bom com *"sem conexão — dados de &lt;data&gt;"* |

> Guardar a **ausência** de uma série pelas 6 horas do cache normal foi o que fez o cartão
> da Selic sumir do cabeçalho por uma tarde depois de um único HTTP 400.

> ⚠️ Armadilhas do SGS já tratadas: a série da Selic **não aceita `ultimos/N`** (acima de
> ~30 responde HTTP 400 e, mesmo com 30, devolve `{"erro":{}}` em **HTTP 200**) e publica a
> meta vigente com **data no futuro** — por isso ela é buscada por período (180 dias) e as
> leituras adiante de hoje são descartadas.

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

## Acesso, contas e planos

O sistema é multiempresa: a **conta** é o cliente que comprou, e é ela que possui os dados.
Todo empreendimento (com suas unidades, fluxos e fotos) pertence a uma conta, e nenhuma
consulta da API roda sem o filtro — inclusive as fotos em `/uploads`, que só são entregues a
quem é da conta dona.

### Quem entra e como

| | |
|---|---|
| **Login** | e-mail **ou** nome de usuário + senha |
| **Senha** | guardada como hash `scrypt` com sal próprio (`node:crypto`), nunca em claro |
| **Sessão** | token opaco em cookie `httpOnly`/`SameSite=Lax`, 30 dias com renovação a cada uso |
| **Senha errada** | atraso progressivo por identificador+IP — a conta **nunca** é travada |
| **2FA** | TOTP (RFC 6238) por aplicativo autenticador, com 8 códigos de recuperação |

Detalhes que valem lembrar:

- **A conta não é travada por senha errada.** Travar depois de N tentativas entregaria a
  qualquer pessoa da internet o poder de deixar o cliente de fora do próprio sistema. O que
  cresce é o atraso da resposta.
- **A sessão renova sozinha enquanto está em uso.** Prazo fixo e curto vira onda de gente
  deslogada no meio do trabalho; quem sumiu 30 dias volta pelo login.
- **O mesmo código de 2FA não entra duas vezes.** O passo aceito fica gravado, então quem
  espiou a tela por cima do ombro não entra junto nos 30 segundos de vida do código.
- **Códigos de recuperação aparecem uma vez só** — o banco guarda o hash. Sem eles, trocar de
  celular tranca a pessoa para fora e vira chamado de suporte.
- **Trocar a senha encerra as outras sessões**; desativar um usuário encerra as dele na hora.
- Não há "esqueci minha senha" automático: sem servidor de e-mail, quem gera o link de
  redefinição é quem administra a conta (ou o operador, pela linha de comando).

### Planos e assentos

| Plano | Usuários |
|---|---|
| Individual | 1 |
| Equipe | 3 |
| Profissional | 10 |
| Personalizado | o que estiver gravado na conta |

O plano diz **quantas pessoas**; a **periodicidade** diz **de quanto em quanto tempo o
cliente paga** — mensal, trimestral, semestral ou anual. As duas coisas são contrato e ficam
na conta, então o botão **Renovar** já sabe quanto somar: *"Renovar 3 meses"* num cliente
trimestral. Dois botões fixos (`+1 mês` / `+12`) obrigariam quem cobra a lembrar de cor o
ciclo de cada cliente — e lembrar errado é o que gera cobrança fora de hora.

A regra do limite, em ordem: **o valor gravado na conta vence o plano** (é o que atende quem
negociou 15 assentos sem inventar um plano novo), `0` é "sem teto" dito explicitamente, e só
na ausência dos dois o plano responde. Plano personalizado **exige** o número — sem essa
trava, ele viraria conta ilimitada por descuido.

- **Convite pendente ocupa vaga.** Sem isso, o plano de 3 vira 10 mandando convites e deixando
  todo mundo aceitar depois. O convite vence em 7 dias e a vaga volta sozinha.
- **Estourar o limite responde 409** dizendo qual é o teto e o que fazer para abrir vaga.
- **O cliente não muda o próprio plano.** Contrato é de quem vende; a interface mostra o que
  foi contratado e quanto está em uso.
- **Conta suspensa consulta, mas não grava** (HTTP 402). Vencimento não pode custar dado a
  ninguém. Conta `cancelada` é a única que não entra mais.

Papéis: **dono** (administra a equipe e responde pelo contrato), **admin** (convida, remove e
edita usuários) e **membro** (usa o sistema). O **operador do produto** fica fora das contas —
não ocupa assento nem aparece na equipe do cliente.

### Os dois tipos de gente no sistema

| | Onde vive | O que vê |
|---|---|---|
| **Cliente** (dono, admin, membro) | dentro de uma conta | o dashboard: mapa, empreendimentos, comparativo, simulador |
| **Master da plataforma** | **fora de todas as contas** (`conta_id` nulo) | a administração: clientes, planos, licenças e renovações — e, quando pede, o dashboard **como usuário** de uma conta |

O master é quem vende o sistema. Ele **não é cliente**: não tem plano, não ocupa
assento de ninguém, não aparece na equipe de nenhuma conta e não tem base própria de
empreendimentos — a API recusa essas rotas para ele com 403, a menos que ele tenha aberto
uma conta em *"Ver como usuário"* (abaixo), e aí é a conta VISITADA que responde. Em
compensação, é o único que enxerga todos os clientes.

```bash
npm run provisionar -- --master voce@empresa.com.br --nome "Seu Nome" --usuario apelido
```

Promover alguém que já existe **solta essa pessoa da conta em que estava** (a conta
continua com os dados, mas fica sem aquele usuário) — o comando avisa antes.

Ao entrar, o master cai direto na tela **Administrador**, com:

- **Os números**: clientes ativos, pessoas usando, adoção de 2FA e assentos ocupados.
- **Alertas de renovação** que são *filtros*: clicar em "3 vencidas" mostra quais.
- **A lista de clientes ordenada por urgência**, com barra lateral colorida e uma cor
  por plano; `+1 mês` / `+12` renovam na hora e `Editar` abre plano, limite, situação e
  data de vencimento.
- **Novo cliente** e **Adicionar usuário** dentro de um cliente — os dois devolvem o
  link de primeiro acesso para você entregar. O teto do plano vale também para você:
  furá-lo por aqui faria dele uma sugestão.
- **Todos os usuários**: quem usa o sistema inteiro, com cliente, papel, último acesso e
  quem **nunca acessou**.

**Ver a base do cliente (suporte)** — o botão *"Ver a base"* na linha do cliente abre o que
ele cadastrou: empreendimentos, unidades e as tabelas de venda com a composição calculada
(entrada, parcelas, reforços, chaves, financiamento) e a **conferência da soma** — é ela que
responde ao chamado "minha tabela está errada". A tela é **somente leitura**: enxergar o que o
cliente cadastrou é o que permite dar suporte; corrigir por cima dele, sem que ele saiba, é
outra coisa, e nada ali grava. As contas exibidas saem das **mesmas funções** que a tela do
cliente usa — recalcular de outro jeito faria o suporte ver um número diferente do que o
cliente está vendo, que é o pior lugar possível para uma divergência.

**Ver como usuário (apresentar sem entrar no login de ninguém)** — o botão *"Ver como
usuário"*, no topo da administração, troca a tela pelo **dashboard inteiro**: mapa,
empreendimentos, painel do imóvel, comparativo, calculadora do CUB e simulador de
investimento. É o que permite demonstrar o produto numa reunião sem pedir emprestado o
acesso de um cliente real.

- **Sem dizer a conta, ele abre a de demonstração** — a que estiver marcada em *"Usar esta
  conta na demonstração"* (`Editar` na linha do cliente). Ela aparece na lista com o selo
  **Demonstração**, e é **uma só**: marcar outra desmarca a anterior. Com uma só, a regra
  fica legível — *o master grava na conta de demonstração e em nenhuma outra*.
- **Na conta de demonstração o cadastro funciona de verdade**: dá para criar um
  empreendimento ao vivo durante a apresentação, e ele fica gravado ali.
- **Na base de um cliente real é SOMENTE LEITURA** (o botão *"Abrir como usuário"* na linha
  dele). Tudo o que grava some da tela — adicionar, editar, excluir, as fotos e a
  calculadora que gera fluxo — e a API recusa a escrita com 403 mesmo que alguém chame a
  rota na mão. Ver a base para apresentar é uma coisa; alterar o cadastro do cliente sem
  que ele saiba é outra.
- **Uma faixa no topo diz sempre de quem é a base que está na tela** e se o clique grava.
  Numa apresentação, essa é a dúvida que não pode existir.
- O modo **mora na sessão**, não na memória do navegador: um F5 no meio da reunião não
  derruba a visualização. *"Voltar à administração"* (no topo ou na faixa) encerra.
- Nasce marcada sozinha **só** quando existe uma única conta no banco — que é o caso de
  quem já usava o dashboard antes de haver clientes. Com várias, escolher no chute
  liberaria escrita na base de um cliente de verdade, então ninguém nasce marcado.
- Quem tem `--operador` mas **continua dentro de uma conta** não personifica ninguém: ele
  já tem base própria, e misturar as duas seria pior do que não ter o recurso.

Duas contas de tempo que valem lembrar: **renovar parte do vencimento atual**, não de
hoje (senão o cliente perde os dias que já pagou; só quando já venceu é que a base vira
hoje), e **mês que não tem o dia cai no último dia dele** — 31/01 + 1 mês = 28/02.
A periodicidade é editada no mesmo formulário do plano, e o cliente vê o próprio ciclo em
"Conta e equipe" (*"válido até 24/11/2026 · renovação trimestral"*) — a data sozinha não diz
se a próxima cobrança é daqui a um mês ou a um ano.

Existe ainda a marca `--operador`, que dá a mesma tela a alguém que **continua** dentro
de uma conta-cliente. Serve para casos raros; o normal é o master.

### Provisionamento (o lado de quem vende)

```bash
npm run provisionar -- --listar
npm run provisionar -- --conta "Imobiliária Alfa" --plano equipe --periodicidade trimestral \
                       --nome "Ana" --email ana@alfa.com.br [--dias-teste 14]
npm run provisionar -- --usuario-na-conta 1 --nome "Bruno" --email bruno@alfa.com.br
npm run provisionar -- --plano-da-conta 1 --plano personalizado --usuarios 25
npm run provisionar -- --status-da-conta 1 --status suspensa
npm run provisionar -- --link-senha ana@alfa.com.br
```

Reduzir o plano **não desliga ninguém**: quem decide quem sai é o cliente. O sistema apenas
para de aceitar gente nova até caber.

### Antes de colocar na internet

Hoje tudo roda em `127.0.0.1`. Para expor:

- **HTTPS obrigatório** e `COOKIE_SEGURO=1` na API (sem isso o cookie de sessão trafega em
  claro; com isso em `http://localhost`, o navegador descarta o cookie e ninguém entra).
- `ORIGENS_PERMITIDAS` só se o front for servido de outro host — o padrão é CORS fechado,
  porque refletir qualquer origem com cookie deixaria qualquer site ler a base do cliente.
- `URL_BASE` com o endereço público, para os links de convite e de senha saírem certos.
- Backup do `api/data/` (banco **e** uploads).

### Rotas da API

Todas exigem sessão, exceto `/api/health` e as de `/api/auth/` (que existem para quem ainda
não entrou).

| Método | Rota | Faz |
|---|---|---|
| `POST` | `/api/auth/login` | entra; devolve a sessão ou pede o 2FA |
| `POST` | `/api/auth/2fa` | confirma o código (ou um de recuperação) |
| `POST` | `/api/auth/sair` | encerra a sessão |
| `POST` | `/api/auth/definir-senha` | primeiro acesso e redefinição, por token |
| `GET` `POST` | `/api/auth/convite/:token` | vê e aceita um convite |
| `GET` | `/api/sessao` | quem está logado, a conta, o plano e os assentos |
| `GET` `PUT` | `/api/conta` | dados da conta e da equipe (nome e exigência de 2FA) |
| `POST` `DELETE` | `/api/conta/convites[/:id]` | cria e cancela convite |
| `PUT` | `/api/conta/usuarios/:id` | papel e acesso de alguém da equipe |
| `POST` | `/api/conta/usuarios/:id/link-senha` | gera link de redefinição |
| `POST` | `/api/seguranca/senha` | troca a própria senha |
| `POST` | `/api/seguranca/2fa/{iniciar,ativar,desativar,codigos}` | segundo fator |
| `GET` | `/api/seguranca/sessoes` | onde você está conectado |
| `GET` | `/api/plataforma` | **(master)** todos os clientes, com resumo e alertas |
| `PUT` | `/api/plataforma/contas/:id` | **(master)** plano, limite, situação e vencimento |
| `POST` | `/api/plataforma/contas/:id/renovar` | **(master)** renova N meses e reativa |
| `GET` | `/api/plataforma/contas/:id/base` | **(master)** a base do cliente, só leitura |
| `POST` `DELETE` | `/api/plataforma/ver-como` | **(master)** abre o dashboard como usuário da conta (sem `contaId`, a de demonstração) e sai |
| `POST` | `/api/plataforma/contas[/:id/usuarios]` | **(master)** cria cliente ou usuário |
| `POST` | `/api/seguranca/sessoes/encerrar-outras` | derruba as outras sessões |

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
| `GET` | `/uploads/<arquivo>` | serve a foto enviada (só para a conta dona dela) |
| `GET` | `/api/health` | status da API (público, sem contagem de dados) |

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

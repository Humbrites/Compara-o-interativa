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
dormitórios, metragem, valor do m², status, entrega e todos os fluxos de pagamento.
A capa navega entre as fotos e um clique amplia em tela cheia (setas e Esc no teclado).

**Comparativo A vs B** — a tela se divide comparando os dois empreendimentos.
O melhor indicador de cada linha fica **destacado em verde**, e o cabeçalho mostra
quantos indicadores cada lado venceu.

**Filtros e busca** — cidade, construtora, tipo, status, dormitórios, faixa de metragem
e faixa de valor do m²; busca por nome, construtora, cidade ou bairro (ignora acentos:
"agua verde" encontra "Água Verde").

**Indicadores** — quantidade de empreendimentos, preço médio do m², maior e menor
metragem, mais barato e mais caro (esses dois são clicáveis e levam ao empreendimento).

---

## Cadastro em duas etapas

O botão **Adicionar empreendimento** abre um formulário de duas etapas:

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

**2. Fluxos de pagamento** — depois de salvar, avança direto para o cadastro dos fluxos.
Um empreendimento pode ter **vários** (tabela padrão, plano obra, à vista…), cada um com
entrada, parcelamento, reforços, chaves, financiamento, descrição livre e observações.

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
        │   ├── dashboard.ts filtros, busca e cálculo dos indicadores
        │   ├── format.ts    formatação em pt-BR (R$, m², datas)
        │   ├── imagens.ts   capa e galeria de cada empreendimento
        │   └── opcoes.ts    status da obra, tipos e suas ordens
        └── styles/          design system (tokens.css) e estilos
```

**Banco de dados:** um único arquivo SQLite em `api/data/compara.db`. Backup é copiar
esse arquivo; ele **não vai para o Git** (cada instalação tem os próprios dados).

**Três tabelas:** `empreendimentos`, `fluxos_pagamento` e `imagens` (relação 1:N — excluir
um empreendimento remove os fluxos e as fotos dele em cascata). Da foto, o banco guarda só o
nome do arquivo, o nome original e a posição; o arquivo em si vive em `api/data/uploads/`.

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
| `POST` | `/api/empreendimentos/:id/imagens` | envia fotos (multipart, várias de uma vez) |
| `PUT` | `/api/empreendimentos/:id/imagens/ordem` | reordena — o primeiro id vira a capa |
| `DELETE` | `/api/imagens/:id` | exclui a foto e o arquivo do disco |
| `GET` | `/uploads/<arquivo>` | serve a foto enviada |
| `GET` | `/api/health` | status da API |

---

## Notas técnicas

- **Sem dependências externas em tempo de execução** além dos tiles do OpenStreetMap:
  as fontes são as do sistema e os ícones são SVG desenhados no próprio projeto.
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

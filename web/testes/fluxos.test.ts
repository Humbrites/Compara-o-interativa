/**
 * A matemática de uma tabela de venda — o módulo puro por trás do cartão, do
 * detalhe e da análise da unidade.
 *
 * A regra que este arquivo existe para proteger: o que se paga DEPOIS das
 * chaves não é desembolso de obra. Somá-lo ao "até a entrega" faria o
 * apartamento parecer o dobro do que custa para quem ainda vai decidir a
 * compra — e é exatamente o número que o corretor diz em voz alta.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  compararFluxosDetalhado,
  detalharFluxo,
  ladosPadraoDaComparacao,
  totalizarFluxo,
} from '../src/lib/fluxos.ts'
import { analisarUnidade } from '../src/lib/analise.ts'
import { exportarPdfFluxos } from '../src/lib/exportarComparativo.ts'
import { TRACO } from '../src/lib/format.ts'
import type { FluxoPagamento, Unidade } from '../src/types.ts'

/** Um fluxo com todas as colunas em branco, para preencher só o que importa. */
function fluxo(campos: Partial<FluxoPagamento> = {}): FluxoPagamento {
  return {
    id: 1,
    empreendimento_id: 1,
    unidade_id: 1,
    tipo: null,
    fluxo_base_id: null,
    nome: 'Tabela da construtora',
    entrada_pct: null,
    entrada_valor: null,
    entrada_parcelas: null,
    parcelas: null,
    parcela_valor: null,
    reforcos_qtd: null,
    reforco_valor: null,
    chaves_pct: null,
    financiamento_pct: null,
    financiamento_valor: null,
    pos_parcelas: null,
    pos_parcela_valor: null,
    pos_reforcos_qtd: null,
    pos_reforco_valor: null,
    descricao: null,
    observacoes: null,
    cub_percentual: null,
    cub_meses: null,
    cub_valor_imovel: null,
    cub_parcela_inicial: null,
    cub_entrada: null,
    criado_em: '2026-08-12',
    atualizado_em: '2026-08-12',
    ...campos,
  }
}

function unidade(campos: Partial<Unidade> = {}): Unidade {
  return {
    id: 1,
    empreendimento_id: 1,
    identificacao: 'Apto 101',
    tipologia: null,
    torre: 'A',
    andar: 1,
    numero: '101',
    metragem: 70,
    metragem_total: null,
    dormitorios: 2,
    suites: 1,
    banheiros: 2,
    vagas: 1,
    posicao_solar: null,
    face: null,
    valor: 800000,
    valor_m2: null,
    status: 'disponivel',
    observacoes: null,
    criado_em: '2026-08-12',
    atualizado_em: '2026-08-12',
    fluxos: [],
    ...campos,
  }
}

/* -------------------------------------------------------------------- */

test('o pós-chaves entra na composição do preço, mas NUNCA no desembolso até a entrega', () => {
  // 800.000: 10% de entrada em 4x, 30 mensais, 6 semestrais, 5% nas chaves e
  // o resto parcelado direto com a construtora depois da entrega.
  const detalhe = detalharFluxo(
    fluxo({
      cub_valor_imovel: 800000,
      entrada_pct: 10,
      entrada_valor: 80000,
      entrada_parcelas: 4,
      parcelas: 30,
      parcela_valor: 3500,
      reforcos_qtd: 6,
      reforco_valor: 20000,
      chaves_pct: 5,
      pos_parcelas: 24,
      pos_parcela_valor: 2000,
      pos_reforcos_qtd: 4,
      pos_reforco_valor: 15000,
    }),
  )

  assert.equal(detalhe.durante, 80000 + 30 * 3500 + 6 * 20000, 'entrada + mensais + semestrais')
  assert.equal(detalhe.posChaves, 24 * 2000 + 4 * 15000)
  assert.ok(detalhe.durante < detalhe.durante + detalhe.posChaves)
  assert.equal(detalhe.naEntrega, 40000, 'só as chaves — não há financiamento cadastrado')

  // A conferência da soma inclui o pós-chaves: ele é dinheiro do preço.
  assert.equal(detalhe.alocado, detalhe.durante + detalhe.naEntrega + detalhe.posChaves)
  assert.equal(detalhe.diferenca, 800000 - detalhe.alocado)

  // E as duas partes novas aparecem na lista, com a série descrita.
  const porChave = Object.fromEntries(detalhe.partes.map((p) => [p.chave, p]))
  assert.equal(porChave.pos_parcelas.valor, 48000)
  assert.match(porChave.pos_parcelas.detalhe ?? '', /24 ×/)
  assert.match(porChave.pos_reforcos.detalhe ?? '', /após a entrega/)
  // A entrada diz em quantas vezes — é a primeira pergunta de quem compra.
  assert.match(porChave.entrada.detalhe ?? '', /em 4x/)
})

test('o saldo a financiar desconta também o que a construtora parcela pós-chaves', () => {
  const semPos = totalizarFluxo({
    base: 1000000,
    entradaValor: 200000,
    entradaPct: null,
    parcelas: null,
    parcelaValor: null,
    reforcosQtd: null,
    reforcoValor: null,
    chavesPct: null,
  })
  assert.equal(semPos.saldo, 800000)

  const comPos = totalizarFluxo({
    base: 1000000,
    entradaValor: 200000,
    entradaPct: null,
    parcelas: null,
    parcelaValor: null,
    reforcosQtd: null,
    reforcoValor: null,
    chavesPct: null,
    posParcelas: 10,
    posParcelaValor: 30000,
  })
  assert.equal(comPos.posParcelas, 300000)
  assert.equal(comPos.saldo, 500000, 'sem descontar, o saldo do banco viria inflado')
})

test('sem pós-chaves nada muda: a tabela de sempre continua fechando igual', () => {
  const detalhe = detalharFluxo(
    fluxo({
      cub_valor_imovel: 1000000,
      entrada_pct: 20,
      entrada_valor: 200000,
      parcelas: 48,
      parcela_valor: 2500,
      reforcos_qtd: 8,
      reforco_valor: 25000,
      financiamento_pct: 40,
      financiamento_valor: 400000,
    }),
  )

  assert.equal(detalhe.posChaves, 0)
  assert.equal(detalhe.durante, 200000 + 48 * 2500 + 8 * 25000)
  assert.equal(detalhe.naEntrega, 400000)
  assert.equal(detalhe.alocado, detalhe.durante + 400000)
})

test('a análise da unidade separa entrada, obra e o saldo na entrega', () => {
  // O formato que o cliente mandou: entrada, mensais, balões semestrais e
  // "financiamento" — que é o SALDO NA ENTREGA, não desembolso de obra.
  const tabela = fluxo({
    cub_valor_imovel: 1000000,
    entrada_pct: 20,
    entrada_valor: 200000,
    parcelas: 48,
    parcela_valor: 2500,
    reforcos_qtd: 8,
    reforco_valor: 25000,
    financiamento_pct: 40,
    financiamento_valor: 400000,
  })

  const alvo = unidade({ valor: 1000000, fluxos: [tabela] })
  const analise = analisarUnidade(alvo, [alvo])

  assert.equal(analise.entrada, 200000)
  assert.equal(analise.saldo, 400000, 'financiamento = o que resta na entrega das chaves')
  assert.equal(analise.pctFinanciavel, 40)
  // "Durante a obra" é o que sai mês a mês DEPOIS de assinar: sem a entrada.
  assert.equal(analise.durante, 48 * 2500 + 8 * 25000)
  assert.equal(analise.ateAEntrega, analise.entrada! + analise.durante!)
  // O saldo na entrega nunca entra no desembolso até a entrega.
  assert.ok(analise.ateAEntrega! < 1000000)
})

test('o pós-chaves não infla o "durante a obra" da análise', () => {
  const comPos = fluxo({
    cub_valor_imovel: 800000,
    entrada_pct: 10,
    entrada_valor: 80000,
    parcelas: 30,
    parcela_valor: 3500,
    pos_parcelas: 24,
    pos_parcela_valor: 2000,
  })

  const alvo = unidade({ valor: 800000, fluxos: [comPos] })
  const analise = analisarUnidade(alvo, [alvo])

  assert.equal(analise.durante, 30 * 3500)
  assert.equal(analise.ateAEntrega, 80000 + 30 * 3500)
})

/* -------------------------------------------------------------------- */
/* Tabela da construtora × proposta personalizada                        */
/* -------------------------------------------------------------------- */

/**
 * A tabela da construtora dos testes: 1.000.000 com 20% de entrada. O saldo
 * vem gravado como o formulário grava — ele é o RESTO da tabela.
 */
const daConstrutora = fluxo({
  id: 10,
  tipo: 'construtora',
  nome: 'Tabela da construtora',
  cub_valor_imovel: 1000000,
  entrada_pct: 20,
  entrada_valor: 200000,
  parcelas: 48,
  parcela_valor: 2500,
  reforcos_qtd: 8,
  reforco_valor: 25000,
  chaves_pct: 5,
  financiamento_valor: 1000000 - 200000 - 48 * 2500 - 8 * 25000 - 50000,
})

/** A proposta do corretor: entrada maior, parcela menor e sem reforço. */
const personalizado = fluxo({
  id: 11,
  tipo: 'personalizado',
  fluxo_base_id: 10,
  nome: 'Personalizado — Tabela da construtora',
  cub_valor_imovel: 1000000,
  entrada_pct: 30,
  entrada_valor: 300000,
  parcelas: 48,
  parcela_valor: 2000,
  chaves_pct: 5,
  financiamento_valor: 1000000 - 300000 - 48 * 2000 - 50000,
})

const linhaDe = (comparacao: ReturnType<typeof compararFluxosDetalhado>, chave: string) => {
  const linha = comparacao.linhas.find((l) => l.chave === chave)
  assert.ok(linha, `a comparação não tem a linha "${chave}"`)
  return linha
}

test('a diferença entre as duas tabelas sai com o sinal certo — B menos A', () => {
  const comparacao = compararFluxosDetalhado(daConstrutora, personalizado)

  // A proposta pede 100 mil a MAIS de entrada.
  const entrada = linhaDe(comparacao, 'entrada')
  assert.equal(entrada.a, 200000)
  assert.equal(entrada.b, 300000)
  assert.equal(entrada.diferenca, 100000)
  assert.ok(entrada.textoDiferenca.startsWith('+'), entrada.textoDiferenca)

  // E 24 mil a MENOS nas parcelas (48 × 2.500 contra 48 × 2.000).
  const parcelas = linhaDe(comparacao, 'parcelas')
  assert.equal(parcelas.diferenca, 48 * 2000 - 48 * 2500)
  assert.ok(parcelas.textoDiferenca.startsWith('−'), parcelas.textoDiferenca)
  assert.match(parcelas.detalheA ?? '', /48 ×/)

  // Chaves iguais dos dois lados: diferença zero é "igual", não um valor.
  assert.equal(linhaDe(comparacao, 'chaves').diferenca, 0)
  assert.equal(linhaDe(comparacao, 'chaves').textoDiferenca, 'igual')
})

test('lado sem o dado não vira zero: a linha fica sem diferença', () => {
  const comparacao = compararFluxosDetalhado(daConstrutora, personalizado)

  // A proposta não tem reforços — e "sem reforço" não é "reforço de R$ 0".
  const reforcos = linhaDe(comparacao, 'reforcos')
  assert.equal(reforcos.a, 8 * 25000)
  assert.equal(reforcos.b, null)
  assert.equal(reforcos.diferenca, null)
  assert.equal(reforcos.textoB, TRACO)
  assert.equal(reforcos.textoDiferenca, TRACO)

  // Nenhum dos dois tem pós-chaves: a linha inteira fica em branco.
  const pos = linhaDe(comparacao, 'pos_chaves')
  assert.equal(pos.a, null)
  assert.equal(pos.b, null)
  assert.equal(pos.diferenca, null)
})

test('os totais da comparação são os mesmos que o detalhe de cada fluxo', () => {
  const comparacao = compararFluxosDetalhado(daConstrutora, personalizado)
  const detalheA = detalharFluxo(daConstrutora)
  const detalheB = detalharFluxo(personalizado)

  const durante = linhaDe(comparacao, 'durante')
  assert.equal(durante.a, detalheA.durante)
  assert.equal(durante.b, detalheB.durante)
  assert.equal(durante.diferenca, detalheB.durante - detalheA.durante)

  const saldo = linhaDe(comparacao, 'saldo')
  assert.equal(saldo.a, detalheA.partes.find((p) => p.chave === 'financiamento')?.valor ?? null)

  const total = linhaDe(comparacao, 'total')
  assert.equal(total.a, detalheA.alocado)
  assert.equal(total.b, detalheB.alocado)
  // As duas tabelas fecham o mesmo imóvel: o total do negócio não muda, só a
  // hora em que o dinheiro sai.
  assert.equal(total.diferenca, 0)
})

test('o pós-chaves fica fora do "durante a obra" e dentro do total do negócio', () => {
  // A MESMA tabela da construtora, só que com 24 mensais depois da entrega —
  // e o saldo do banco encolhendo na medida do que a construtora parcelou.
  const comPos = fluxo({
    id: 12,
    tipo: 'personalizado',
    cub_valor_imovel: 1000000,
    entrada_pct: 20,
    entrada_valor: 200000,
    parcelas: 48,
    parcela_valor: 2500,
    reforcos_qtd: 8,
    reforco_valor: 25000,
    chaves_pct: 5,
    pos_parcelas: 24,
    pos_parcela_valor: 2000,
    financiamento_valor: 1000000 - 200000 - 48 * 2500 - 8 * 25000 - 50000 - 24 * 2000,
  })

  const comparacao = compararFluxosDetalhado(daConstrutora, comPos)
  const durante = linhaDe(comparacao, 'durante')
  const pos = linhaDe(comparacao, 'pos_chaves')
  const total = linhaDe(comparacao, 'total')

  // O desembolso até a entrega é idêntico: o pós-chaves não entra nele.
  assert.equal(durante.diferenca, 0)
  assert.equal(pos.b, 24 * 2000)
  assert.equal(pos.a, null, 'a tabela da construtora não tem pós-chaves')

  // Mas o pós-chaves compõe o preço: com ele, o saldo do banco encolhe na
  // mesma medida e o total do negócio continua fechando o imóvel.
  const saldo = linhaDe(comparacao, 'saldo')
  assert.equal(saldo.diferenca, -(24 * 2000))
  assert.equal(total.a, total.b)
})

test('a comparação abre com a tabela da construtora contra o personalizado mais recente', () => {
  const antigo = fluxo({ id: 5, tipo: 'personalizado', nome: 'Proposta Ana' })
  const recente = fluxo({ id: 21, tipo: 'personalizado', nome: 'Proposta Bruno' })

  assert.deepEqual(ladosPadraoDaComparacao([recente, daConstrutora, antigo]), { a: 10, b: 21 })

  // Base antiga, sem tipo gravado: as duas ÚLTIMAS cadastradas.
  const semTipo = [fluxo({ id: 1 }), fluxo({ id: 2 }), fluxo({ id: 3 })]
  assert.deepEqual(ladosPadraoDaComparacao(semTipo), { a: 2, b: 3 })

  // Com uma tabela só não há o que comparar.
  assert.equal(ladosPadraoDaComparacao([daConstrutora]), null)
})

test('a folha de impressão recebe as linhas prontas e escapa o que o usuário digitou', () => {
  // Dublê de janela: `imprimir` só quer um `window.open` que aceite HTML.
  let html = ''
  const janela = {
    document: {
      write: (texto: string) => {
        html += texto
      },
      close: () => {},
    },
    addEventListener: () => {},
    focus: () => {},
    print: () => {},
  }
  ;(globalThis as unknown as { window: unknown }).window = { open: () => janela }

  const comparacao = compararFluxosDetalhado(daConstrutora, personalizado)
  const abriu = exportarPdfFluxos({
    titulo: 'Apto 101',
    // O nome da tabela é texto do usuário: ele nunca pode virar marcação.
    nomeA: 'Tabela <b>oficial</b>',
    nomeB: 'Proposta Ana & Bruno',
    linhas: comparacao.linhas.map((linha) => ({
      rotulo: linha.rotulo,
      textoA: linha.textoA,
      textoB: linha.textoB,
      textoDiferenca: linha.textoDiferenca,
      detalheA: linha.detalheA,
      detalheB: linha.detalheB,
      diferenca: linha.diferenca,
    })),
  })

  assert.equal(abriu, true)
  assert.match(html, /Tabela &lt;b&gt;oficial&lt;\/b&gt;/)
  assert.match(html, /Proposta Ana &amp; Bruno/)
  assert.doesNotMatch(html, /<b>oficial<\/b>/)
  // As linhas vão prontas da tela: nada é recalculado no papel.
  assert.match(html, /Total durante a obra/)
  assert.match(html, /Pós-chaves/)
  assert.match(html, /Diferença/)
})

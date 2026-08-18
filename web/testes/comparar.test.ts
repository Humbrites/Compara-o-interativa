/**
 * O comparativo A × B por FAIXA — e não por uma média que esconde o prédio.
 *
 * O que estes testes seguram: o valor do m² e o preço saem das unidades que
 * ainda estão à venda; a metragem que compara é a PRIVATIVA (a total de uma
 * cobertura elegia vencedor sozinha); e um lado sem unidades cadastradas cai
 * para o cadastro AVISANDO que caiu — nunca calado, ao lado de um número lido
 * das unidades do outro.
 *
 * Rodam sem navegador: `comparar.ts` e `unidades.ts` são módulos puros.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import type { Empreendimento, FluxoPagamento, Unidade } from '../src/types.ts'
import { compararEmpreendimentos, compararUnidades, type LinhaComparativo } from '../src/lib/comparar.ts'
import { faixaM2 } from '../src/lib/unidades.ts'
import { fmtArea, fmtMoeda, TRACO } from '../src/lib/format.ts'

/** Uma unidade com o mínimo que as contas usam; o resto vem em branco. */
function unidade(campos: Partial<Unidade>): Unidade {
  return {
    id: 1,
    empreendimento_id: 1,
    identificacao: null,
    tipologia: null,
    torre: null,
    andar: null,
    numero: null,
    metragem: null,
    metragem_total: null,
    area_comum: null,
    area_terraco: null,
    espaco_complementar: null,
    dormitorios: null,
    suites: null,
    banheiros: null,
    vagas: null,
    vagas_detalhe: null,
    posicao_solar: null,
    face: null,
    valor: null,
    valor_m2: null,
    status: null,
    observacoes: null,
    criado_em: '2026-08-18 10:00:00',
    atualizado_em: '2026-08-18 10:00:00',
    fluxos: [],
    ...campos,
  }
}

function empreendimento(campos: Partial<Empreendimento>): Empreendimento {
  return {
    id: 1,
    nome: 'Empreendimento',
    construtora: null,
    cidade: null,
    bairro: null,
    endereco: null,
    latitude: null,
    longitude: null,
    valor_m2: null,
    metragem_min: null,
    metragem_max: null,
    dormitorios: null,
    suites: null,
    banheiros: null,
    vagas: null,
    torres: null,
    status_obra: null,
    entrega: null,
    tipo: null,
    imagem_url: null,
    observacoes: null,
    criado_em: '2026-08-18 10:00:00',
    atualizado_em: '2026-08-18 10:00:00',
    fluxos: [],
    unidades: [],
    imagens: [],
    ...campos,
  }
}

/** Só o que a análise lê de uma tabela de venda. */
function fluxo(campos: Partial<FluxoPagamento>): FluxoPagamento {
  return {
    id: 1,
    empreendimento_id: 1,
    unidade_id: 1,
    nome: null,
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
    criado_em: '2026-08-18 10:00:00',
    atualizado_em: '2026-08-18 10:00:00',
    ...campos,
  }
}

const linha = (linhas: LinhaComparativo[], chave: string): LinhaComparativo => {
  const achada = linhas.find((l) => l.chave === chave)
  assert.ok(achada, `linha "${chave}" não existe no comparativo`)
  return achada
}

/* --- faixaM2 -------------------------------------------------------- */

test('a faixa de m² sai só das unidades disponíveis', () => {
  const unidades = [
    // Vendida e mais barata por m²: sobrou no papel, mas não dá para comprar.
    unidade({ id: 1, valor: 300000, metragem: 50, status: 'vendida' }),
    unidade({ id: 2, valor: 500000, metragem: 50, status: 'Disponível' }),
    unidade({ id: 3, valor: 600000, metragem: 50, status: 'disponivel' }),
  ]

  assert.deepEqual(faixaM2(unidades), { min: 10000, max: 12000, soDisponiveis: true })
})

test('sem nenhuma disponível com dado, a faixa cai para todas as unidades e marca isso', () => {
  const unidades = [
    unidade({ id: 1, valor: 300000, metragem: 50, status: 'vendida' }),
    unidade({ id: 2, valor: 500000, metragem: 50, status: 'reservada' }),
    // Disponível, mas sem preço: não tem o que entrar na faixa.
    unidade({ id: 3, metragem: 50, status: 'disponivel' }),
  ]

  assert.deepEqual(faixaM2(unidades), { min: 6000, max: 10000, soDisponiveis: false })
})

test('status em branco não é "esgotado": a faixa usa todas as unidades, marcada', () => {
  const unidades = [unidade({ id: 1, valor: 400000, metragem: 50 })]
  assert.deepEqual(faixaM2(unidades), { min: 8000, max: 8000, soDisponiveis: false })
})

test('sem nenhum m² para calcular, a faixa fica vazia — e não vira zero', () => {
  assert.deepEqual(faixaM2([]), { min: null, max: null, soDisponiveis: false })
  assert.deepEqual(faixaM2([unidade({ metragem: 50, status: 'disponivel' })]), {
    min: null,
    max: null,
    soDisponiveis: false,
  })
})

test('a faixa de m² respeita a base da conta', () => {
  const unidades = [unidade({ valor: 800000, metragem: 80, metragem_total: 100, status: 'disponivel' })]

  assert.equal(faixaM2(unidades, 'privativa').min, 10000)
  assert.equal(faixaM2(unidades, 'total').min, 8000)
})

/* --- Comparativo geral ---------------------------------------------- */

/** Dois lados com unidades: A mais barato por m², B com plantas maiores. */
function ladosComUnidades() {
  const a = {
    empreendimento: empreendimento({ id: 1, nome: 'Alfa', torres: 2 }),
    unidades: [
      unidade({ id: 1, valor: 400000, metragem: 50, metragem_total: 71, status: 'disponivel' }),
      unidade({ id: 2, valor: 600000, metragem: 60, metragem_total: 81, status: 'disponivel' }),
      // Vendida e caríssima por m²: fora da faixa do que dá para comprar.
      unidade({ id: 3, valor: 1200000, metragem: 60, metragem_total: 91, status: 'vendida' }),
    ],
  }
  const b = {
    empreendimento: empreendimento({ id: 2, nome: 'Beta', torres: 1 }),
    unidades: [
      unidade({ id: 4, valor: 900000, metragem: 90, metragem_total: 121, status: 'disponivel' }),
      unidade({ id: 5, valor: 1400000, metragem: 100, metragem_total: 141, status: 'reservada' }),
    ],
  }
  return { a, b }
}

test('o comparativo geral não mostra metragem total em lugar nenhum', () => {
  const { a, b } = ladosComUnidades()
  const linhas = compararEmpreendimentos(a, b)

  // A antiga "Metragem máxima" vinha da área total — uma cobertura de 300 m²
  // ganhava a linha pelo prédio inteiro.
  assert.equal(
    linhas.some((l) => l.rotulo === 'Metragem máxima' || l.rotulo === 'Metragem mínima'),
    false,
  )
  assert.equal(linha(linhas, 'metragem_min').rotulo, 'Metragem privativa mínima')
  assert.equal(linha(linhas, 'metragem_max').rotulo, 'Metragem privativa máxima')

  const totais = [fmtArea(71), fmtArea(81), fmtArea(91), fmtArea(121), fmtArea(141)]
  for (const l of linhas) {
    for (const total of totais) {
      assert.equal(l.textoA.includes(total), false, `${l.chave} mostrou metragem total`)
      assert.equal(l.textoB.includes(total), false, `${l.chave} mostrou metragem total`)
    }
  }
})

test('a média única do m² deu lugar à faixa das unidades disponíveis', () => {
  const { a, b } = ladosComUnidades()
  const linhas = compararEmpreendimentos(a, b)

  assert.equal(
    linhas.some((l) => l.chave === 'valor_m2'),
    false,
  )

  // Alfa: 8.000 e 10.000 (a vendida de 20.000 fica fora). Beta: só a disponível, 10.000.
  const minimo = linha(linhas, 'valor_m2_min')
  assert.equal(minimo.rotulo, 'Valor do m² a partir de')
  assert.equal(minimo.textoA, fmtMoeda(8000, true))
  assert.equal(minimo.textoB, fmtMoeda(10000, true))
  assert.equal(minimo.vencedor, 'a')

  const maximo = linha(linhas, 'valor_m2_max')
  assert.equal(maximo.textoA, fmtMoeda(10000, true))
  assert.equal(maximo.textoB, fmtMoeda(10000, true))
  // Teto igual dos dois lados: ninguém "ganha" por arredondamento.
  assert.equal(maximo.vencedor, 'empate')

  // O critério diz de onde saiu o número — é o tooltip da linha.
  assert.ok(minimo.criterio.includes('área privativa'))
})

test('o m² segue a base da conta também no comparativo', () => {
  const { a, b } = ladosComUnidades()
  const linhas = compararEmpreendimentos(a, b, 'total')

  // 400.000 ÷ 71 de área total ≈ 5.634.
  assert.equal(linha(linhas, 'valor_m2_min').textoA, fmtMoeda(400000 / 71, true))
  assert.ok(linha(linhas, 'valor_m2_min').criterio.includes('área total'))
})

test('a faixa de preço tem ticket mínimo na disputa e o máximo só informativo', () => {
  const { a, b } = ladosComUnidades()
  const linhas = compararEmpreendimentos(a, b)

  const minimo = linha(linhas, 'preco_min')
  assert.equal(minimo.textoA, fmtMoeda(400000))
  assert.equal(minimo.textoB, fmtMoeda(900000))
  assert.equal(minimo.vencedor, 'a')

  const maximo = linha(linhas, 'preco_max')
  assert.equal(maximo.textoA, fmtMoeda(600000))
  assert.equal(maximo.textoB, fmtMoeda(900000))
  assert.equal(maximo.vencedor, null)
})

test('a metragem privativa compara a menor e a maior planta disponível', () => {
  const { a, b } = ladosComUnidades()
  const linhas = compararEmpreendimentos(a, b)

  assert.equal(linha(linhas, 'metragem_min').textoA, fmtArea(50))
  assert.equal(linha(linhas, 'metragem_min').textoB, fmtArea(90))
  assert.equal(linha(linhas, 'metragem_min').vencedor, 'b')

  assert.equal(linha(linhas, 'metragem_max').textoA, fmtArea(60))
  assert.equal(linha(linhas, 'metragem_max').textoB, fmtArea(90))
  assert.equal(linha(linhas, 'metragem_max').vencedor, 'b')
})

test('unidades disponíveis entram na disputa; torres são informativas', () => {
  const { a, b } = ladosComUnidades()
  const linhas = compararEmpreendimentos(a, b)

  const disponiveis = linha(linhas, 'disponiveis')
  assert.equal(disponiveis.textoA, '2')
  assert.equal(disponiveis.textoB, '1')
  assert.equal(disponiveis.vencedor, 'a')

  const torres = linha(linhas, 'torres')
  assert.equal(torres.textoA, '2')
  assert.equal(torres.textoB, '1')
  assert.equal(torres.vencedor, null)
})

test('sem status em nenhuma unidade, "disponíveis" fica em branco em vez de zero', () => {
  const a = {
    empreendimento: empreendimento({ id: 1, nome: 'Alfa' }),
    unidades: [unidade({ id: 1, valor: 400000, metragem: 50 })],
  }
  const b = {
    empreendimento: empreendimento({ id: 2, nome: 'Beta' }),
    unidades: [unidade({ id: 2, valor: 500000, metragem: 50, status: 'disponivel' })],
  }

  const disponiveis = linha(compararEmpreendimentos(a, b), 'disponiveis')
  assert.equal(disponiveis.textoA, TRACO)
  assert.equal(disponiveis.textoB, '1')
  // Um lado sem o dado = ninguém vence, como em toda linha do comparativo.
  assert.equal(disponiveis.vencedor, null)
})

test('sem unidade disponível com dado, o valor vem marcado como de todas as unidades', () => {
  const a = {
    empreendimento: empreendimento({ id: 1, nome: 'Alfa' }),
    unidades: [unidade({ id: 1, valor: 400000, metragem: 50, status: 'vendida' })],
  }
  const b = {
    empreendimento: empreendimento({ id: 2, nome: 'Beta' }),
    unidades: [unidade({ id: 2, valor: 500000, metragem: 50, status: 'disponivel' })],
  }

  const minimo = linha(compararEmpreendimentos(a, b), 'valor_m2_min')
  assert.equal(minimo.textoA, `${fmtMoeda(8000, true)} · todas as unidades`)
  assert.equal(minimo.textoB, fmtMoeda(10000, true))
  assert.ok(minimo.criterio.includes('todas as unidades'))
  // A marcação não tira o lado da disputa: os dois têm número.
  assert.equal(minimo.vencedor, 'a')
})

test('lado sem unidades cadastradas cai para os dados gerais do cadastro, avisando', () => {
  const a = {
    empreendimento: empreendimento({ id: 1, nome: 'Alfa' }),
    unidades: [unidade({ id: 1, valor: 400000, metragem: 50, status: 'disponivel' })],
  }
  const b = {
    // Empreendimento antigo: os números gerais estão gravados, unidade nenhuma.
    empreendimento: empreendimento({
      id: 2,
      nome: 'Beta',
      valor_m2: 9000,
      metragem_min: 45,
      metragem_max: 120,
    }),
    unidades: [],
  }

  const linhas = compararEmpreendimentos(a, b)

  const minimo = linha(linhas, 'valor_m2_min')
  assert.equal(minimo.textoA, fmtMoeda(8000, true))
  assert.equal(minimo.textoB, `${fmtMoeda(9000, true)} · dados gerais`)
  assert.equal(minimo.vencedor, 'a')
  assert.ok(minimo.criterio.includes('dados gerais'))

  assert.equal(linha(linhas, 'metragem_min').textoB, `${fmtArea(45)} · dados gerais`)
  assert.equal(linha(linhas, 'metragem_max').textoB, `${fmtArea(120)} · dados gerais`)

  // Preço não tem campo geral no cadastro: fica em branco, sem marca nenhuma.
  assert.equal(linha(linhas, 'preco_min').textoB, TRACO)
  assert.equal(linha(linhas, 'preco_min').vencedor, null)
  assert.equal(linha(linhas, 'preco_min').criterio.includes('dados gerais'), false)
})

test('sem dado dos dois lados a linha fica em branco, sem vencedor e sem marca', () => {
  const vazio = (id: number, nome: string) => ({ empreendimento: empreendimento({ id, nome }), unidades: [] })
  const linhas = compararEmpreendimentos(vazio(1, 'Alfa'), vazio(2, 'Beta'))

  for (const chave of ['valor_m2_min', 'valor_m2_max', 'preco_min', 'metragem_min', 'disponiveis']) {
    assert.equal(linha(linhas, chave).textoA, TRACO)
    assert.equal(linha(linhas, chave).textoB, TRACO)
    assert.equal(linha(linhas, chave).vencedor, null)
  }
})

/* --- Unidade × unidade ---------------------------------------------- */

test('unidade × unidade compara o preço e o m² DELAS, na base da conta', () => {
  // Sem valor próprio: o preço vem da tabela de venda, como em toda tela.
  const a = unidade({
    id: 1,
    metragem: 50,
    metragem_total: 71,
    fluxos: [fluxo({ id: 1, unidade_id: 1, cub_valor_imovel: 500000 })],
  })
  const b = unidade({ id: 2, valor: 660000, metragem: 60, metragem_total: 81 })

  const linhas = compararUnidades(a, b)
  assert.equal(linha(linhas, 'u_valor').textoA, fmtMoeda(500000))
  assert.equal(linha(linhas, 'u_valor').vencedor, 'a')

  // 500.000 ÷ 50 = 10.000 contra 660.000 ÷ 60 = 11.000.
  assert.equal(linha(linhas, 'u_valor_m2').textoA, fmtMoeda(10000, true))
  assert.equal(linha(linhas, 'u_valor_m2').vencedor, 'a')

  // Na base total a conta vira 500.000 ÷ 71 contra 660.000 ÷ 81: A segue na frente.
  const porTotal = compararUnidades(a, b, 'total')
  assert.equal(linha(porTotal, 'u_valor_m2').textoA, fmtMoeda(500000 / 71, true))
  assert.equal(linha(porTotal, 'u_valor_m2').textoB, fmtMoeda(660000 / 81, true))
})

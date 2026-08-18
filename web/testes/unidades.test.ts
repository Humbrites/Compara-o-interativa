/**
 * O valor do m² nas DUAS bases (área privativa e área total).
 *
 * A base é uma configuração da conta, e é o número que decide compra: o mesmo
 * apartamento parece 20% mais barato quando a conta usa a área total. Estes
 * testes existem para que as duas leituras convivam sem uma contaminar a
 * outra — e para provar que a área COMUM não entra em conta nenhuma.
 *
 * Rodam sem navegador: `web/src/lib/unidades.ts` é módulo puro (nada de React,
 * nada de DOM), lido direto pelo Node.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import type { Unidade } from '../src/types.ts'
import {
  calcularValorM2,
  metragemDoM2,
  resumoUnidades,
  valorM2Da,
  valorM2MedioDe,
} from '../src/lib/unidades.ts'

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

/* --- calcularValorM2 ------------------------------------------------ */

test('o m² sai pela base escolhida — e a outra metragem é só reserva', () => {
  // 800.000 ÷ 80 privativa = 10.000; ÷ 100 total = 8.000.
  assert.equal(calcularValorM2(800000, 100, 80, 'privativa'), 10000)
  assert.equal(calcularValorM2(800000, 100, 80, 'total'), 8000)

  // Sem informar a base vale o padrão do projeto: área privativa.
  assert.equal(calcularValorM2(800000, 100, 80), 10000)

  // Só uma metragem informada: a base cai na que existe, em vez de ficar sem m².
  assert.equal(calcularValorM2(800000, 100, null, 'privativa'), 8000)
  assert.equal(calcularValorM2(800000, null, 80, 'total'), 10000)

  // Sem preço, sem metragem ou com metragem zerada não há m² — nunca 0.
  assert.equal(calcularValorM2(null, 100, 80, 'privativa'), null)
  assert.equal(calcularValorM2(800000, null, null, 'total'), null)
  assert.equal(calcularValorM2(800000, 0, 0, 'privativa'), null)
})

test('metragemDoM2 diz qual área dividiu o preço', () => {
  assert.equal(metragemDoM2(100, 80, 'privativa'), 80)
  assert.equal(metragemDoM2(100, 80, 'total'), 100)
  assert.equal(metragemDoM2(null, 80, 'total'), 80)
  assert.equal(metragemDoM2(null, null, 'privativa'), null)
})

/* --- valorM2Da ------------------------------------------------------ */

test('o m² digitado à mão vence a conta, em qualquer base', () => {
  const comM2 = unidade({ valor: 800000, metragem: 80, metragem_total: 100, valor_m2: 12345 })
  assert.equal(valorM2Da(comM2, 'privativa'), 12345)
  assert.equal(valorM2Da(comM2, 'total'), 12345)

  const derivado = unidade({ valor: 800000, metragem: 80, metragem_total: 100 })
  assert.equal(valorM2Da(derivado, 'privativa'), 10000)
  assert.equal(valorM2Da(derivado, 'total'), 8000)
})

test('a área comum NUNCA entra na conta do m²', () => {
  // 22,8 m² de área comum na unidade: se fossem somados à privativa, o m²
  // cairia de 10.000 para ~7.782 sem ninguém perceber.
  const comArea = unidade({ valor: 800000, metragem: 80, area_comum: 22.8 })
  assert.equal(valorM2Da(comArea, 'privativa'), 10000)
  assert.equal(valorM2Da(comArea, 'total'), 10000)

  // Nem no ponderado do empreendimento.
  assert.equal(valorM2MedioDe([comArea], 'privativa'), 10000)
})

/* --- Resumo do conjunto --------------------------------------------- */

test('resumo e m² médio do conjunto acompanham a base da conta', () => {
  const unidades = [
    unidade({ id: 1, valor: 800000, metragem: 80, metragem_total: 100 }),
    unidade({ id: 2, valor: 1200000, metragem: 120, metragem_total: 150, area_comum: 30 }),
  ]

  const privativa = resumoUnidades(unidades, 'privativa')
  assert.equal(privativa.valorM2.min, 10000)
  assert.equal(privativa.valorM2.max, 10000)
  // A faixa de metragem exibida é sempre a PRIVATIVA, base ou não base.
  assert.equal(privativa.metragem.min, 80)
  assert.equal(privativa.metragem.max, 120)

  const total = resumoUnidades(unidades, 'total')
  assert.equal(total.valorM2.min, 8000)
  assert.equal(total.valorM2.max, 8000)

  // Ponderado: 2.000.000 ÷ 200 privativas = 10.000; ÷ 250 totais = 8.000.
  assert.equal(valorM2MedioDe(unidades, 'privativa'), 10000)
  assert.equal(valorM2MedioDe(unidades, 'total'), 8000)
})

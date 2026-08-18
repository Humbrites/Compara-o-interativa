/**
 * Os numeros gerais do empreendimento, DERIVADOS das unidades.
 *
 * Ate 12/08 eram sete campos digitados a mao no cadastro (valor do m²,
 * metragens, dormitorios, suites, banheiros, vagas). Quem cadastra ja digita
 * tudo isso em cada unidade — repetir no empreendimento so criava duas versoes
 * da mesma verdade, e a de cima envelhecia calada a cada unidade nova.
 *
 * Continuam GRAVADOS nas colunas de `empreendimentos` de proposito: sao os
 * filtros do dashboard, o comparativo, a lista e o mapa que leem essas
 * colunas. Calcular so na hora de exibir obrigaria cada um desses lugares a
 * refazer a conta — e a primeira tela que esquecesse mostraria outro numero.
 */
import { db } from './db.js'

/**
 * Qual metragem divide o preco para dar o valor do m².
 *
 * 'privativa' = a area que o comprador usa (padrao); 'total' = a area
 * total/global anunciada. A escolha e da CONTA (`contas.base_m2`) porque as
 * duas leituras existem no mercado — e misturar as duas na mesma base faria um
 * predio parecer mais barato que o outro so pela metodologia.
 *
 * A area COMUM nao entra em nenhuma das duas: ela nao e area da unidade.
 */
export const BASES_M2 = ['privativa', 'total']
export const BASE_M2_PADRAO = 'privativa'

/** A base num dos dois valores; qualquer outra coisa cai no padrao. */
export function normalizarBaseM2(base) {
  return BASES_M2.includes(base) ? base : BASE_M2_PADRAO
}

/** As unidades com o preco que vale para cada uma. */
const unidadesDoEmpreendimento = db.prepare(`
  SELECT u.metragem, u.metragem_total, u.dormitorios, u.suites, u.banheiros, u.vagas, u.valor,
         (SELECT f.cub_valor_imovel
            FROM fluxos_pagamento f
           WHERE f.unidade_id = u.id AND f.cub_valor_imovel IS NOT NULL
           ORDER BY f.id LIMIT 1) AS valor_do_fluxo
    FROM unidades u
   WHERE u.empreendimento_id = ?
`)

const numeros = (lista) => lista.filter((v) => v !== null && v !== undefined && Number.isFinite(v))

const menor = (lista) => (numeros(lista).length ? Math.min(...numeros(lista)) : null)
const maior = (lista) => (numeros(lista).length ? Math.max(...numeros(lista)) : null)

/**
 * O preco de uma unidade: o valor dela ou, na falta, o valor total do imovel
 * gravado na tabela de venda. Mesma regra do `precoDaUnidade()` da tela — duas
 * definicoes de preco dariam dois precos para o mesmo apartamento.
 */
const precoDaUnidade = (u) => (u.valor !== null ? u.valor : u.valor_do_fluxo)

/**
 * A metragem que o m² usa, na base escolhida pela conta — com a outra como
 * reserva, porque unidade com uma metragem so nao pode ficar sem m².
 *
 * ⚠️ `area_comum` NUNCA entra aqui, nem somada nem sozinha: ela e a fracao do
 * predio que cabe a unidade, e somar isso a area dela inflaria a metragem e
 * baratearia o m² de todo mundo que informa area comum.
 */
const metragemDoM2 = (u, base) =>
  base === 'total'
    ? (u.metragem_total !== null ? u.metragem_total : u.metragem)
    : (u.metragem !== null ? u.metragem : u.metragem_total)

/**
 * O resumo puro, sem tocar no banco — e o que os testes conferem.
 *
 * ⚠️ O valor do m² e PONDERADO (soma dos precos ÷ soma das metragens), nao a
 * media dos m² de cada unidade: um studio de 30 m² nao pode pesar o mesmo que
 * uma cobertura de 200 m² na hora de dizer quanto custa o metro ali.
 */
export function calcularResumo(unidades, base = BASE_M2_PADRAO) {
  if (unidades.length === 0) return null

  // A faixa de metragem que o anuncio mostra e a PRIVATIVA (a total só entra
  // quando a privativa não foi informada).
  const metragens = unidades.map((u) => (u.metragem !== null ? u.metragem : u.metragem_total))
  const precos = unidades.map(precoDaUnidade)

  const qual = normalizarBaseM2(base)

  let somaPreco = 0
  let somaMetragem = 0
  for (const unidade of unidades) {
    const preco = precoDaUnidade(unidade)
    const metragem = metragemDoM2(unidade, qual)
    if (preco !== null && metragem !== null && metragem > 0) {
      somaPreco += preco
      somaMetragem += metragem
    }
  }

  return {
    unidades: unidades.length,
    valorMin: menor(precos),
    valorMax: maior(precos),
    metragem_min: menor(metragens),
    metragem_max: maior(metragens),
    // Dormitorios, suites, banheiros e vagas do EMPREENDIMENTO sao o teto do
    // que ele oferece: o filtro "3 dormitórios" tem de achar o predio que tem
    // uma unidade de 3, mesmo que a menor delas seja de 1.
    dormitorios: maior(unidades.map((u) => u.dormitorios)),
    suites: maior(unidades.map((u) => u.suites)),
    banheiros: maior(unidades.map((u) => u.banheiros)),
    vagas: maior(unidades.map((u) => u.vagas)),
    valor_m2: somaMetragem > 0 ? somaPreco / somaMetragem : null,
  }
}

const gravar = db.prepare(`
  UPDATE empreendimentos
     SET metragem_min = @metragem_min, metragem_max = @metragem_max,
         dormitorios = @dormitorios, suites = @suites, banheiros = @banheiros, vagas = @vagas,
         valor_m2 = @valor_m2, atualizado_em = datetime('now')
   WHERE id = @id
`)

/**
 * A base do m² da conta DONA do empreendimento. Empreendimento sem dono (base
 * antiga, adotada na migracao) cai no padrao em vez de ficar sem m².
 */
const baseDaConta = db.prepare(`
  SELECT c.base_m2 AS base
    FROM empreendimentos e
    JOIN contas c ON c.id = e.conta_id
   WHERE e.id = ?
`)

export function baseM2DoEmpreendimento(empreendimentoId) {
  return normalizarBaseM2(baseDaConta.get(empreendimentoId)?.base)
}

/**
 * Refaz os numeros do empreendimento a partir das unidades dele. Roda depois
 * de toda mudanca de unidade E de tabela de venda (o preco pode vir de la).
 *
 * Sem unidade nenhuma NAO apaga o que estiver gravado: o empreendimento que
 * ainda nao teve unidades cadastradas guarda os numeros que vieram do cadastro
 * antigo, e zera-los seria perder dado por causa de um caminho novo.
 */
export function recalcularResumo(empreendimentoId) {
  const unidades = unidadesDoEmpreendimento.all(empreendimentoId)
  const resumo = calcularResumo(unidades, baseM2DoEmpreendimento(empreendimentoId))
  if (!resumo) return null

  gravar.run({
    id: empreendimentoId,
    metragem_min: resumo.metragem_min,
    metragem_max: resumo.metragem_max,
    dormitorios: resumo.dormitorios,
    suites: resumo.suites,
    banheiros: resumo.banheiros,
    vagas: resumo.vagas,
    valor_m2: resumo.valor_m2,
  })

  return resumo
}

const empreendimentosDaConta = db.prepare('SELECT id FROM empreendimentos WHERE conta_id = ?')

/**
 * Trocar a base do m² muda o numero de TODO empreendimento da conta — e o
 * `valor_m2` fica gravado nas colunas que o filtro, a lista e o comparativo
 * leem. Sem este recalculo, a configuracao nova so valeria para o proximo
 * empreendimento que alguem editasse.
 */
export function recalcularResumosDaConta(contaId) {
  let total = 0
  for (const { id } of empreendimentosDaConta.all(contaId)) {
    if (recalcularResumo(id)) total += 1
  }
  return total
}

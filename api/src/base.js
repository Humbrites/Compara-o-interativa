/**
 * A base de uma conta — empreendimentos com unidades, fluxos e galeria.
 *
 * Mora aqui porque DOIS caminhos precisam dela: o cliente lendo a propria base
 * (`GET /api/empreendimentos`) e o suporte olhando a de um cliente pela area de
 * administracao. Montada em dois lugares, uma delas envelheceria — e a que
 * envelhece calada e sempre a que menos se usa.
 */
import { db } from './db.js'

const listarEmpreendimentos = db.prepare(
  'SELECT * FROM empreendimentos WHERE conta_id = ? ORDER BY nome COLLATE NOCASE',
)

const listarFluxos = db.prepare(
  `SELECT f.* FROM fluxos_pagamento f
     JOIN empreendimentos e ON e.id = f.empreendimento_id
    WHERE e.conta_id = ? ORDER BY f.id`,
)

const listarUnidades = db.prepare(
  `SELECT u.* FROM unidades u
     JOIN empreendimentos e ON e.id = u.empreendimento_id
    WHERE e.conta_id = ?
    ORDER BY COALESCE(u.torre, ''), COALESCE(u.andar, 999999), COALESCE(u.numero, ''), u.id`,
)

const listarImagens = db.prepare(
  `SELECT i.* FROM imagens i
     JOIN empreendimentos e ON e.id = i.empreendimento_id
    WHERE e.conta_id = ? ORDER BY i.empreendimento_id, i.ordem, i.id`,
)

/** Agrupa uma lista pelo campo indicado, preservando a ordem de entrada. */
function agrupar(linhas, campo) {
  const mapa = new Map()
  for (const linha of linhas) {
    const chave = linha[campo]
    if (!mapa.has(chave)) mapa.set(chave, [])
    mapa.get(chave).push(linha)
  }
  return mapa
}

/** Acrescenta a URL pública ao registro da imagem. */
export function comUrl(imagem) {
  return { ...imagem, url: `/uploads/${imagem.arquivo}` }
}

/**
 * Tudo de uma vez, com os fluxos aninhados: a base e pequena e o front
 * trabalha inteiramente em memoria (filtros, busca, comparativo).
 */
export function listarBaseDaConta(contaId) {
  const empreendimentos = listarEmpreendimentos.all(contaId)
  const todosFluxos = listarFluxos.all(contaId)

  // Fluxo sem unidade e a tabela geral do empreendimento; com unidade, e dela.
  const fluxosGerais = agrupar(
    todosFluxos.filter((fluxo) => fluxo.unidade_id === null),
    'empreendimento_id',
  )
  const fluxosPorUnidade = agrupar(
    todosFluxos.filter((fluxo) => fluxo.unidade_id !== null),
    'unidade_id',
  )

  const unidadesPorEmpreendimento = agrupar(
    listarUnidades.all(contaId).map((unidade) => ({ ...unidade, fluxos: fluxosPorUnidade.get(unidade.id) || [] })),
    'empreendimento_id',
  )

  const imagensPorId = agrupar(listarImagens.all(contaId).map(comUrl), 'empreendimento_id')

  return empreendimentos.map((e) => ({
    ...e,
    fluxos: fluxosGerais.get(e.id) || [],
    unidades: unidadesPorEmpreendimento.get(e.id) || [],
    imagens: imagensPorId.get(e.id) || [],
  }))
}

import Fastify from 'fastify'
import cors from '@fastify/cors'
import { db, CAMPOS_EMPREENDIMENTO, CAMPOS_FLUXO, sanitizar } from './db.js'

const app = Fastify({ logger: true })
await app.register(cors, { origin: true })

const PORT = Number(process.env.PORT || 3210)

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const listarEmpreendimentos = db.prepare('SELECT * FROM empreendimentos ORDER BY nome COLLATE NOCASE')
const buscarEmpreendimento = db.prepare('SELECT * FROM empreendimentos WHERE id = ?')
const listarFluxos = db.prepare('SELECT * FROM fluxos_pagamento ORDER BY id')
const fluxosDoEmpreendimento = db.prepare('SELECT * FROM fluxos_pagamento WHERE empreendimento_id = ? ORDER BY id')

/** Monta INSERT dinamico a partir das colunas efetivamente enviadas. */
function inserir(tabela, dados) {
  const colunas = Object.keys(dados)
  if (colunas.length === 0) throw new Error('nenhum campo valido enviado')
  const sql = `INSERT INTO ${tabela} (${colunas.join(', ')})
               VALUES (${colunas.map((c) => `@${c}`).join(', ')})`
  return db.prepare(sql).run(dados).lastInsertRowid
}

/** Monta UPDATE dinamico; sempre carimba atualizado_em. */
function atualizar(tabela, id, dados) {
  const colunas = Object.keys(dados)
  if (colunas.length === 0) return
  const sets = colunas.map((c) => `${c} = @${c}`).join(', ')
  const sql = `UPDATE ${tabela} SET ${sets}, atualizado_em = datetime('now') WHERE id = @id`
  db.prepare(sql).run({ ...dados, id })
}

/* ------------------------------------------------------------------ */
/* Empreendimentos                                                     */
/* ------------------------------------------------------------------ */

// Devolve tudo de uma vez com os fluxos aninhados: a base e pequena e o
// front trabalha inteiramente em memoria (filtros, busca, comparativo).
app.get('/api/empreendimentos', () => {
  const empreendimentos = listarEmpreendimentos.all()
  const fluxos = listarFluxos.all()

  const porEmpreendimento = new Map()
  for (const fluxo of fluxos) {
    if (!porEmpreendimento.has(fluxo.empreendimento_id)) porEmpreendimento.set(fluxo.empreendimento_id, [])
    porEmpreendimento.get(fluxo.empreendimento_id).push(fluxo)
  }

  return empreendimentos.map((e) => ({ ...e, fluxos: porEmpreendimento.get(e.id) || [] }))
})

app.get('/api/empreendimentos/:id', (req, reply) => {
  const empreendimento = buscarEmpreendimento.get(req.params.id)
  if (!empreendimento) return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  return { ...empreendimento, fluxos: fluxosDoEmpreendimento.all(empreendimento.id) }
})

app.post('/api/empreendimentos', (req, reply) => {
  const dados = sanitizar(req.body || {}, CAMPOS_EMPREENDIMENTO)
  if (!dados.nome) return reply.code(400).send({ erro: 'O nome do empreendimento e obrigatorio' })

  const id = inserir('empreendimentos', dados)
  return reply.code(201).send({ ...buscarEmpreendimento.get(id), fluxos: [] })
})

app.put('/api/empreendimentos/:id', (req, reply) => {
  const { id } = req.params
  if (!buscarEmpreendimento.get(id)) return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })

  const dados = sanitizar(req.body || {}, CAMPOS_EMPREENDIMENTO)
  if ('nome' in dados && !dados.nome) {
    return reply.code(400).send({ erro: 'O nome do empreendimento e obrigatorio' })
  }

  atualizar('empreendimentos', id, dados)
  return { ...buscarEmpreendimento.get(id), fluxos: fluxosDoEmpreendimento.all(id) }
})

app.delete('/api/empreendimentos/:id', (req, reply) => {
  const { id } = req.params
  if (!buscarEmpreendimento.get(id)) return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })

  // ON DELETE CASCADE leva junto os fluxos de pagamento.
  db.prepare('DELETE FROM empreendimentos WHERE id = ?').run(id)
  return reply.code(204).send()
})

/* ------------------------------------------------------------------ */
/* Fluxos de pagamento                                                 */
/* ------------------------------------------------------------------ */

app.post('/api/fluxos', (req, reply) => {
  const dados = sanitizar(req.body || {}, CAMPOS_FLUXO)
  if (!dados.empreendimento_id) return reply.code(400).send({ erro: 'Informe o empreendimento do fluxo' })
  if (!buscarEmpreendimento.get(dados.empreendimento_id)) {
    return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  }

  const id = inserir('fluxos_pagamento', dados)
  return reply.code(201).send(db.prepare('SELECT * FROM fluxos_pagamento WHERE id = ?').get(id))
})

app.put('/api/fluxos/:id', (req, reply) => {
  const { id } = req.params
  const existente = db.prepare('SELECT * FROM fluxos_pagamento WHERE id = ?').get(id)
  if (!existente) return reply.code(404).send({ erro: 'Fluxo nao encontrado' })

  // O vinculo com o empreendimento nao muda por edicao.
  const dados = sanitizar(req.body || {}, CAMPOS_FLUXO.filter((c) => c !== 'empreendimento_id'))
  atualizar('fluxos_pagamento', id, dados)
  return db.prepare('SELECT * FROM fluxos_pagamento WHERE id = ?').get(id)
})

app.delete('/api/fluxos/:id', (req, reply) => {
  const { id } = req.params
  if (!db.prepare('SELECT id FROM fluxos_pagamento WHERE id = ?').get(id)) {
    return reply.code(404).send({ erro: 'Fluxo nao encontrado' })
  }
  db.prepare('DELETE FROM fluxos_pagamento WHERE id = ?').run(id)
  return reply.code(204).send()
})

/* ------------------------------------------------------------------ */

app.get('/api/health', () => ({
  ok: true,
  empreendimentos: db.prepare('SELECT COUNT(*) AS total FROM empreendimentos').get().total,
}))

try {
  await app.listen({ port: PORT, host: '127.0.0.1' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

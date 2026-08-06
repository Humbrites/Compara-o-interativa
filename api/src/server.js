import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import estatico from '@fastify/static'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { extname, join } from 'node:path'
import {
  db,
  CAMPOS_EMPREENDIMENTO,
  CAMPOS_FLUXO,
  CAMPOS_UNIDADE,
  sanitizar,
  PASTA_DADOS,
  UPLOAD_DIR,
} from './db.js'
import { criarServicoIndicadores } from './indicadores.js'

const app = Fastify({ logger: true })

/** Só formatos que o navegador exibe direto. */
const TIPOS_IMAGEM = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif'],
])
const TAMANHO_MAX = 12 * 1024 * 1024 // 12 MB por arquivo

await app.register(cors, { origin: true })
// throwFileSizeLimit: false faz o arquivo grande chegar TRUNCADO em vez de
// abortar a requisicao com 413 — assim o lote continua e so ele e recusado,
// com um motivo em portugues.
await app.register(multipart, {
  throwFileSizeLimit: false,
  limits: { fileSize: TAMANHO_MAX, files: 20 },
})
// As imagens enviadas são servidas em /uploads/<arquivo>.
await app.register(estatico, { root: UPLOAD_DIR, prefix: '/uploads/', decorateReply: false })

const PORT = Number(process.env.PORT || 3210)

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const listarEmpreendimentos = db.prepare('SELECT * FROM empreendimentos ORDER BY nome COLLATE NOCASE')
const buscarEmpreendimento = db.prepare('SELECT * FROM empreendimentos WHERE id = ?')
const listarFluxos = db.prepare('SELECT * FROM fluxos_pagamento ORDER BY id')
// Fluxos "gerais": os que valem para o empreendimento inteiro, sem unidade.
const fluxosDoEmpreendimento = db.prepare(
  'SELECT * FROM fluxos_pagamento WHERE empreendimento_id = ? AND unidade_id IS NULL ORDER BY id',
)
const listarImagens = db.prepare('SELECT * FROM imagens ORDER BY empreendimento_id, ordem, id')
const imagensDoEmpreendimento = db.prepare('SELECT * FROM imagens WHERE empreendimento_id = ? ORDER BY ordem, id')

// Ordem de leitura do corretor: torre, andar e depois o numero da unidade.
const ORDEM_UNIDADE = `ORDER BY COALESCE(torre, ''), COALESCE(andar, 999999), COALESCE(numero, ''), id`
const listarUnidades = db.prepare(`SELECT * FROM unidades ${ORDEM_UNIDADE}`)
const unidadesDoEmpreendimento = db.prepare(`SELECT * FROM unidades WHERE empreendimento_id = ? ${ORDEM_UNIDADE}`)
const buscarUnidade = db.prepare('SELECT * FROM unidades WHERE id = ?')
const fluxosDaUnidade = db.prepare('SELECT * FROM fluxos_pagamento WHERE unidade_id = ? ORDER BY id')

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

/** Unidade com os fluxos de pagamento dela aninhados. */
function comFluxos(unidade) {
  return { ...unidade, fluxos: fluxosDaUnidade.all(unidade.id) }
}

/** Acrescenta a URL pública ao registro da imagem. */
function comUrl(imagem) {
  return { ...imagem, url: `/uploads/${imagem.arquivo}` }
}

/** Remove o arquivo do disco sem derrubar a requisição se ele já não existir. */
async function apagarArquivo(nomeArquivo) {
  try {
    await unlink(join(UPLOAD_DIR, nomeArquivo))
  } catch (erro) {
    if (erro.code !== 'ENOENT') app.log.warn({ erro, nomeArquivo }, 'falha ao apagar arquivo de imagem')
  }
}

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
  const todosFluxos = listarFluxos.all()

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
    listarUnidades.all().map((unidade) => ({ ...unidade, fluxos: fluxosPorUnidade.get(unidade.id) || [] })),
    'empreendimento_id',
  )

  const imagensPorId = agrupar(listarImagens.all().map(comUrl), 'empreendimento_id')

  return empreendimentos.map((e) => ({
    ...e,
    fluxos: fluxosGerais.get(e.id) || [],
    unidades: unidadesPorEmpreendimento.get(e.id) || [],
    imagens: imagensPorId.get(e.id) || [],
  }))
})

app.get('/api/empreendimentos/:id', (req, reply) => {
  const empreendimento = buscarEmpreendimento.get(req.params.id)
  if (!empreendimento) return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  return montarEmpreendimento(empreendimento.id)
})

/** Empreendimento completo: fluxos gerais, unidades (com fluxos) e galeria. */
function montarEmpreendimento(id) {
  return {
    ...buscarEmpreendimento.get(id),
    fluxos: fluxosDoEmpreendimento.all(id),
    unidades: unidadesDoEmpreendimento.all(id).map(comFluxos),
    imagens: imagensDoEmpreendimento.all(id).map(comUrl),
  }
}

app.post('/api/empreendimentos', (req, reply) => {
  const dados = sanitizar(req.body || {}, CAMPOS_EMPREENDIMENTO)
  if (!dados.nome) return reply.code(400).send({ erro: 'O nome do empreendimento e obrigatorio' })

  const id = inserir('empreendimentos', dados)
  return reply.code(201).send({ ...buscarEmpreendimento.get(id), fluxos: [], unidades: [], imagens: [] })
})

app.put('/api/empreendimentos/:id', (req, reply) => {
  const { id } = req.params
  if (!buscarEmpreendimento.get(id)) return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })

  const dados = sanitizar(req.body || {}, CAMPOS_EMPREENDIMENTO)
  if ('nome' in dados && !dados.nome) {
    return reply.code(400).send({ erro: 'O nome do empreendimento e obrigatorio' })
  }

  atualizar('empreendimentos', id, dados)
  return montarEmpreendimento(id)
})

app.delete('/api/empreendimentos/:id', async (req, reply) => {
  const { id } = req.params
  if (!buscarEmpreendimento.get(id)) return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })

  // O CASCADE limpa as linhas, mas os arquivos precisam sair do disco na mão.
  const imagens = imagensDoEmpreendimento.all(id)
  db.prepare('DELETE FROM empreendimentos WHERE id = ?').run(id)
  await Promise.all(imagens.map((imagem) => apagarArquivo(imagem.arquivo)))

  return reply.code(204).send()
})

/* ------------------------------------------------------------------ */
/* Fluxos de pagamento                                                 */
/* ------------------------------------------------------------------ */

app.post('/api/fluxos', (req, reply) => {
  const dados = sanitizar(req.body || {}, CAMPOS_FLUXO)

  // Fluxo de unidade herda o empreendimento dela — nao da para divergir.
  if (dados.unidade_id) {
    const unidade = buscarUnidade.get(dados.unidade_id)
    if (!unidade) return reply.code(404).send({ erro: 'Unidade nao encontrada' })
    dados.empreendimento_id = unidade.empreendimento_id
  }

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

  // Os vinculos (empreendimento e unidade) nao mudam por edicao.
  const dados = sanitizar(
    req.body || {},
    CAMPOS_FLUXO.filter((c) => c !== 'empreendimento_id' && c !== 'unidade_id'),
  )
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
/* Unidades                                                            */
/* ------------------------------------------------------------------ */

app.get('/api/empreendimentos/:id/unidades', (req, reply) => {
  const { id } = req.params
  if (!buscarEmpreendimento.get(id)) return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  return unidadesDoEmpreendimento.all(id).map(comFluxos)
})

app.post('/api/unidades', (req, reply) => {
  const dados = sanitizar(req.body || {}, CAMPOS_UNIDADE)
  if (!dados.empreendimento_id) return reply.code(400).send({ erro: 'Informe o empreendimento da unidade' })
  if (!buscarEmpreendimento.get(dados.empreendimento_id)) {
    return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  }

  const id = inserir('unidades', dados)
  return reply.code(201).send(comFluxos(buscarUnidade.get(id)))
})

app.put('/api/unidades/:id', (req, reply) => {
  const { id } = req.params
  if (!buscarUnidade.get(id)) return reply.code(404).send({ erro: 'Unidade nao encontrada' })

  // A unidade nao troca de empreendimento por edicao.
  const dados = sanitizar(req.body || {}, CAMPOS_UNIDADE.filter((c) => c !== 'empreendimento_id'))
  atualizar('unidades', id, dados)
  return comFluxos(buscarUnidade.get(id))
})

app.delete('/api/unidades/:id', (req, reply) => {
  const { id } = req.params
  if (!buscarUnidade.get(id)) return reply.code(404).send({ erro: 'Unidade nao encontrada' })

  // ON DELETE CASCADE leva junto os fluxos de pagamento da unidade.
  db.prepare('DELETE FROM unidades WHERE id = ?').run(id)
  return reply.code(204).send()
})

/* ------------------------------------------------------------------ */
/* Imagens (galeria)                                                   */
/* ------------------------------------------------------------------ */

/**
 * Le e joga fora o que o cliente esta enviando. Responder no meio de um upload
 * derruba a conexao antes de o navegador terminar de mandar o corpo, e o fetch
 * do front reporta "Failed to fetch" em vez do erro de verdade.
 */
async function descartarUpload(req) {
  if (!req.isMultipart()) return
  try {
    for await (const parte of req.files()) await parte.toBuffer().catch(() => {})
  } catch {
    // Cliente desistiu ou estourou algum limite do multipart — nada a fazer.
  }
}

app.post('/api/empreendimentos/:id/imagens', async (req, reply) => {
  const { id } = req.params
  if (!buscarEmpreendimento.get(id)) {
    await descartarUpload(req)
    return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  }

  // Novas imagens entram no fim da galeria.
  const { maior } = db
    .prepare('SELECT COALESCE(MAX(ordem), -1) AS maior FROM imagens WHERE empreendimento_id = ?')
    .get(id)

  const salvas = []
  const recusadas = []
  let proximaOrdem = maior + 1

  for await (const parte of req.files()) {
    const extensao = TIPOS_IMAGEM.get(parte.mimetype)
    if (!extensao) {
      // Precisa drenar o stream, senão a próxima parte do multipart trava.
      await parte.toBuffer().catch(() => {})
      recusadas.push({ nome: parte.filename, motivo: 'formato não suportado' })
      continue
    }

    // Nome gerado aqui: o nome enviado pelo cliente nunca toca o disco.
    const arquivo = `${randomUUID()}${extensao || extname(parte.filename || '')}`
    const destino = join(UPLOAD_DIR, arquivo)

    try {
      await pipeline(parte.file, createWriteStream(destino))
    } catch (erro) {
      await apagarArquivo(arquivo)
      app.log.error({ erro }, 'falha ao gravar imagem')
      recusadas.push({ nome: parte.filename, motivo: 'falha ao gravar' })
      continue
    }

    // truncated fica true quando o arquivo estourou o limite de tamanho.
    if (parte.file.truncated) {
      await apagarArquivo(arquivo)
      recusadas.push({ nome: parte.filename, motivo: 'arquivo acima de 12 MB' })
      continue
    }

    const imagemId = db
      .prepare(
        `INSERT INTO imagens (empreendimento_id, arquivo, nome_original, tamanho, ordem)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, arquivo, parte.filename || null, parte.file.bytesRead ?? null, proximaOrdem++).lastInsertRowid

    salvas.push(comUrl(db.prepare('SELECT * FROM imagens WHERE id = ?').get(imagemId)))
  }

  if (salvas.length === 0 && recusadas.length > 0) {
    return reply.code(400).send({ erro: `Nenhuma imagem aceita: ${recusadas[0].motivo}`, recusadas })
  }

  return reply.code(201).send({ imagens: imagensDoEmpreendimento.all(id).map(comUrl), salvas, recusadas })
})

app.delete('/api/imagens/:id', async (req, reply) => {
  const imagem = db.prepare('SELECT * FROM imagens WHERE id = ?').get(req.params.id)
  if (!imagem) return reply.code(404).send({ erro: 'Imagem nao encontrada' })

  db.prepare('DELETE FROM imagens WHERE id = ?').run(imagem.id)
  await apagarArquivo(imagem.arquivo)

  return { imagens: imagensDoEmpreendimento.all(imagem.empreendimento_id).map(comUrl) }
})

/** Recebe os ids na ordem desejada; a primeira posição é a capa. */
app.put('/api/empreendimentos/:id/imagens/ordem', (req, reply) => {
  const { id } = req.params
  if (!buscarEmpreendimento.get(id)) return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })

  const ids = req.body?.ids
  if (!Array.isArray(ids)) return reply.code(400).send({ erro: 'Envie a lista de ids na nova ordem' })

  const doEmpreendimento = new Set(imagensDoEmpreendimento.all(id).map((imagem) => imagem.id))
  const reordenar = db.transaction(() => {
    let posicao = 0
    for (const imagemId of ids) {
      // Ignora id que não pertence a este empreendimento.
      if (!doEmpreendimento.has(Number(imagemId))) continue
      db.prepare('UPDATE imagens SET ordem = ? WHERE id = ?').run(posicao++, imagemId)
    }
  })
  reordenar()

  return { imagens: imagensDoEmpreendimento.all(id).map(comUrl) }
})

/* ------------------------------------------------------------------ */

app.get('/api/health', () => ({
  ok: true,
  empreendimentos: db.prepare('SELECT COUNT(*) AS total FROM empreendimentos').get().total,
}))

/* ------------------------------------------------------------------ */
/* Indicadores de mercado                                              */
/* ------------------------------------------------------------------ */

const indicadores = criarServicoIndicadores({ dataDir: PASTA_DADOS, log: app.log })

// Uma consulta ao Banco Central serve todas as abas: o cache vive aqui, nao
// no navegador. `?forcar=1` fura o cache (o botao "atualizar" da tela).
app.get('/api/indicadores', async (req, reply) => {
  const dados = await indicadores.obter({ forcar: req.query?.forcar === '1' })
  // ⚠️ SEM cache no navegador. Quem decide quando vale consultar o Banco
  // Central e o cache DAQUI (TTL de 6h, 20 min quando falta alguma série).
  // Um `max-age` aqui congelava a resposta na aba aberta: uma leitura sem a
  // Selic ficou meia hora na tela do usuário mesmo com o servidor já correto,
  // porque o Chrome nem chegava a perguntar.
  reply.header('cache-control', 'no-store')
  return dados
})

try {
  await app.listen({ port: PORT, host: '127.0.0.1' })
  // Aquece o cache sem segurar o boot — o primeiro acesso do dia ja abre cheio.
  void indicadores.obter().catch(() => {})
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

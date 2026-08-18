import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import estatico from '@fastify/static'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { extname, join } from 'node:path'
import {
  db,
  migracaoContas,
  CAMPOS_EMPREENDIMENTO,
  CAMPOS_FLUXO,
  CAMPOS_UNIDADE,
  sanitizar,
  PASTA_DADOS,
  UPLOAD_DIR,
} from './db.js'
import { listarBaseDaConta, comUrl } from './base.js'
import { recalcularResumo } from './resumo.js'
import { buscarConta, ehMaster, logoDaConta } from './contas.js'
import { criarServicoIndicadores } from './indicadores.js'
import { criarServicoDeEndereco } from './geocodificar.js'
import { registrarAutenticacao } from './rotas-auth.js'
import { registrarPlataforma } from './rotas-plataforma.js'
import {
  CAMPOS_IMPORTAVEIS,
  fluxoParaColunas,
  lerFluxoDaConstrutora,
  LIMITE_PAYLOAD,
  mesmoNomeDeFluxo,
  montarDiff,
  normalizarCampo,
  normalizarTorres,
  normalizarUnidade,
  PayloadInvalido,
  validarPayloadDaPrevia,
} from './importacao.js'

const app = Fastify({ logger: true })

/** Só formatos que o navegador exibe direto. */
const TIPOS_IMAGEM = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif'],
])
const TAMANHO_MAX = 12 * 1024 * 1024 // 12 MB por imagem

/**
 * O folder da construtora costuma vir com planta, mapa e render em alta — 15 MB
 * cobre isso com folga e ainda barra o arquivo que alguem mandou por engano.
 *
 * E tambem o MAIOR arquivo que o sistema aceita, entao e ele que dimensiona o
 * corte do multipart la embaixo: um teto menor truncaria o folder antes de a
 * rota poder olhar para ele. Cada rota confere o proprio teto depois.
 */
const TAMANHO_MAX_FOLDER = 15 * 1024 * 1024

/**
 * CORS fechado por padrão.
 *
 * Enquanto a API era anônima, refletir qualquer origem não custava nada. Agora
 * que a sessão vive num cookie, `origin: true` com credenciais permitiria a
 * QUALQUER site ler a base do cliente usando a sessão dele. O front é servido
 * pelo mesmo host (o proxy do Vite em desenvolvimento), então o caso normal
 * nem passa por CORS; origens extras entram explicitamente por variável.
 */
const ORIGENS = (process.env.ORIGENS_PERMITIDAS || '')
  .split(',')
  .map((origem) => origem.trim())
  .filter(Boolean)

await app.register(cors, {
  origin: ORIGENS.length > 0 ? ORIGENS : false,
  credentials: true,
})

// throwFileSizeLimit: false faz o arquivo grande chegar TRUNCADO em vez de
// abortar a requisicao com 413 — assim o lote continua e so ele e recusado,
// com um motivo em portugues.
await app.register(multipart, {
  throwFileSizeLimit: false,
  limits: { fileSize: TAMANHO_MAX_FOLDER, files: 20 },
})

// `serve: false`: o plugin entra só pelo `reply.sendFile`. A foto de um
// empreendimento é dado do cliente como qualquer outro — servir a pasta inteira
// deixaria qualquer pessoa com o link ver o material de venda de outra conta.
await app.register(estatico, { root: UPLOAD_DIR, prefix: '/uploads/', serve: false })

const PORT = Number(process.env.PORT || 3210)

// Autenticação antes de tudo: é ela que instala a guarda que fecha as rotas.
registrarAutenticacao(app)
// A área de quem vende — atravessa as contas e exige a marca de operador.
registrarPlataforma(app)

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Toda consulta daqui para baixo leva a conta da sessão. Não existe caminho
 * "sem filtro": o dado de um cliente não aparece para outro nem por engano
 * numa rota nova, porque a query já nasce exigindo o parâmetro.
 */
const contaDe = (req) => req.contexto.conta.id

const buscarEmpreendimento = db.prepare('SELECT * FROM empreendimentos WHERE id = ? AND conta_id = ?')

// Fluxos "gerais": os que valem para o empreendimento inteiro, sem unidade.
const fluxosDoEmpreendimento = db.prepare(
  'SELECT * FROM fluxos_pagamento WHERE empreendimento_id = ? AND unidade_id IS NULL ORDER BY id',
)
const buscarFluxo = db.prepare(
  `SELECT f.* FROM fluxos_pagamento f
     JOIN empreendimentos e ON e.id = f.empreendimento_id
    WHERE f.id = ? AND e.conta_id = ?`,
)

const imagensDoEmpreendimento = db.prepare('SELECT * FROM imagens WHERE empreendimento_id = ? ORDER BY ordem, id')
const buscarImagem = db.prepare(
  `SELECT i.* FROM imagens i
     JOIN empreendimentos e ON e.id = i.empreendimento_id
    WHERE i.id = ? AND e.conta_id = ?`,
)
// Quem entrega o arquivo confere a dona pelo NOME gravado, não pelo caminho.
const buscarImagemDoMaster = db.prepare('SELECT * FROM imagens WHERE arquivo = ?')
const buscarImagemPorArquivo = db.prepare(
  `SELECT i.* FROM imagens i
     JOIN empreendimentos e ON e.id = i.empreendimento_id
    WHERE i.arquivo = ? AND e.conta_id = ?`,
)

// Ordem de leitura do corretor: torre, andar e depois o numero da unidade.
const ORDEM_UNIDADE = `ORDER BY COALESCE(torre, ''), COALESCE(andar, 999999), COALESCE(numero, ''), id`
const unidadesDoEmpreendimento = db.prepare(`SELECT * FROM unidades WHERE empreendimento_id = ? ${ORDEM_UNIDADE}`)
const buscarUnidade = db.prepare(
  `SELECT u.* FROM unidades u
     JOIN empreendimentos e ON e.id = u.empreendimento_id
    WHERE u.id = ? AND e.conta_id = ?`,
)
const fluxosDaUnidade = db.prepare('SELECT * FROM fluxos_pagamento WHERE unidade_id = ? ORDER BY id')

/** Unidade com os fluxos de pagamento dela aninhados. */
function comFluxos(unidade) {
  return { ...unidade, fluxos: fluxosDaUnidade.all(unidade.id) }
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
app.get('/api/empreendimentos', (req) => listarBaseDaConta(contaDe(req)))

app.get('/api/empreendimentos/:id', (req, reply) => {
  const empreendimento = buscarEmpreendimento.get(req.params.id, contaDe(req))
  if (!empreendimento) return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  return montarEmpreendimento(empreendimento.id)
})

/** Empreendimento completo: fluxos gerais, unidades (com fluxos) e galeria. */
function montarEmpreendimento(id) {
  return {
    ...db.prepare('SELECT * FROM empreendimentos WHERE id = ?').get(id),
    fluxos: fluxosDoEmpreendimento.all(id),
    unidades: unidadesDoEmpreendimento.all(id).map(comFluxos),
    imagens: imagensDoEmpreendimento.all(id).map(comUrl),
  }
}

app.post('/api/empreendimentos', (req, reply) => {
  const dados = sanitizar(req.body || {}, CAMPOS_EMPREENDIMENTO)
  if (!dados.nome) return reply.code(400).send({ erro: 'O nome do empreendimento e obrigatorio' })

  // O dono vem da sessão, nunca do corpo da requisição.
  const id = inserir('empreendimentos', { ...dados, conta_id: contaDe(req) })
  return reply.code(201).send({ ...montarEmpreendimento(id), fluxos: [], unidades: [], imagens: [] })
})

app.put('/api/empreendimentos/:id', (req, reply) => {
  const { id } = req.params
  if (!buscarEmpreendimento.get(id, contaDe(req))) {
    return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  }

  const dados = sanitizar(req.body || {}, CAMPOS_EMPREENDIMENTO)
  if ('nome' in dados && !dados.nome) {
    return reply.code(400).send({ erro: 'O nome do empreendimento e obrigatorio' })
  }

  atualizar('empreendimentos', id, dados)
  return montarEmpreendimento(id)
})

app.delete('/api/empreendimentos/:id', async (req, reply) => {
  const { id } = req.params
  const empreendimento = buscarEmpreendimento.get(id, contaDe(req))
  if (!empreendimento) {
    return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  }

  // O CASCADE limpa as linhas, mas os arquivos precisam sair do disco na mão —
  // as fotos da galeria e o folder, que não é imagem e não está na tabela delas.
  const imagens = imagensDoEmpreendimento.all(id)
  db.prepare('DELETE FROM empreendimentos WHERE id = ?').run(id)
  await Promise.all(imagens.map((imagem) => apagarArquivo(imagem.arquivo)))
  if (empreendimento.folder_arquivo) await apagarArquivo(empreendimento.folder_arquivo)

  return reply.code(204).send()
})

/* ------------------------------------------------------------------ */
/* Fluxos de pagamento                                                 */
/* ------------------------------------------------------------------ */

// Tabela da construtora × proposta montada em cima dela. NULL segue valendo:
// e o fluxo cadastrado antes da separacao, que ninguem classificou.
const TIPOS_FLUXO = new Set(['construtora', 'personalizado'])

app.post('/api/fluxos', (req, reply) => {
  const conta = contaDe(req)
  const dados = sanitizar(req.body || {}, CAMPOS_FLUXO)

  // Fluxo de unidade herda o empreendimento dela — nao da para divergir.
  if (dados.unidade_id) {
    const unidade = buscarUnidade.get(dados.unidade_id, conta)
    if (!unidade) return reply.code(404).send({ erro: 'Unidade nao encontrada' })
    dados.empreendimento_id = unidade.empreendimento_id
  }

  if (!dados.empreendimento_id) return reply.code(400).send({ erro: 'Informe o empreendimento do fluxo' })
  if (!buscarEmpreendimento.get(dados.empreendimento_id, conta)) {
    return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  }

  if (dados.tipo && !TIPOS_FLUXO.has(dados.tipo)) {
    return reply.code(400).send({ erro: 'Tipo de fluxo invalido' })
  }
  // A origem tem de ser um fluxo DESTA conta: id de fora apontaria a proposta
  // para uma tabela que o dono nem consegue abrir.
  if (dados.fluxo_base_id && !buscarFluxo.get(dados.fluxo_base_id, conta)) {
    return reply.code(404).send({ erro: 'Fluxo de origem nao encontrado' })
  }

  const id = inserir('fluxos_pagamento', dados)
  // A tabela de venda carrega o "valor total do imóvel", que é o preço da
  // unidade quando ela não tem valor próprio — e o m² médio depende dele.
  recalcularResumo(dados.empreendimento_id)
  return reply.code(201).send(db.prepare('SELECT * FROM fluxos_pagamento WHERE id = ?').get(id))
})

app.put('/api/fluxos/:id', (req, reply) => {
  const { id } = req.params
  const fluxo = buscarFluxo.get(id, contaDe(req))
  if (!fluxo) return reply.code(404).send({ erro: 'Fluxo nao encontrado' })

  // Os vinculos (empreendimento, unidade e o fluxo de origem) nao mudam por
  // edicao: eles dizem de ONDE a tabela saiu, e isso nao muda quando alguem
  // corrige um percentual.
  const dados = sanitizar(
    req.body || {},
    CAMPOS_FLUXO.filter((c) => c !== 'empreendimento_id' && c !== 'unidade_id' && c !== 'fluxo_base_id'),
  )
  if (dados.tipo && !TIPOS_FLUXO.has(dados.tipo)) {
    return reply.code(400).send({ erro: 'Tipo de fluxo invalido' })
  }
  atualizar('fluxos_pagamento', id, dados)
  recalcularResumo(fluxo.empreendimento_id)
  return db.prepare('SELECT * FROM fluxos_pagamento WHERE id = ?').get(id)
})

app.delete('/api/fluxos/:id', (req, reply) => {
  const { id } = req.params
  const fluxo = buscarFluxo.get(id, contaDe(req))
  if (!fluxo) return reply.code(404).send({ erro: 'Fluxo nao encontrado' })

  db.prepare('DELETE FROM fluxos_pagamento WHERE id = ?').run(id)
  recalcularResumo(fluxo.empreendimento_id)
  return reply.code(204).send()
})

/* ------------------------------------------------------------------ */
/* Unidades                                                            */
/* ------------------------------------------------------------------ */

app.get('/api/empreendimentos/:id/unidades', (req, reply) => {
  const { id } = req.params
  if (!buscarEmpreendimento.get(id, contaDe(req))) {
    return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  }
  return unidadesDoEmpreendimento.all(id).map(comFluxos)
})

app.post('/api/unidades', (req, reply) => {
  const dados = sanitizar(req.body || {}, CAMPOS_UNIDADE)
  if (!dados.empreendimento_id) return reply.code(400).send({ erro: 'Informe o empreendimento da unidade' })
  if (!buscarEmpreendimento.get(dados.empreendimento_id, contaDe(req))) {
    return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  }

  const id = inserir('unidades', dados)
  // Os números gerais do empreendimento saem das unidades: unidade nova muda a
  // faixa de metragem, o valor do m² e o teto de dormitórios na mesma hora.
  recalcularResumo(dados.empreendimento_id)
  return reply.code(201).send(comFluxos(db.prepare('SELECT * FROM unidades WHERE id = ?').get(id)))
})

app.put('/api/unidades/:id', (req, reply) => {
  const { id } = req.params
  const unidade = buscarUnidade.get(id, contaDe(req))
  if (!unidade) return reply.code(404).send({ erro: 'Unidade nao encontrada' })

  // A unidade nao troca de empreendimento por edicao.
  const dados = sanitizar(req.body || {}, CAMPOS_UNIDADE.filter((c) => c !== 'empreendimento_id'))
  atualizar('unidades', id, dados)
  recalcularResumo(unidade.empreendimento_id)
  return comFluxos(db.prepare('SELECT * FROM unidades WHERE id = ?').get(id))
})

app.delete('/api/unidades/:id', (req, reply) => {
  const { id } = req.params
  const unidade = buscarUnidade.get(id, contaDe(req))
  if (!unidade) return reply.code(404).send({ erro: 'Unidade nao encontrada' })

  // ON DELETE CASCADE leva junto os fluxos de pagamento da unidade.
  db.prepare('DELETE FROM unidades WHERE id = ?').run(id)
  recalcularResumo(unidade.empreendimento_id)
  return reply.code(204).send()
})

/* ------------------------------------------------------------------ */
/* Importação de tabela de unidades                                    */
/* ------------------------------------------------------------------ */

/**
 * A tabela da construtora, já em JSON, comparada com o cadastro.
 *
 * Quem LEU a tabela foi a IA do próprio usuário: a tela dá o prompt pronto,
 * ele cola no ChatGPT dele junto com a planilha e traz o JSON de volta. Não há
 * chave de IA nem chamada a serviço nenhum aqui — o sistema não fala com a
 * OpenAI/Anthropic, fala com quem está na frente da tela.
 *
 * Duas rotas de propósito. Esta só MOSTRA o que aconteceria; a de baixo é a
 * que grava, e só com o que a pessoa confirmou. Uma rota só (colar e aplicar
 * no mesmo clique) faria a leitura errada de uma coluna virar preço errado em
 * trinta apartamentos, sem ninguém ver.
 *
 * ⚠️ Tudo é revalidado aqui. A tela já valida antes de mandar, mas aquilo é
 * conveniência: o corpo desta requisição foi montado a partir de um texto
 * COLADO por uma pessoa, e nada dele é confiável por ter passado pelo front.
 */
app.post('/api/empreendimentos/:id/importacao/previa', (req, reply) => {
  const { id } = req.params
  const empreendimento = buscarEmpreendimento.get(id, contaDe(req))
  if (!empreendimento) {
    return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  }

  if (Buffer.byteLength(JSON.stringify(req.body ?? null), 'utf8') > LIMITE_PAYLOAD) {
    return reply.code(413).send({
      erro: 'A tabela é grande demais para uma importação só. Divida em partes (por torre, por exemplo) e importe uma de cada vez.',
    })
  }

  let lido
  try {
    lido = validarPayloadDaPrevia(req.body)
  } catch (erro) {
    if (erro instanceof PayloadInvalido) {
      return reply.code(400).send({
        erro: erro.problemas.length === 1 ? erro.problemas[0] : `A resposta colada tem ${erro.problemas.length} problemas.`,
        problemas: erro.problemas,
      })
    }
    throw erro
  }

  return {
    ...montarDiff(unidadesDoEmpreendimento.all(id), lido.unidades),
    duvidas: lido.duvidas,
    fluxo_construtora: lido.fluxo_construtora,
    // O cabeçalho da prévia diz de que prédio se trata, quantas torres a
    // tabela deixou concluir e quantas unidades foram identificadas. As torres
    // são uma PROPOSTA: quem confirma ajusta antes de gravar.
    empreendimento: empreendimento.nome,
    torres: lido.torres,
    torresAtual: empreendimento.torres ?? null,
    totalRecebidas: lido.unidades.length,
  }
})

/**
 * Aplica o que foi revisado. Tudo numa transação: metade de uma tabela de
 * cinquenta unidades gravada é pior do que nenhuma — ninguém saberia onde a
 * importação parou.
 */
app.post('/api/empreendimentos/:id/importacao/confirmar', (req, reply) => {
  const { id } = req.params
  if (!buscarEmpreendimento.get(id, contaDe(req))) {
    return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  }

  const corpo = req.body || {}
  const criar = Array.isArray(corpo.criar) ? corpo.criar : []
  const atualizar_ = Array.isArray(corpo.atualizar) ? corpo.atualizar : []
  const marcarIndisponiveis = Array.isArray(corpo.marcarIndisponiveis) ? corpo.marcarIndisponiveis : []

  // A condição de pagamento e as torres são REVALIDADAS aqui, como todo o
  // resto: a condição vira tabela de venda gravada em cada unidade, e um
  // percentual lido errado é o tipo de número que ninguém desconfia depois.
  const problemas = []
  const fluxoGeral = lerFluxoDaConstrutora(corpo.fluxo_construtora, 'da tabela', problemas)
  const fluxoDoItem = (item) => lerFluxoDaConstrutora(item?.fluxo, 'da unidade', problemas)
  // Só grava quando veio informado: prévia sem conclusão sobre torres não pode
  // apagar o número que já estava no cadastro.
  const torres = normalizarTorres(corpo.torres, problemas)

  if (criar.length === 0 && atualizar_.length === 0 && marcarIndisponiveis.length === 0 && torres === null) {
    return reply.code(400).send({ erro: 'Nada foi marcado para importar' })
  }

  const fluxosPorItem = new Map()
  for (const item of [...criar, ...atualizar_]) fluxosPorItem.set(item, fluxoDoItem(item))

  if (problemas.length > 0) {
    return reply.code(400).send({
      erro: problemas.length === 1 ? problemas[0] : `A importação tem ${problemas.length} problemas.`,
      problemas,
    })
  }

  // O padrão é gravar quando há condição de pagamento — mas quem confirma
  // manda: a tela desmarca para quem só quer atualizar preços.
  const gravarFluxo = corpo.gravarFluxo !== false

  // Só id de unidade DESTE empreendimento é aceito: um id de outra conta
  // enviado à mão não pode alterar nada.
  const daCasa = new Set(unidadesDoEmpreendimento.all(id).map((u) => u.id))

  /**
   * A linha que a pessoa CORRIGIU na prévia antes de confirmar.
   *
   * A marca é só para o histórico: os valores corrigidos chegam misturados aos
   * lidos e são revalidados igual — o que a marca responde depois é "de onde
   * veio este número", quando alguém abrir a importação de terça e estranhar
   * um preço que a tabela não tinha.
   */
  const foiCorrigida = (item) => item?.corrigida === true

  const aplicar = db.transaction(() => {
    const contagens = { criadas: 0, atualizadas: 0, indisponiveis: 0, corrigidas: 0, fluxosCriados: 0, fluxosAtualizados: 0 }

    /**
     * A tabela de venda da unidade, criada ou ATUALIZADA.
     *
     * O fluxo é por unidade (a tabela geral, de `unidade_id` nulo, é legado).
     * E o casamento é pelo NOME: a construtora manda a planilha de novo toda
     * semana, e sem isso a mesma "Tabela da construtora" viraria uma cópia por
     * importação até o cartão da unidade ficar ilegível.
     */
    const gravarFluxoDaUnidade = (unidadeId, fluxo, valorDaUnidade) => {
      if (!gravarFluxo || !fluxo) return

      const colunas = fluxoParaColunas(fluxo, valorDaUnidade)
      // A proposta que o corretor montou fica FORA do casamento por nome: ela
      // e trabalho dele em cima da tabela, e a planilha da semana seguinte nao
      // pode sobrescrever o que ele ja apresentou ao cliente.
      const existente = fluxosDaUnidade
        .all(unidadeId)
        .find((f) => f.tipo !== 'personalizado' && mesmoNomeDeFluxo(f.nome, colunas.nome))

      const dados = sanitizar(
        { ...colunas, empreendimento_id: Number(id), unidade_id: unidadeId },
        CAMPOS_FLUXO,
      )

      if (existente) {
        atualizar('fluxos_pagamento', existente.id, dados)
        contagens.fluxosAtualizados += 1
        return
      }

      inserir('fluxos_pagamento', dados)
      contagens.fluxosCriados += 1
    }

    for (const bruta of criar) {
      const campos = normalizarUnidade(bruta)
      const dados = sanitizar({ ...campos, empreendimento_id: Number(id) }, CAMPOS_UNIDADE)
      const novaId = Number(inserir('unidades', dados))
      contagens.criadas += 1
      if (foiCorrigida(bruta)) contagens.corrigidas += 1
      gravarFluxoDaUnidade(novaId, fluxosPorItem.get(bruta) ?? fluxoGeral, dados.valor ?? null)
    }

    for (const item of atualizar_) {
      const alvo = Number(item?.id)
      if (!daCasa.has(alvo)) continue

      const dados = {}
      for (const [campo, valor] of Object.entries(item?.campos || {})) {
        if (!CAMPOS_IMPORTAVEIS.includes(campo)) continue
        dados[campo] = normalizarCampo(campo, valor)
      }

      if (Object.keys(dados).length > 0) {
        atualizar('unidades', alvo, dados)
        contagens.atualizadas += 1
        if (foiCorrigida(item)) contagens.corrigidas += 1
      }

      // O preço que a tabela acabou de trazer manda na conta do fluxo; sem ele,
      // o que já estava gravado na unidade.
      const preco = dados.valor ?? buscarUnidade.get(alvo, contaDe(req))?.valor ?? null
      gravarFluxoDaUnidade(alvo, fluxosPorItem.get(item) ?? fluxoGeral, preco)
    }

    // A unidade que sumiu da tabela nova só muda de STATUS. Apagar seria
    // perder o histórico de um apartamento por causa de uma coluna esquecida
    // na planilha da construtora.
    for (const bruto of marcarIndisponiveis) {
      const alvo = Number(bruto)
      if (!daCasa.has(alvo)) continue
      atualizar('unidades', alvo, { status: 'indisponivel' })
      contagens.indisponiveis += 1
    }

    // As torres são do empreendimento, não das unidades: entram uma vez só.
    if (torres !== null) atualizar('empreendimentos', Number(id), { torres })

    // O histórico guarda o que FOI gravado, campo a campo (as áreas separadas,
    // o detalhe das vagas e o resto entram porque `normalizarUnidade` devolve
    // todos os campos importáveis) e de onde cada linha veio: lida da tabela ou
    // corrigida à mão na prévia.
    const resumo = {
      contagens,
      torres,
      criadas: criar.map((bruta) => ({ ...normalizarUnidade(bruta), corrigida: foiCorrigida(bruta) })),
      atualizadas: atualizar_
        .filter((i) => daCasa.has(Number(i?.id)))
        .map((item) => ({ ...item, corrigida: foiCorrigida(item) })),
      indisponiveis: marcarIndisponiveis.map(Number).filter((i) => daCasa.has(i)),
    }

    const importacaoId = db
      .prepare('INSERT INTO importacoes (empreendimento_id, resumo) VALUES (?, ?)')
      .run(id, JSON.stringify(resumo)).lastInsertRowid

    return { contagens, importacaoId }
  })

  const { contagens, importacaoId } = aplicar()

  // Os números gerais do empreendimento saem das unidades — a importação mexeu
  // em várias de uma vez, então o recálculo roda uma vez no fim.
  recalcularResumo(Number(id))

  return {
    importacaoId,
    ...contagens,
    torres,
    unidades: unidadesDoEmpreendimento.all(id).map(comFluxos),
    // A condição de pagamento JÁ virou tabela de venda nas unidades (uma por
    // unidade); aqui ela volta só para a tela repetir o que foi lido.
    fluxo_construtora: fluxoGeral,
  }
})

app.get('/api/empreendimentos/:id/importacoes', (req, reply) => {
  const { id } = req.params
  if (!buscarEmpreendimento.get(id, contaDe(req))) {
    return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  }

  return db
    .prepare('SELECT id, criado_em, resumo FROM importacoes WHERE empreendimento_id = ? ORDER BY id DESC')
    .all(id)
    .map((linha) => {
      let contagens = null
      try {
        contagens = JSON.parse(linha.resumo)?.contagens ?? null
      } catch {
        // Resumo ilegível não pode derrubar a lista do histórico.
      }
      return { id: linha.id, criado_em: linha.criado_em, contagens }
    })
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

/**
 * A foto só sai daqui para quem é da conta dona dela. O nome do arquivo é um
 * UUID, então adivinhar é inviável — mas link vazado por engano (um print, um
 * grupo de WhatsApp) deixaria de ser "difícil de achar" e passaria a ser
 * "aberto para sempre", que é o oposto de material de venda de um cliente.
 */
app.get('/uploads/:arquivo', (req, reply) => {
  const { arquivo } = req.params
  // O master não tem conta: na visão de suporte ele vê a foto de qualquer
  // cliente, e é a marca dele — não o link — que abre a porta.
  const master = ehMaster(req.contexto.usuario)

  const imagem = master ? buscarImagemDoMaster.get(arquivo) : buscarImagemPorArquivo.get(arquivo, contaDe(req))
  if (imagem) return reply.sendFile(imagem.arquivo)

  // A logo entra pelo MESMO portão. Ela é da conta (e não de um
  // empreendimento), então a pergunta muda de tabela mas continua a mesma:
  // de quem é este arquivo. Toda a equipe da conta precisa vê-la — é ela que
  // aparece no PDF que qualquer corretor exporta.
  const dona = master ? buscarContaPelaLogo.get(arquivo) : buscarLogoDaConta.get(arquivo, contaDe(req))
  if (dona) return reply.sendFile(dona.logo_arquivo)

  return reply.code(404).send({ erro: 'Imagem nao encontrada' })
})

/* ------------------------------------------------------------------ */
/* Logo da conta                                                       */
/* ------------------------------------------------------------------ */

/** Formatos que navegador e impressora tratam igual — e que aceitam fundo transparente. */
const TIPOS_LOGO = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
])

/** É uma marca, não a foto do prédio: 2 MB sobra para qualquer logo. */
const TAMANHO_MAX_LOGO = 2 * 1024 * 1024

const buscarContaPelaLogo = db.prepare('SELECT * FROM contas WHERE logo_arquivo = ?')
const buscarLogoDaConta = db.prepare('SELECT * FROM contas WHERE logo_arquivo = ? AND id = ?')

/**
 * A marca da imobiliária no material impresso.
 *
 * Mesma mecânica da galeria: o arquivo nasce com nome de UUID em data/uploads
 * (o nome enviado pelo cliente nunca toca o disco) e quem entrega confere a
 * dona. O que muda é o teto — e a TROCA: o arquivo novo é gravado antes de o
 * antigo sair do disco, senão uma falha no meio deixaria a conta sem logo
 * nenhuma no meio de uma apresentação.
 */
app.post('/api/conta/logo', async (req, reply) => {
  const { conta, usuario } = req.contexto
  if (usuario.papel !== 'dono') {
    await descartarUpload(req)
    return reply.code(403).send({ erro: 'Somente o dono da conta pode alterar a logo' })
  }
  if (!req.isMultipart()) return reply.code(400).send({ erro: 'Envie o arquivo da logo' })

  const parte = await req.file()
  if (!parte) return reply.code(400).send({ erro: 'Envie o arquivo da logo' })

  const extensao = TIPOS_LOGO.get(parte.mimetype)
  if (!extensao) {
    // Precisa drenar o stream, senão a conexão fica pendurada.
    await parte.toBuffer().catch(() => {})
    return reply.code(400).send({ erro: 'A logo precisa ser PNG, JPG ou WEBP' })
  }

  const conteudo = await parte.toBuffer()
  // `throwFileSizeLimit: false` TRUNCA em vez de recusar — o tamanho do que
  // chegou é o único número confiável aqui, e o arquivo só vai ao disco depois.
  if (parte.file.truncated || conteudo.length > TAMANHO_MAX_LOGO) {
    return reply.code(400).send({ erro: 'A logo precisa ter até 2 MB' })
  }

  const anterior = buscarConta.get(conta.id)?.logo_arquivo ?? null
  const arquivo = `${randomUUID()}${extensao}`

  try {
    await writeFile(join(UPLOAD_DIR, arquivo), conteudo)
  } catch (erro) {
    app.log.error({ erro }, 'falha ao gravar a logo da conta')
    return reply.code(500).send({ erro: 'Não foi possível gravar a logo agora' })
  }

  db.prepare("UPDATE contas SET logo_arquivo = ?, atualizado_em = datetime('now') WHERE id = ?").run(arquivo, conta.id)
  if (anterior && anterior !== arquivo) await apagarArquivo(anterior)

  return reply.code(201).send({ logo: logoDaConta(buscarConta.get(conta.id)) })
})

app.delete('/api/conta/logo', async (req, reply) => {
  const { conta, usuario } = req.contexto
  if (usuario.papel !== 'dono') {
    return reply.code(403).send({ erro: 'Somente o dono da conta pode remover a logo' })
  }

  const atual = buscarConta.get(conta.id)?.logo_arquivo ?? null
  // A configuração de posição/tamanho fica: quem remove a logo hoje costuma
  // mandar a nova amanhã, e refazer os ajustes seria trabalho repetido.
  db.prepare("UPDATE contas SET logo_arquivo = NULL, atualizado_em = datetime('now') WHERE id = ?").run(conta.id)
  if (atual) await apagarArquivo(atual)

  return { logo: logoDaConta(buscarConta.get(conta.id)) }
})

app.post('/api/empreendimentos/:id/imagens', async (req, reply) => {
  const { id } = req.params
  if (!buscarEmpreendimento.get(id, contaDe(req))) {
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

    // `truncated` fica true quando o arquivo estourou o corte do multipart —
    // que é o teto do FOLDER, o maior do sistema. A foto tem teto próprio e
    // menor, então o tamanho do que chegou também é conferido aqui.
    if (parte.file.truncated || (parte.file.bytesRead ?? 0) > TAMANHO_MAX) {
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
  const imagem = buscarImagem.get(req.params.id, contaDe(req))
  if (!imagem) return reply.code(404).send({ erro: 'Imagem nao encontrada' })

  db.prepare('DELETE FROM imagens WHERE id = ?').run(imagem.id)
  await apagarArquivo(imagem.arquivo)

  return { imagens: imagensDoEmpreendimento.all(imagem.empreendimento_id).map(comUrl) }
})

/** Recebe os ids na ordem desejada; a primeira posição é a capa. */
app.put('/api/empreendimentos/:id/imagens/ordem', (req, reply) => {
  const { id } = req.params
  if (!buscarEmpreendimento.get(id, contaDe(req))) {
    return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  }

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
/* Folder do empreendimento (PDF)                                      */
/* ------------------------------------------------------------------ */

/** Todo PDF comeca com estes cinco bytes; e a unica prova que temos do formato. */
const ASSINATURA_PDF = Buffer.from('%PDF-', 'ascii')

/** O trio de colunas do folder, do jeito que a tela guarda no empreendimento. */
const folderDo = (empreendimento) => ({
  folder_arquivo: empreendimento?.folder_arquivo ?? null,
  folder_nome: empreendimento?.folder_nome ?? null,
  folder_tamanho: empreendimento?.folder_tamanho ?? null,
})

/**
 * O folder entra pela mesma mecanica da galeria: o arquivo nasce com nome de
 * UUID em data/uploads (o nome enviado pelo cliente NUNCA toca o disco) e quem
 * entrega confere a dona.
 *
 * O `content-type` declarado pelo navegador nao basta: renomear .exe para .pdf
 * muda o mimetype junto. Por isso o conteudo tambem e conferido — se nao
 * comeca com %PDF-, nao e PDF, e o que a tela promete abrir numa aba e um PDF.
 *
 * Trocar o folder GRAVA O NOVO ANTES de apagar o antigo: uma falha no meio
 * deixaria o empreendimento sem folder nenhum na frente do cliente.
 */
app.post('/api/empreendimentos/:id/folder', async (req, reply) => {
  const { id } = req.params
  const empreendimento = buscarEmpreendimento.get(id, contaDe(req))
  if (!empreendimento) {
    await descartarUpload(req)
    return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })
  }
  if (!req.isMultipart()) return reply.code(400).send({ erro: 'Envie o arquivo do folder' })

  const parte = await req.file()
  if (!parte) return reply.code(400).send({ erro: 'Envie o arquivo do folder' })

  if (parte.mimetype !== 'application/pdf') {
    // Precisa drenar o stream, senão a conexão fica pendurada.
    await parte.toBuffer().catch(() => {})
    return reply.code(400).send({ erro: 'O folder precisa ser um arquivo PDF' })
  }

  const conteudo = await parte.toBuffer()
  // `throwFileSizeLimit: false` TRUNCA em vez de recusar — o tamanho do que
  // chegou é o único número confiável aqui, e o arquivo só vai ao disco depois.
  if (parte.file.truncated || conteudo.length > TAMANHO_MAX_FOLDER) {
    return reply.code(400).send({ erro: 'O folder precisa ter até 15 MB' })
  }
  if (!conteudo.subarray(0, ASSINATURA_PDF.length).equals(ASSINATURA_PDF)) {
    return reply.code(400).send({ erro: 'O arquivo enviado não é um PDF' })
  }

  const anterior = empreendimento.folder_arquivo ?? null
  const arquivo = `${randomUUID()}.pdf`

  try {
    await writeFile(join(UPLOAD_DIR, arquivo), conteudo)
  } catch (erro) {
    app.log.error({ erro }, 'falha ao gravar o folder do empreendimento')
    return reply.code(500).send({ erro: 'Não foi possível gravar o folder agora' })
  }

  atualizar('empreendimentos', Number(id), {
    folder_arquivo: arquivo,
    // O nome original é do usuário: entra limpo e com teto, e nunca vira caminho.
    folder_nome: (parte.filename || 'folder.pdf').trim().slice(0, 160) || 'folder.pdf',
    folder_tamanho: conteudo.length,
  })
  if (anterior && anterior !== arquivo) await apagarArquivo(anterior)

  return reply.code(201).send(folderDo(buscarEmpreendimento.get(id, contaDe(req))))
})

/**
 * Serve o folder para dentro da aba do navegador.
 *
 * `inline` (e não `attachment`) porque o corretor abre o folder na frente do
 * cliente — baixar um arquivo para depois procurá-lo na pasta de downloads
 * interrompe a conversa. O nome ORIGINAL vai no cabeçalho em duas formas: uma
 * só com caracteres seguros (navegador antigo) e a `filename*` com o nome de
 * verdade, acentos e tudo.
 *
 * A dona é conferida como em `/uploads`: o arquivo tem nome de UUID, mas link
 * vazado por engano não pode virar acesso permanente ao material de um cliente.
 */
app.get('/api/empreendimentos/:id/folder', (req, reply) => {
  const empreendimento = buscarEmpreendimento.get(req.params.id, contaDe(req))
  if (!empreendimento?.folder_arquivo) {
    return reply.code(404).send({ erro: 'Folder nao encontrado' })
  }

  const nome = empreendimento.folder_nome || 'folder.pdf'
  const simples = nome.replace(/[^\w .-]/g, '_')

  reply.header('content-type', 'application/pdf')
  reply.header(
    'content-disposition',
    `inline; filename="${simples}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
  )
  return reply.sendFile(empreendimento.folder_arquivo)
})

app.delete('/api/empreendimentos/:id/folder', async (req, reply) => {
  const { id } = req.params
  const empreendimento = buscarEmpreendimento.get(id, contaDe(req))
  if (!empreendimento) return reply.code(404).send({ erro: 'Empreendimento nao encontrado' })

  const atual = empreendimento.folder_arquivo ?? null
  atualizar('empreendimentos', Number(id), { folder_arquivo: null, folder_nome: null, folder_tamanho: null })
  if (atual) await apagarArquivo(atual)

  return folderDo(buscarEmpreendimento.get(id, contaDe(req)))
})

/* ------------------------------------------------------------------ */

// Rota pública de saúde: sem contagem de dados, que agora são de alguém.
app.get('/api/health', () => ({ ok: true }))

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

/* ------------------------------------------------------------------ */
/* Endereco no mapa                                                    */
/* ------------------------------------------------------------------ */

const endereco = criarServicoDeEndereco({ log: app.log })

// Buscar o endereco e o que substitui digitar latitude e longitude a mao.
app.get('/api/enderecos', async (req, reply) => {
  try {
    const dados = await endereco.buscar(req.query?.q)
    reply.header('cache-control', 'no-store')
    return dados
  } catch (erro) {
    // 502: quem falhou foi o serviço de fora, não o pedido de quem cadastra —
    // e a tela responde a isso oferecendo o ajuste manual.
    return reply.code(502).send({
      erro: 'A busca de endereços não respondeu agora. Informe as coordenadas à mão ou tente de novo.',
      detalhe: String(erro?.message || erro),
    })
  }
})

// O caminho inverso: o pino foi arrastado, de que endereco e aquele ponto.
app.get('/api/enderecos/ponto', async (req, reply) => {
  try {
    const dados = await endereco.reverso(req.query?.lat, req.query?.lon)
    reply.header('cache-control', 'no-store')
    return dados
  } catch (erro) {
    return reply.code(502).send({
      erro: 'Não foi possível descobrir o endereço deste ponto agora.',
      detalhe: String(erro?.message || erro),
    })
  }
})

try {
  if (migracaoContas) {
    app.log.warn(
      migracaoContas,
      'empreendimentos sem dono foram adotados por uma conta — provisione o primeiro usuário com `npm run provisionar`',
    )
  }

  await app.listen({ port: PORT, host: '127.0.0.1' })
  // Aquece o cache sem segurar o boot — o primeiro acesso do dia ja abre cheio.
  void indicadores.obter().catch(() => {})
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

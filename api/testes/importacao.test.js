/**
 * A importação de tabela de unidades, de ponta a ponta e contra a API real.
 *
 * Quem lê a tabela da construtora é a IA do próprio usuário (o ChatGPT dele,
 * fora do sistema): ele copia o prompt da tela, cola a planilha lá e traz o
 * JSON de volta. Então o que a API recebe é um texto COLADO por uma pessoa —
 * e é exatamente por isso que a rota revalida tudo. É o que estes testes
 * exercem, junto do que quebra caro: gravar sem confirmação, casar a linha com
 * a unidade ERRADA (e sobrescrever o preço de outro apartamento), apagar quem
 * sumiu da tabela e aplicar metade de uma planilha de cinquenta unidades.
 */
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const executar = promisify(execFile)
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = Number(process.env.PORTA_TESTE_IMPORTACAO || 3321)
const BASE = `http://127.0.0.1:${PORTA}`

let pasta
let servidor
let sessao

function criarCliente() {
  let cookie = null
  return {
    async pedir(caminho, { metodo = 'GET', corpo } = {}) {
      const resposta = await fetch(`${BASE}${caminho}`, {
        method: metodo,
        headers: {
          ...(corpo ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
      })
      for (const linha of resposta.headers.getSetCookie?.() ?? []) {
        cookie = /Max-Age=0/i.test(linha) ? null : linha.split(';')[0]
      }
      const texto = await resposta.text()
      return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null }
    },
  }
}

before(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'compara-importacao-'))

  const ambiente = { ...process.env, DB_FILE: join(pasta, 'teste.db'), LOG_LEVEL: 'silent' }

  servidor = spawn('node', ['src/server.js'], {
    cwd: RAIZ,
    env: { ...ambiente, PORT: String(PORTA) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const limite = Date.now() + 15000
  for (;;) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break
    } catch {
      // ainda subindo
    }
    if (Date.now() > limite) throw new Error('a API não subiu a tempo')
    await new Promise((r) => setTimeout(r, 150))
  }

  // Uma conta com dono, pelo mesmo caminho que uma venda percorre.
  const { stdout } = await executar(
    'node',
    [
      'src/provisionar.js',
      '--conta', 'Imobiliária Tabela',
      '--plano', 'equipe',
      '--nome', 'Carla',
      '--email', 'carla@tabela.com.br',
    ],
    { cwd: RAIZ, env: ambiente },
  )
  const token = stdout.match(/definir-senha\/([\w-]+)/)?.[1]
  assert.ok(token, `nenhum link de senha na saída:\n${stdout}`)

  sessao = criarCliente()
  await sessao.pedir('/api/auth/definir-senha', { metodo: 'POST', corpo: { token, senha: 'tabela-2026-segura' } })
  const login = await sessao.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'carla@tabela.com.br', senha: 'tabela-2026-segura' },
  })
  assert.equal(login.status, 200)
})

after(async () => {
  servidor?.kill()
  if (pasta) await rm(pasta, { recursive: true, force: true })
})

/** Cria um empreendimento vazio e devolve o id. */
async function novoEmpreendimento(nome) {
  const { status, corpo } = await sessao.pedir('/api/empreendimentos', { metodo: 'POST', corpo: { nome } })
  assert.equal(status, 201)
  return corpo.id
}

const previa = (id, corpo) => sessao.pedir(`/api/empreendimentos/${id}/importacao/previa`, { metodo: 'POST', corpo })

const confirmar = (id, corpo) =>
  sessao.pedir(`/api/empreendimentos/${id}/importacao/confirmar`, { metodo: 'POST', corpo })

/* ------------------------------------------------------------------ */

test('a prévia recusa payload malformado, dizendo o que está errado', async () => {
  const id = await novoEmpreendimento('Residencial Validação')

  const casos = [
    [{}, /lista "unidades"/],
    [{ unidades: [] }, /vazia/],
    [{ unidades: 'Apto 101' }, /lista "unidades"/],
    [{ unidades: [{ identificacao: 'Apto 101', status: 'talvez' }] }, /não é reconhecido/],
    [{ unidades: [{ identificacao: 'Apto 101', valor: 'oitocentos mil' }] }, /não é um número válido/],
    [{ unidades: [{ identificacao: 'Apto 101', valor: { total: 1 } }] }, /precisa ser número/],
    [{ unidades: [{ preco: 500000 }] }, /Campo desconhecido "preco"/],
    [{ unidades: [{ metragem: 70 }] }, /identificação, torre nem número/],
    [{ unidades: [{ identificacao: 'Apto 101' }], duvidas: 'nenhuma' }, /"duvidas" precisa ser uma lista/],
  ]

  for (const [corpo, esperado] of casos) {
    const resposta = await previa(id, corpo)
    assert.equal(resposta.status, 400, JSON.stringify(corpo))
    const texto = [resposta.corpo.erro, ...(resposta.corpo.problemas ?? [])].join(' | ')
    assert.match(texto, esperado)
  }

  // Nada foi gravado por nenhuma das tentativas.
  assert.deepEqual((await sessao.pedir(`/api/empreendimentos/${id}/unidades`)).corpo, [])
})

test('a prévia não grava nada: só mostra o que aconteceria', async () => {
  const id = await novoEmpreendimento('Residencial Prévia')

  const resposta = await previa(id, {
    unidades: [
      { identificacao: 'Apto 101', torre: 'A', numero: '101', metragem: 70, valor: 500000, status: 'disponivel' },
      { identificacao: 'Apto 102', torre: 'A', numero: '102', metragem: 82.5, valor: 620000, status: 'vendida' },
    ],
    duvidas: ['A coluna "G" pode ser vagas de garagem.'],
  })

  assert.equal(resposta.status, 200)
  assert.equal(resposta.corpo.totalRecebidas, 2)
  assert.equal(resposta.corpo.novas.length, 2)
  assert.equal(resposta.corpo.alteradas.length, 0)
  assert.equal(resposta.corpo.ausentes.length, 0)
  assert.equal(resposta.corpo.duvidas.length, 1)

  // O banco continua igual, e nenhuma importação entrou no histórico.
  assert.deepEqual((await sessao.pedir(`/api/empreendimentos/${id}/unidades`)).corpo, [])
  assert.deepEqual((await sessao.pedir(`/api/empreendimentos/${id}/importacoes`)).corpo, [])
})

test('confirmar cria, atualiza e marca indisponível — tudo numa transação, com histórico', async () => {
  const id = await novoEmpreendimento('Residencial Confirma')

  // Duas unidades já cadastradas: uma muda de preço, a outra some da tabela.
  const a = await sessao.pedir('/api/unidades', {
    metodo: 'POST',
    corpo: { empreendimento_id: id, identificacao: 'Apto 101', torre: 'A', numero: '101', metragem: 70, valor: 500000, status: 'Disponível' },
  })
  const b = await sessao.pedir('/api/unidades', {
    metodo: 'POST',
    corpo: { empreendimento_id: id, identificacao: 'Apto 102', torre: 'A', numero: '102', metragem: 82, valor: 600000, status: 'Disponível' },
  })

  const lida = await previa(id, {
    unidades: [
      { identificacao: 'Apto 101', torre: 'A', numero: '101', metragem: 70, valor: 545000, status: 'reservada' },
      { identificacao: 'Apto 201', torre: 'A', numero: '201', metragem: 95, valor: 780000, status: 'disponivel' },
    ],
  })

  assert.equal(lida.status, 200)
  assert.equal(lida.corpo.novas.length, 1)
  assert.equal(lida.corpo.alteradas.length, 1)
  assert.equal(lida.corpo.ausentes.length, 1)

  const alterada = lida.corpo.alteradas[0]
  assert.equal(alterada.id, a.corpo.id)
  assert.deepEqual(alterada.campos.sort(), ['status', 'valor'])
  assert.equal(alterada.antes.valor, 500000)
  assert.equal(alterada.depois.valor, 545000)
  // A metragem veio igual: campo sem mudança não entra no diff.
  assert.ok(!alterada.campos.includes('metragem'))

  assert.equal(lida.corpo.ausentes[0].id, b.corpo.id)

  const aplicado = await confirmar(id, {
    criar: lida.corpo.novas.map((n) => n.campos),
    atualizar: [{ id: alterada.id, campos: alterada.depois }],
    marcarIndisponiveis: [b.corpo.id],
  })

  assert.equal(aplicado.status, 200)
  assert.deepEqual(
    { criadas: aplicado.corpo.criadas, atualizadas: aplicado.corpo.atualizadas, indisponiveis: aplicado.corpo.indisponiveis },
    { criadas: 1, atualizadas: 1, indisponiveis: 1 },
  )

  const unidades = (await sessao.pedir(`/api/empreendimentos/${id}/unidades`)).corpo
  assert.equal(unidades.length, 3, 'nada é apagado — a ausente só muda de status')

  const porNumero = Object.fromEntries(unidades.map((u) => [u.numero, u]))
  assert.equal(porNumero['101'].valor, 545000)
  assert.equal(porNumero['101'].status, 'reservada')
  assert.equal(porNumero['102'].status, 'indisponivel')
  assert.equal(porNumero['102'].valor, 600000, 'marcar indisponível não pode mexer em mais nada')
  assert.equal(porNumero['201'].metragem, 95)

  // O resumo do empreendimento acompanhou a importação.
  const empreendimento = (await sessao.pedir(`/api/empreendimentos/${id}`)).corpo
  assert.equal(empreendimento.metragem_max, 95)

  const historico = (await sessao.pedir(`/api/empreendimentos/${id}/importacoes`)).corpo
  assert.equal(historico.length, 1)
  assert.deepEqual(historico[0].contagens, { criadas: 1, atualizadas: 1, indisponiveis: 1 })
})

test('o diff casa por torre+número e, na falta deles, pela identificação', async () => {
  const id = await novoEmpreendimento('Residencial Casamento')

  const comNumero = await sessao.pedir('/api/unidades', {
    metodo: 'POST',
    corpo: { empreendimento_id: id, identificacao: 'Unidade 1204 — Torre B', torre: 'B', numero: '1204', valor: 900000 },
  })
  const soIdentificacao = await sessao.pedir('/api/unidades', {
    metodo: 'POST',
    corpo: { empreendimento_id: id, identificacao: 'Cobertura Duplex', valor: 1500000 },
  })

  const lida = await previa(id, {
    unidades: [
      // Identificação COMPLETAMENTE diferente: quem casa é torre + número.
      { identificacao: 'B-1204', torre: 'b', numero: '1204', valor: 950000 },
      // Sem torre nem número: casa pela identificação, ignorando caixa e espaço.
      { identificacao: 'cobertura  duplex', valor: 1560000 },
    ],
  })

  assert.equal(lida.corpo.novas.length, 0, 'nenhuma das duas pode ser tratada como nova')
  assert.equal(lida.corpo.ausentes.length, 0)
  assert.equal(lida.corpo.alteradas.length, 2)

  const porId = Object.fromEntries(lida.corpo.alteradas.map((x) => [x.id, x]))
  assert.equal(porId[comNumero.corpo.id].depois.valor, 950000)
  assert.equal(porId[soIdentificacao.corpo.id].depois.valor, 1560000)
})

test('número em formato brasileiro chega como texto e é convertido pela regra do projeto', async () => {
  const id = await novoEmpreendimento('Residencial Números')

  const lida = await previa(id, {
    unidades: [
      // O JSON devia trazer number, mas veio texto do jeito que a planilha
      // mostrava. O ponto só é milhar em grupos de 3: "80.5" é oitenta e meio.
      { identificacao: 'Apto 301', numero: '301', valor: 'R$ 1.234.567', metragem: '80,5', status: 'À VENDA' },
      { identificacao: 'Apto 302', numero: '302', valor: '', status: null, metragem: '80.5' },
    ],
  })

  assert.equal(lida.status, 200)
  const [um, dois] = lida.corpo.novas.map((n) => n.campos)

  assert.equal(um.valor, 1234567)
  assert.equal(um.metragem, 80.5)
  assert.equal(um.status, 'disponivel')

  // Campo em branco vira NULL, nunca 0 nem string vazia.
  assert.equal(dois.valor, null)
  assert.equal(dois.status, null)
  assert.equal(dois.metragem, 80.5)

  const aplicado = await confirmar(id, { criar: lida.corpo.novas.map((n) => n.campos) })
  assert.equal(aplicado.status, 200)

  const gravada = (await sessao.pedir(`/api/empreendimentos/${id}/unidades`)).corpo.find((u) => u.numero === '302')
  assert.equal(gravada.valor, null)
  assert.equal(gravada.status, null)
})

test('a importação respeita a conta e recusa o que não dá para aplicar', async () => {
  const id = await novoEmpreendimento('Residencial Guardas')

  // Empreendimento inexistente (ou de outra conta): 404 nas três rotas.
  for (const caminho of ['/importacao/previa', '/importacao/confirmar', '/importacoes']) {
    const metodo = caminho === '/importacoes' ? 'GET' : 'POST'
    const resposta = await sessao.pedir(`/api/empreendimentos/999999${caminho}`, {
      metodo,
      corpo: metodo === 'POST' ? { unidades: [{ identificacao: 'X' }], criar: [{ identificacao: 'X' }] } : undefined,
    })
    assert.equal(resposta.status, 404, caminho)
  }

  // Nada marcado é erro de pedido.
  assert.equal((await confirmar(id, { criar: [], atualizar: [], marcarIndisponiveis: [] })).status, 400)

  // Payload absurdo de grande é recusado antes de virar diff.
  const enorme = { unidades: Array.from({ length: 4000 }, (_, i) => ({ identificacao: `Apto ${i}`, observacoes: 'x'.repeat(60) })) }
  assert.equal((await previa(id, enorme)).status, 413)

  // Id de unidade que não é deste empreendimento é ignorado em silêncio: não
  // altera nada de ninguém.
  const outro = await novoEmpreendimento('Residencial Vizinho')
  const alheia = await sessao.pedir('/api/unidades', {
    metodo: 'POST',
    corpo: { empreendimento_id: outro, identificacao: 'Apto do vizinho', valor: 111000, status: 'Disponível' },
  })

  const resposta = await confirmar(id, { marcarIndisponiveis: [alheia.corpo.id] })
  assert.equal(resposta.status, 200)
  assert.equal(resposta.corpo.indisponiveis, 0)

  const vizinhas = (await sessao.pedir(`/api/empreendimentos/${outro}/unidades`)).corpo
  assert.equal(vizinhas[0].status, 'Disponível')
})

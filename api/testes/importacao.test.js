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
  assert.deepEqual(historico[0].contagens, {
    criadas: 1,
    atualizadas: 1,
    indisponiveis: 1,
    fluxosCriados: 0,
    fluxosAtualizados: 0,
  })
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

/* ------------------------------------------------------------------ */
/* A condição de pagamento vira tabela de venda nas unidades           */
/* ------------------------------------------------------------------ */

/** A tabela rica: entrada parcelada, obra, chaves e pós-chaves. */
const FLUXO_COMPLETO = {
  nome: 'Tabela de lançamento',
  entrada_pct: 10,
  entrada_parcelas: 4,
  parcelas: 30,
  parcela_valor: 3500,
  reforcos_qtd: 6,
  reforco_valor: 20000,
  reforcos_periodicidade: 'semestral',
  chaves_pct: 5,
  financiamento_pct: 30,
  pos_parcelas: 24,
  pos_parcela_valor: 2000,
  pos_reforcos_qtd: 4,
  pos_reforco_valor: 15000,
}

test('a condição de pagamento é revalidada: percentual absurdo e quantidade zerada não passam', async () => {
  const id = await novoEmpreendimento('Residencial Fluxo Inválido')
  const unidades = [{ identificacao: 'Apto 101', torre: 'A', numero: '101', valor: 800000 }]

  const casos = [
    [{ entrada_pct: 250 }, /percentual e veio 250/],
    [{ parcelas: -3 }, /não pode ser negativo/],
    [{ parcela_valor: { total: 1 } }, /precisa ser número/],
    [{ reforco_valor: 'vinte mil' }, /não é um número válido/],
    [{ reforcos_qtd: 6, reforcos_periodicidade: 'quinzenal' }, /periodicidade dos reforços/],
  ]

  for (const [fluxo, esperado] of casos) {
    const resposta = await previa(id, { unidades, fluxo_construtora: fluxo })
    assert.equal(resposta.status, 400, JSON.stringify(fluxo))
    assert.match([resposta.corpo.erro, ...(resposta.corpo.problemas ?? [])].join(' | '), esperado)
  }

  // Quantidade 0 não é erro — é campo em branco, e vira NULL (nunca 0).
  const zerada = await previa(id, { unidades, fluxo_construtora: { parcelas: 0, parcela_valor: 2500 } })
  assert.equal(zerada.status, 200)
  assert.equal(zerada.corpo.fluxo_construtora.parcelas, null)

  // Condição só com nome não é condição nenhuma.
  const vazia = await previa(id, { unidades, fluxo_construtora: { nome: 'Tabela padrão' } })
  assert.equal(vazia.corpo.fluxo_construtora, null)
})

test('confirmar cria UM fluxo por unidade e a reimportação atualiza em vez de duplicar', async () => {
  const id = await novoEmpreendimento('Residencial Fluxo Gravado')

  const unidades = [
    { identificacao: 'Apto 101', torre: 'A', numero: '101', metragem: 70, valor: 800000, status: 'disponivel' },
    { identificacao: 'Apto 102', torre: 'A', numero: '102', metragem: 82, valor: 900000, status: 'disponivel' },
  ]

  const lida = await previa(id, { unidades, fluxo_construtora: FLUXO_COMPLETO })
  assert.equal(lida.status, 200)
  assert.equal(lida.corpo.fluxo_construtora.entrada_parcelas, 4)
  assert.equal(lida.corpo.fluxo_construtora.pos_reforcos_qtd, 4)

  const aplicado = await confirmar(id, {
    criar: lida.corpo.novas.map((n) => n.campos),
    fluxo_construtora: lida.corpo.fluxo_construtora,
  })

  assert.equal(aplicado.status, 200)
  assert.equal(aplicado.corpo.criadas, 2)
  assert.equal(aplicado.corpo.fluxosCriados, 2, 'o fluxo é POR UNIDADE')
  assert.equal(aplicado.corpo.fluxosAtualizados, 0)

  const primeira = aplicado.corpo.unidades.find((u) => u.numero === '101')
  assert.equal(primeira.fluxos.length, 1)
  const fluxo = primeira.fluxos[0]

  assert.equal(fluxo.nome, 'Tabela de lançamento')
  assert.equal(fluxo.unidade_id, primeira.id, 'a tabela geral (unidade_id nulo) é legado — não se usa mais')
  assert.equal(fluxo.entrada_pct, 10)
  assert.equal(fluxo.entrada_valor, 80000, 'o % vira R$ sobre o valor da unidade')
  assert.equal(fluxo.entrada_parcelas, 4)
  assert.equal(fluxo.parcelas, 30)
  assert.equal(fluxo.reforcos_qtd, 6)
  assert.equal(fluxo.pos_parcelas, 24)
  assert.equal(fluxo.pos_reforco_valor, 15000)
  assert.equal(fluxo.cub_valor_imovel, 800000, 'sem base, o detalhe do fluxo abriria em branco')
  // A periodicidade não tem coluna: ela fica escrita onde o corretor lê.
  assert.match(fluxo.descricao, /semestrais/i)

  // O histórico conta o que foi gravado.
  const historico = (await sessao.pedir(`/api/empreendimentos/${id}/importacoes`)).corpo
  assert.equal(historico[0].contagens.fluxosCriados, 2)

  /* --- A tabela da semana seguinte ---------------------------------- */

  // Idêntica byte a byte, não há o que aplicar: o diff vem vazio e ninguém
  // grava fluxo nenhum de novo.
  const identica = await previa(id, { unidades, fluxo_construtora: FLUXO_COMPLETO })
  assert.equal(identica.corpo.novas.length, 0)
  assert.equal(identica.corpo.alteradas.length, 0)

  // A tabela de verdade vem com um preço reajustado — e é aí que o fluxo da
  // unidade tem de ser ATUALIZADO, nunca duplicado.
  const semanaSeguinte = [{ ...unidades[0], valor: 830000 }, unidades[1]]
  const denovo = await previa(id, { unidades: semanaSeguinte, fluxo_construtora: FLUXO_COMPLETO })
  assert.equal(denovo.corpo.alteradas.length, 1)

  const reimportado = await confirmar(id, {
    criar: [],
    atualizar: denovo.corpo.alteradas.map((a) => ({ id: a.id, campos: a.depois })),
    marcarIndisponiveis: [],
    fluxo_construtora: denovo.corpo.fluxo_construtora,
  })

  assert.equal(reimportado.status, 200)
  assert.equal(reimportado.corpo.fluxosCriados, 0, 'reimportar a mesma tabela NÃO acumula cópias')
  assert.equal(reimportado.corpo.fluxosAtualizados, 1)

  const depois = (await sessao.pedir(`/api/empreendimentos/${id}/unidades`)).corpo
  for (const unidade of depois) assert.equal(unidade.fluxos.length, 1, `${unidade.identificacao} ganhou uma cópia`)

  // O fluxo acompanhou o preço novo: base e entrada refeitas.
  const reajustada = depois.find((u) => u.numero === '101')
  assert.equal(reajustada.fluxos[0].cub_valor_imovel, 830000)
  assert.equal(reajustada.fluxos[0].entrada_valor, 83000)
})

test('a unidade com condição própria recebe a dela, e o resto recebe a geral', async () => {
  const id = await novoEmpreendimento('Residencial Fluxo Por Unidade')

  const unidades = [
    { identificacao: 'Apto 201', torre: 'A', numero: '201', valor: 800000 },
    {
      identificacao: 'Cobertura',
      torre: 'A',
      numero: '1201',
      valor: 1500000,
      fluxo: { nome: 'Condição da cobertura', entrada_pct: 20, parcelas: 24, parcela_valor: 8000 },
    },
  ]

  const lida = await previa(id, { unidades, fluxo_construtora: FLUXO_COMPLETO })
  assert.equal(lida.status, 200)
  const cobertura = lida.corpo.novas.find((n) => n.campos.numero === '1201')
  assert.equal(cobertura.fluxo.entrada_pct, 20, 'a prévia mostra a condição própria na linha da unidade')
  assert.equal(lida.corpo.novas.find((n) => n.campos.numero === '201').fluxo, null)

  const aplicado = await confirmar(id, {
    criar: lida.corpo.novas.map((n) => ({ ...n.campos, fluxo: n.fluxo })),
    fluxo_construtora: lida.corpo.fluxo_construtora,
  })
  assert.equal(aplicado.corpo.fluxosCriados, 2)

  const porNumero = Object.fromEntries(aplicado.corpo.unidades.map((u) => [u.numero, u]))
  assert.equal(porNumero['1201'].fluxos[0].nome, 'Condição da cobertura')
  assert.equal(porNumero['1201'].fluxos[0].entrada_pct, 20)
  assert.equal(porNumero['1201'].fluxos[0].entrada_valor, 300000)
  assert.equal(porNumero['201'].fluxos[0].nome, 'Tabela de lançamento')
})

test('o outro formato de tabela: entrada, mensais, balões semestrais e financiamento', async () => {
  const id = await novoEmpreendimento('Residencial Balões')

  // A segunda tabela real do cliente: cada bloco com a QUANTIDADE descrita, e
  // status misto na mesma planilha. Sem pós-chaves — bloco ausente vai null.
  const fluxo = {
    nome: 'Tabela obra',
    entrada_pct: 20,
    parcelas: 48,
    parcela_valor: 2500,
    reforcos_qtd: 8,
    reforco_valor: 25000,
    reforcos_periodicidade: 'semestral',
    financiamento_pct: 40,
  }

  const lida = await previa(id, {
    unidades: [
      { identificacao: 'Apto 301', torre: 'A', numero: '301', valor: 1000000, status: 'disponivel' },
      { identificacao: 'Apto 302', torre: 'A', numero: '302', valor: 1000000, status: 'reservada' },
    ],
    fluxo_construtora: fluxo,
  })

  assert.equal(lida.status, 200)
  // O que a tabela NÃO tem fica null — nunca 0, nunca inventado.
  assert.equal(lida.corpo.fluxo_construtora.pos_parcelas, null)
  assert.equal(lida.corpo.fluxo_construtora.entrada_parcelas, null)
  assert.equal(lida.corpo.fluxo_construtora.chaves_pct, null)

  const aplicado = await confirmar(id, {
    criar: lida.corpo.novas.map((n) => n.campos),
    fluxo_construtora: lida.corpo.fluxo_construtora,
  })

  assert.equal(aplicado.corpo.fluxosCriados, 2)
  const porNumero = Object.fromEntries(aplicado.corpo.unidades.map((u) => [u.numero, u]))
  assert.equal(porNumero['301'].status, 'disponivel')
  assert.equal(porNumero['302'].status, 'reservada', 'status misto na mesma tabela')

  const gravado = porNumero['301'].fluxos[0]
  assert.equal(gravado.parcelas, 48)
  assert.equal(gravado.reforcos_qtd, 8)
  // "Financiamento" é o SALDO NA ENTREGA: o % vira R$ sobre o valor do imóvel.
  assert.equal(gravado.financiamento_pct, 40)
  assert.equal(gravado.financiamento_valor, 400000)
  assert.equal(gravado.pos_parcelas, null)
})

test('desmarcar "criar a condição de pagamento" importa as unidades sem fluxo nenhum', async () => {
  const id = await novoEmpreendimento('Residencial Sem Fluxo')

  const lida = await previa(id, {
    unidades: [{ identificacao: 'Apto 401', torre: 'A', numero: '401', valor: 700000 }],
    fluxo_construtora: FLUXO_COMPLETO,
  })

  const aplicado = await confirmar(id, {
    criar: lida.corpo.novas.map((n) => n.campos),
    fluxo_construtora: lida.corpo.fluxo_construtora,
    gravarFluxo: false,
  })

  assert.equal(aplicado.corpo.criadas, 1)
  assert.equal(aplicado.corpo.fluxosCriados, 0)
  assert.equal(aplicado.corpo.unidades[0].fluxos.length, 0)
})

test('a unidade que não mudou nada também recebe a condição de pagamento da tabela', async () => {
  const id = await novoEmpreendimento('Residencial Só o Fluxo')

  const unidades = [{ identificacao: 'Apto 501', torre: 'A', numero: '501', valor: 600000 }]

  // Primeira importação: sem condição de pagamento nenhuma.
  const primeira = await previa(id, { unidades })
  await confirmar(id, { criar: primeira.corpo.novas.map((n) => n.campos) })

  // A tabela de condições chega DEPOIS, com os mesmos preços de sempre.
  const segunda = await previa(id, { unidades, fluxo_construtora: FLUXO_COMPLETO })
  assert.equal(segunda.corpo.novas.length, 0)
  assert.equal(segunda.corpo.alteradas.length, 0)
  assert.equal(segunda.corpo.inalteradas.length, 1, 'a unidade casada precisa ser conhecida pela prévia')

  const aplicado = await confirmar(id, {
    criar: [],
    // É o que a tela manda: a unidade sem mudança entra só para receber o fluxo.
    atualizar: segunda.corpo.inalteradas.map((u) => ({ id: u.id, campos: {} })),
    fluxo_construtora: segunda.corpo.fluxo_construtora,
  })

  assert.equal(aplicado.status, 200)
  assert.equal(aplicado.corpo.atualizadas, 0, 'nenhum campo mudou — ela não conta como atualizada')
  assert.equal(aplicado.corpo.fluxosCriados, 1)
  assert.equal(aplicado.corpo.unidades[0].fluxos.length, 1)
  assert.equal(aplicado.corpo.unidades[0].fluxos[0].parcelas, 30)
})

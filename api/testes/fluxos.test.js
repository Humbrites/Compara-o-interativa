/**
 * A tabela da construtora e a proposta que o corretor monta em cima dela.
 *
 * O que estes testes seguram: a proposta nasce como fluxo NOVO (a tabela
 * original nunca é alterada por esse caminho), o vínculo com a origem só
 * aceita fluxo da própria conta, a importação carimba o que veio da planilha
 * como tabela da construtora — e a planilha da semana seguinte NÃO sobrescreve
 * a proposta já apresentada ao cliente. No fim, a migração rodando duas vezes
 * no mesmo arquivo, que é como ela vai encontrar o banco de quem já usa.
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
const PORTA = Number(process.env.PORTA_TESTE_FLUXOS || 3331)
const BASE = `http://127.0.0.1:${PORTA}`

let pasta
let servidor
let sessao
let outra

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

/** Provisiona uma conta pela CLI e devolve o cliente já logado. */
async function entrar(ambiente, { conta, nome, email, senha }) {
  const { stdout } = await executar(
    'node',
    ['src/provisionar.js', '--conta', conta, '--plano', 'equipe', '--nome', nome, '--email', email],
    { cwd: RAIZ, env: ambiente },
  )
  const token = stdout.match(/definir-senha\/([\w-]+)/)?.[1]
  assert.ok(token, `nenhum link de senha na saída:\n${stdout}`)

  const cliente = criarCliente()
  await cliente.pedir('/api/auth/definir-senha', { metodo: 'POST', corpo: { token, senha } })
  const login = await cliente.pedir('/api/auth/login', { metodo: 'POST', corpo: { identificador: email, senha } })
  assert.equal(login.status, 200)
  return cliente
}

before(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'compara-fluxos-'))

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

  sessao = await entrar(ambiente, {
    conta: 'Imobiliária Proposta',
    nome: 'Rita',
    email: 'rita@proposta.com.br',
    senha: 'proposta-2026-segura',
  })
  outra = await entrar(ambiente, {
    conta: 'Imobiliária Vizinha',
    nome: 'Caio',
    email: 'caio@vizinha.com.br',
    senha: 'vizinha-2026-segura',
  })
})

after(async () => {
  servidor?.kill()
  if (pasta) await rm(pasta, { recursive: true, force: true })
})

/** Empreendimento com uma unidade — o cenário mínimo de toda tabela de venda. */
async function novaUnidade(cliente, nome, valor = 800000) {
  const empreendimento = await cliente.pedir('/api/empreendimentos', { metodo: 'POST', corpo: { nome } })
  assert.equal(empreendimento.status, 201)

  const unidade = await cliente.pedir('/api/unidades', {
    metodo: 'POST',
    corpo: { empreendimento_id: empreendimento.corpo.id, identificacao: 'Apto 101', numero: '101', valor },
  })
  assert.equal(unidade.status, 201)
  return { empreendimentoId: empreendimento.corpo.id, unidadeId: unidade.corpo.id }
}

const TABELA = {
  nome: 'Tabela da construtora',
  tipo: 'construtora',
  cub_valor_imovel: 800000,
  entrada_pct: 10,
  entrada_valor: 80000,
  parcelas: 30,
  parcela_valor: 3500,
  chaves_pct: 5,
}

/* ------------------------------------------------------------------ */

test('a proposta personalizada nasce como fluxo NOVO, ligada à tabela que copiou', async () => {
  const { empreendimentoId, unidadeId } = await novaUnidade(sessao, 'Residencial Proposta')

  const daConstrutora = await sessao.pedir('/api/fluxos', {
    metodo: 'POST',
    corpo: { ...TABELA, empreendimento_id: empreendimentoId, unidade_id: unidadeId },
  })
  assert.equal(daConstrutora.status, 201)
  assert.equal(daConstrutora.corpo.tipo, 'construtora')
  assert.equal(daConstrutora.corpo.fluxo_base_id, null)

  // A cópia com entrada maior e parcela menor — o que o cliente pediu.
  const proposta = await sessao.pedir('/api/fluxos', {
    metodo: 'POST',
    corpo: {
      ...TABELA,
      nome: 'Personalizado — Tabela da construtora',
      tipo: 'personalizado',
      fluxo_base_id: daConstrutora.corpo.id,
      empreendimento_id: empreendimentoId,
      unidade_id: unidadeId,
      entrada_pct: 20,
      entrada_valor: 160000,
      parcela_valor: 3000,
    },
  })
  assert.equal(proposta.status, 201)
  assert.equal(proposta.corpo.tipo, 'personalizado')
  assert.equal(proposta.corpo.fluxo_base_id, daConstrutora.corpo.id)
  assert.equal(proposta.corpo.unidade_id, unidadeId, 'a proposta é da MESMA unidade')

  // A unidade passa a ter DUAS tabelas, e a original continua intacta.
  const unidades = await sessao.pedir(`/api/empreendimentos/${empreendimentoId}/unidades`)
  const fluxos = unidades.corpo[0].fluxos
  assert.equal(fluxos.length, 2)
  const original = fluxos.find((f) => f.id === daConstrutora.corpo.id)
  assert.equal(original.entrada_valor, 80000, 'personalizar NÃO pode alterar a tabela de origem')
  assert.equal(original.parcela_valor, 3500)
})

test('tipo desconhecido e origem de outra conta são recusados', async () => {
  const { empreendimentoId, unidadeId } = await novaUnidade(sessao, 'Residencial Guarda')

  const invalido = await sessao.pedir('/api/fluxos', {
    metodo: 'POST',
    corpo: { ...TABELA, tipo: 'proposta', empreendimento_id: empreendimentoId, unidade_id: unidadeId },
  })
  assert.equal(invalido.status, 400)
  assert.match(invalido.corpo.erro, /[Tt]ipo/)

  // A tabela da vizinha existe, mas não para esta conta.
  const vizinha = await novaUnidade(outra, 'Residencial da Vizinha')
  const daVizinha = await outra.pedir('/api/fluxos', {
    metodo: 'POST',
    corpo: { ...TABELA, empreendimento_id: vizinha.empreendimentoId, unidade_id: vizinha.unidadeId },
  })
  assert.equal(daVizinha.status, 201)

  for (const origem of [daVizinha.corpo.id, 999999]) {
    const resposta = await sessao.pedir('/api/fluxos', {
      metodo: 'POST',
      corpo: {
        ...TABELA,
        tipo: 'personalizado',
        fluxo_base_id: origem,
        empreendimento_id: empreendimentoId,
        unidade_id: unidadeId,
      },
    })
    assert.equal(resposta.status, 404, `origem ${origem}`)
  }

  // Nenhuma das tentativas gravou coisa alguma.
  const unidades = await sessao.pedir(`/api/empreendimentos/${empreendimentoId}/unidades`)
  assert.equal(unidades.corpo[0].fluxos.length, 0)
})

test('editar a proposta não mexe na origem dela', async () => {
  const { empreendimentoId, unidadeId } = await novaUnidade(sessao, 'Residencial Edição')

  const daConstrutora = await sessao.pedir('/api/fluxos', {
    metodo: 'POST',
    corpo: { ...TABELA, empreendimento_id: empreendimentoId, unidade_id: unidadeId },
  })
  const proposta = await sessao.pedir('/api/fluxos', {
    metodo: 'POST',
    corpo: {
      ...TABELA,
      nome: 'Proposta Ana e Bruno',
      tipo: 'personalizado',
      fluxo_base_id: daConstrutora.corpo.id,
      empreendimento_id: empreendimentoId,
      unidade_id: unidadeId,
    },
  })

  // A tela edita só os números; um payload à mão tentando trocar a origem é
  // ignorado — o vínculo diz de onde a proposta veio.
  const editada = await sessao.pedir(`/api/fluxos/${proposta.corpo.id}`, {
    metodo: 'PUT',
    corpo: { parcela_valor: 3000, fluxo_base_id: 999999, unidade_id: 999999 },
  })
  assert.equal(editada.status, 200)
  assert.equal(editada.corpo.parcela_valor, 3000)
  assert.equal(editada.corpo.fluxo_base_id, daConstrutora.corpo.id)
  assert.equal(editada.corpo.unidade_id, unidadeId)
  assert.equal(editada.corpo.tipo, 'personalizado')

  const tipoInvalido = await sessao.pedir(`/api/fluxos/${proposta.corpo.id}`, {
    metodo: 'PUT',
    corpo: { tipo: 'oficial' },
  })
  assert.equal(tipoInvalido.status, 400)
})

test('a importação carimba o que veio da planilha como tabela da construtora', async () => {
  const empreendimento = await sessao.pedir('/api/empreendimentos', {
    metodo: 'POST',
    corpo: { nome: 'Residencial Importado' },
  })
  const id = empreendimento.corpo.id

  const unidades = [{ identificacao: 'Apto 201', torre: 'A', numero: '201', metragem: 70, valor: 800000 }]
  const fluxoDaPlanilha = {
    nome: 'Tabela de lançamento',
    entrada_pct: 10,
    parcelas: 30,
    parcela_valor: 3500,
    chaves_pct: 5,
  }

  const lida = await sessao.pedir(`/api/empreendimentos/${id}/importacao/previa`, {
    metodo: 'POST',
    corpo: { unidades, fluxo_construtora: fluxoDaPlanilha },
  })
  assert.equal(lida.status, 200)

  const aplicado = await sessao.pedir(`/api/empreendimentos/${id}/importacao/confirmar`, {
    metodo: 'POST',
    corpo: { criar: lida.corpo.novas.map((n) => n.campos), fluxo_construtora: lida.corpo.fluxo_construtora },
  })
  assert.equal(aplicado.status, 200)

  const unidade = aplicado.corpo.unidades[0]
  assert.equal(unidade.fluxos.length, 1)
  assert.equal(unidade.fluxos[0].tipo, 'construtora')
  assert.equal(unidade.fluxos[0].fluxo_base_id, null)

  /* --- A proposta do corretor sobrevive à planilha da semana seguinte --- */

  const proposta = await sessao.pedir('/api/fluxos', {
    metodo: 'POST',
    corpo: {
      // MESMO nome da tabela importada: o casamento por nome não pode
      // confundir a proposta com a planilha e sobrescrevê-la.
      nome: 'Tabela de lançamento',
      tipo: 'personalizado',
      fluxo_base_id: unidade.fluxos[0].id,
      empreendimento_id: id,
      unidade_id: unidade.id,
      entrada_pct: 25,
      entrada_valor: 200000,
      cub_valor_imovel: 800000,
    },
  })
  assert.equal(proposta.status, 201)

  const novaSemana = await sessao.pedir(`/api/empreendimentos/${id}/importacao/previa`, {
    metodo: 'POST',
    corpo: { unidades: [{ ...unidades[0], valor: 830000 }], fluxo_construtora: fluxoDaPlanilha },
  })
  const reaplicado = await sessao.pedir(`/api/empreendimentos/${id}/importacao/confirmar`, {
    metodo: 'POST',
    corpo: {
      atualizar: novaSemana.corpo.alteradas.map((a) => ({ id: a.id, campos: a.depois })),
      fluxo_construtora: novaSemana.corpo.fluxo_construtora,
    },
  })
  assert.equal(reaplicado.status, 200)
  assert.equal(reaplicado.corpo.fluxosCriados, 0, 'a tabela da construtora é atualizada, não duplicada')

  const depois = (await sessao.pedir(`/api/empreendimentos/${id}/unidades`)).corpo[0].fluxos
  assert.equal(depois.length, 2)
  const daProposta = depois.find((f) => f.id === proposta.corpo.id)
  assert.equal(daProposta.entrada_valor, 200000, 'a planilha não pode sobrescrever a proposta do corretor')
  assert.equal(daProposta.tipo, 'personalizado')
  const daPlanilha = depois.find((f) => f.tipo === 'construtora')
  assert.equal(daPlanilha.cub_valor_imovel, 830000, 'a tabela da construtora acompanhou o preço novo')
})

test('a migração roda duas vezes no mesmo banco sem duplicar coluna nem reclassificar fluxo antigo', async () => {
  const anterior = process.env.DB_FILE
  process.env.DB_FILE = join(pasta, 'migracao.db')

  try {
    // A query string força um módulo NOVO: é o mesmo efeito de subir a API
    // duas vezes sobre o arquivo que o cliente já tem.
    const primeira = await import('../src/db.js?passo=1')
    const empreendimentoId = primeira.db
      .prepare("INSERT INTO empreendimentos (nome) VALUES ('Prédio antigo')")
      .run().lastInsertRowid
    primeira.db
      .prepare('INSERT INTO fluxos_pagamento (empreendimento_id, nome) VALUES (?, ?)')
      .run(empreendimentoId, 'Tabela antiga')
    primeira.db.close()

    const segunda = await import('../src/db.js?passo=2')
    const colunas = segunda.db.prepare('PRAGMA table_info(fluxos_pagamento)').all()
    assert.equal(colunas.filter((c) => c.name === 'tipo').length, 1)
    assert.equal(colunas.filter((c) => c.name === 'fluxo_base_id').length, 1)

    const legado = segunda.db.prepare("SELECT * FROM fluxos_pagamento WHERE nome = 'Tabela antiga'").get()
    assert.equal(legado.nome, 'Tabela antiga', 'a migração não pode mexer no que já existia')
    assert.equal(legado.tipo, null, 'fluxo antigo não é reclassificado no chute')
    assert.equal(legado.fluxo_base_id, null)
    segunda.db.close()
  } finally {
    process.env.DB_FILE = anterior
  }
})

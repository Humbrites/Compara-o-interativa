/**
 * A area do operador atravessa TODAS as contas — o oposto do resto da API.
 * Estes testes cobrem as duas coisas que quebram caro aqui: quem consegue
 * abrir a porta, e a conta das datas de renovacao.
 */
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { faixaDeRenovacao, novaDataDeRenovacao } from '../src/plataforma.js'

const executar = promisify(execFile)
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = Number(process.env.PORTA_TESTE_PLATAFORMA || 3312)
const BASE = `http://127.0.0.1:${PORTA}`

const DIA = 24 * 60 * 60 * 1000
const emDias = (dias) => new Date(Date.now() + dias * DIA).toISOString().slice(0, 19).replace('T', ' ')

let pasta
let servidor

function criarCliente() {
  let cookie = null

  return {
    async pedir(caminho, { metodo = 'GET', corpo } = {}) {
      const resposta = await fetch(`${BASE}${caminho}`, {
        method: metodo,
        headers: { ...(corpo ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
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

async function provisionar(...argumentos) {
  const { stdout } = await executar('node', ['src/provisionar.js', ...argumentos], {
    cwd: RAIZ,
    env: { ...process.env, DB_FILE: join(pasta, 'teste.db'), URL_BASE: BASE },
  })
  return stdout
}

/** Cria a conta, define a senha e devolve um cliente com sessão aberta. */
async function abrirConta({ conta, nome, email, senha, plano = 'individual' }) {
  const saida = await provisionar('--conta', conta, '--plano', plano, '--nome', nome, '--email', email)
  const token = saida.match(/definir-senha\/([\w-]+)/)?.[1]
  assert.ok(token, `sem link de senha:\n${saida}`)

  const cliente = criarCliente()
  await cliente.pedir('/api/auth/definir-senha', { metodo: 'POST', corpo: { token, senha } })
  const login = await cliente.pedir('/api/auth/login', { metodo: 'POST', corpo: { identificador: email, senha } })
  assert.equal(login.status, 200, JSON.stringify(login.corpo))

  return cliente
}

before(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'compara-plataforma-'))

  servidor = spawn('node', ['src/server.js'], {
    cwd: RAIZ,
    env: { ...process.env, DB_FILE: join(pasta, 'teste.db'), PORT: String(PORTA), LOG_LEVEL: 'silent' },
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
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
})

after(async () => {
  servidor?.kill()
  if (pasta) await rm(pasta, { recursive: true, force: true })
})

/* ------------------------------------------------------------------ */
/* Conta pura: faixas e datas                                          */
/* ------------------------------------------------------------------ */

test('a faixa de renovação separa vencida, semana, mês e em dia', () => {
  const conta = (dias, status = 'ativa') => ({ status, expira_em: dias === null ? null : emDias(dias) })

  assert.equal(faixaDeRenovacao(conta(-1)), 'vencida')
  assert.equal(faixaDeRenovacao(conta(3)), 'vence-em-7')
  assert.equal(faixaDeRenovacao(conta(7)), 'vence-em-7')
  assert.equal(faixaDeRenovacao(conta(8)), 'vence-em-30')
  assert.equal(faixaDeRenovacao(conta(30)), 'vence-em-30')
  assert.equal(faixaDeRenovacao(conta(31)), 'em-dia')
  assert.equal(faixaDeRenovacao(conta(null)), 'sem-vencimento')

  // Status manda mais que data: suspensa e encerrada não viram "em dia".
  assert.equal(faixaDeRenovacao(conta(90, 'suspensa')), 'suspensa')
  assert.equal(faixaDeRenovacao(conta(90, 'cancelada')), 'encerrada')
})

test('renovar parte do vencimento atual, não de hoje', () => {
  // Conta em dia: o cliente não pode perder os dias que já pagou.
  const emDia = { expira_em: emDias(20) }
  const renovada = novaDataDeRenovacao(emDia, 1)

  const esperado = new Date(new Date(`${emDias(20).replace(' ', 'T')}Z`))
  esperado.setUTCMonth(esperado.getUTCMonth() + 1)
  assert.equal(renovada.slice(0, 10), esperado.toISOString().slice(0, 10))

  // Conta vencida: aí a base é hoje, senão renovar por 1 mês entregaria uma
  // data que já passou.
  const vencida = { expira_em: emDias(-60) }
  const daVencida = new Date(`${novaDataDeRenovacao(vencida, 1).replace(' ', 'T')}Z`)
  assert.ok(daVencida.getTime() > Date.now(), 'renovar conta vencida tem de cair no futuro')
})

test('mês que não tem o dia cai no último dia do mês', () => {
  // 31/01 + 1 mês vira 03/03 no JavaScript cru — o que daria ao cliente dois
  // dias de brinde e uma data que ninguém pediu.
  const resultado = novaDataDeRenovacao({ expira_em: '2027-01-31 23:59:59' }, 1)
  assert.equal(resultado.slice(0, 10), '2027-02-28')

  // Mês com o dia existente segue igual.
  assert.equal(novaDataDeRenovacao({ expira_em: '2027-01-15 23:59:59' }, 2).slice(0, 10), '2027-03-15')
})

/* ------------------------------------------------------------------ */
/* A porta                                                             */
/* ------------------------------------------------------------------ */

test('cliente comum não sabe que a área do operador existe', async () => {
  const cliente = await abrirConta({
    conta: 'Cliente Comum',
    nome: 'Bruno Lima',
    email: 'bruno@comum.com.br',
    senha: 'comum-2026-forte',
  })

  // 404, não 403: confirmar que a rota existe já é informação.
  for (const [caminho, metodo] of [
    ['/api/plataforma', 'GET'],
    ['/api/plataforma/planos', 'GET'],
    ['/api/plataforma/contas/1', 'PUT'],
    ['/api/plataforma/contas/1/renovar', 'POST'],
    ['/api/plataforma/contas', 'POST'],
  ]) {
    const resposta = await cliente.pedir(caminho, { metodo, corpo: metodo === 'GET' ? undefined : {} })
    assert.equal(resposta.status, 404, `${metodo} ${caminho}`)
  }
})

test('sem sessão nenhuma também não passa', async () => {
  const anonimo = criarCliente()
  assert.equal((await anonimo.pedir('/api/plataforma')).status, 401)
})

test('o operador enxerga todas as contas e os números batem', async () => {
  await abrirConta({
    conta: 'Operadora do Produto',
    nome: 'Ana Souza',
    email: 'ana@operadora.com.br',
    senha: 'opera-2026-forte',
    plano: 'profissional',
  })

  await provisionar('--operador', 'ana@operadora.com.br')

  // A marca só vale na sessão seguinte — ela é lida do banco a cada requisição,
  // mas o menu do front vem do /api/sessao.
  const operador = criarCliente()
  await operador.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'ana@operadora.com.br', senha: 'opera-2026-forte' },
  })

  const sessao = await operador.pedir('/api/sessao')
  assert.equal(sessao.corpo.usuario.operador, true)

  const { status, corpo } = await operador.pedir('/api/plataforma')
  assert.equal(status, 200)

  // As duas contas criadas até aqui aparecem — inclusive a do outro cliente.
  const nomes = corpo.contas.map((conta) => conta.nome)
  assert.ok(nomes.includes('Cliente Comum'), 'o operador tem de ver a conta do cliente')
  assert.ok(nomes.includes('Operadora do Produto'))

  assert.equal(corpo.resumo.contas, 2)
  assert.equal(corpo.resumo.usuariosAtivos, 2)
  assert.equal(corpo.resumo.porPlano.profissional.contas, 1)
  assert.equal(corpo.resumo.porPlano.individual.contas, 1)
})

test('o operador muda o plano e a data, e a validação segura o descuido', async () => {
  const operador = criarCliente()
  await operador.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'ana@operadora.com.br', senha: 'opera-2026-forte' },
  })

  const antes = await operador.pedir('/api/plataforma')
  const alvo = antes.corpo.contas.find((conta) => conta.nome === 'Cliente Comum')

  // Personalizado sem número seria conta ilimitada por descuido.
  const descuido = await operador.pedir(`/api/plataforma/contas/${alvo.id}`, {
    metodo: 'PUT',
    corpo: { plano: 'personalizado', limiteUsuarios: null },
  })
  assert.equal(descuido.status, 400)
  assert.match(descuido.corpo.erro, /exige o limite/)

  const certo = await operador.pedir(`/api/plataforma/contas/${alvo.id}`, {
    metodo: 'PUT',
    corpo: { plano: 'personalizado', limiteUsuarios: 25, expiraEm: '2027-03-31', status: 'ativa' },
  })
  assert.equal(certo.status, 200)

  const depois = certo.corpo.contas.find((conta) => conta.nome === 'Cliente Comum')
  assert.equal(depois.plano.slug, 'personalizado')
  assert.equal(depois.assentos.limite, 25)
  // A data digitada vale até o FIM do dia — senão o cliente perde o último dia.
  assert.equal(depois.expiraEm, '2027-03-31 23:59:59')

  const invalida = await operador.pedir(`/api/plataforma/contas/${alvo.id}`, {
    metodo: 'PUT',
    corpo: { expiraEm: '31/03/2027' },
  })
  assert.equal(invalida.status, 400)
})

test('renovar reativa a conta suspensa', async () => {
  const operador = criarCliente()
  await operador.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'ana@operadora.com.br', senha: 'opera-2026-forte' },
  })

  const antes = await operador.pedir('/api/plataforma')
  const alvo = antes.corpo.contas.find((conta) => conta.nome === 'Cliente Comum')

  await operador.pedir(`/api/plataforma/contas/${alvo.id}`, { metodo: 'PUT', corpo: { status: 'suspensa' } })

  const renovada = await operador.pedir(`/api/plataforma/contas/${alvo.id}/renovar`, {
    metodo: 'POST',
    corpo: { meses: 12 },
  })
  assert.equal(renovada.status, 200)

  const conta = renovada.corpo.contas.find((c) => c.nome === 'Cliente Comum')
  // Cobrar e deixar suspensa seria o pior dos dois mundos.
  assert.equal(conta.status, 'ativa')
  assert.ok(conta.diasParaVencer > 300, `esperava mais de 300 dias, veio ${conta.diasParaVencer}`)

  const absurdo = await operador.pedir(`/api/plataforma/contas/${alvo.id}/renovar`, {
    metodo: 'POST',
    corpo: { meses: 0 },
  })
  assert.equal(absurdo.status, 400)
})

test('encerrar a conta derruba as sessões de quem estava dentro', async () => {
  const cliente = await abrirConta({
    conta: 'Vai Encerrar',
    nome: 'Carla Dias',
    email: 'carla@encerrar.com.br',
    senha: 'encerra-2026-forte',
  })
  assert.equal((await cliente.pedir('/api/sessao')).status, 200)

  const operador = criarCliente()
  await operador.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'ana@operadora.com.br', senha: 'opera-2026-forte' },
  })

  const panorama = await operador.pedir('/api/plataforma')
  const alvo = panorama.corpo.contas.find((conta) => conta.nome === 'Vai Encerrar')

  // Suspender NÃO derruba: a conta suspensa segue consultando.
  await operador.pedir(`/api/plataforma/contas/${alvo.id}`, { metodo: 'PUT', corpo: { status: 'suspensa' } })
  assert.equal((await cliente.pedir('/api/sessao')).status, 200, 'suspender não pode expulsar ninguém')

  await operador.pedir(`/api/plataforma/contas/${alvo.id}`, { metodo: 'PUT', corpo: { status: 'cancelada' } })
  assert.equal((await cliente.pedir('/api/sessao')).status, 401, 'encerrar tem de tirar todo mundo na hora')
})

test('o operador cria o cliente e recebe o link de primeiro acesso', async () => {
  const operador = criarCliente()
  await operador.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'ana@operadora.com.br', senha: 'opera-2026-forte' },
  })

  const criada = await operador.pedir('/api/plataforma/contas', {
    metodo: 'POST',
    corpo: {
      nome: 'Nascida na Tela',
      plano: 'equipe',
      responsavel: 'Diego Rocha',
      email: 'diego@nascida.com.br',
      diasTeste: 14,
    },
  })

  assert.equal(criada.status, 201)
  assert.match(criada.corpo.link, /^\/definir-senha\//)

  const nova = criada.corpo.contas.find((conta) => conta.nome === 'Nascida na Tela')
  assert.equal(nova.status, 'trial')
  assert.equal(nova.plano.limite, 3)
  assert.equal(nova.usuarios.length, 1)
  assert.equal(nova.usuarios[0].papel, 'dono')
  // Quem nunca definiu a senha aparece marcado — é o que diz ao operador que
  // o cliente ainda não começou.
  assert.equal(nova.usuarios[0].senhaDefinida, false)

  // E-mail repetido é recusado, sem deixar conta órfã para trás.
  const repetida = await operador.pedir('/api/plataforma/contas', {
    metodo: 'POST',
    corpo: { nome: 'Outra', plano: 'individual', responsavel: 'Diego', email: 'diego@nascida.com.br' },
  })
  assert.equal(repetida.status, 400)

  const depois = await operador.pedir('/api/plataforma')
  assert.equal(depois.corpo.contas.filter((conta) => conta.nome === 'Outra').length, 0)
})

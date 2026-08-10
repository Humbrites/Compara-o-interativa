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

test('renovar soma o CICLO contratado, não um mês fixo', async () => {
  const operador = criarCliente()
  await operador.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'ana@operadora.com.br', senha: 'opera-2026-forte' },
  })

  // Um cliente de cada ciclo, para conferir os quatro de uma vez.
  const casos = [
    { nome: 'Ciclo Mensal', periodicidade: 'mensal', meses: 1 },
    { nome: 'Ciclo Trimestral', periodicidade: 'trimestral', meses: 3 },
    { nome: 'Ciclo Semestral', periodicidade: 'semestral', meses: 6 },
    { nome: 'Ciclo Anual', periodicidade: 'anual', meses: 12 },
  ]

  for (const caso of casos) {
    const criada = await operador.pedir('/api/plataforma/contas', {
      metodo: 'POST',
      corpo: {
        nome: caso.nome,
        plano: 'individual',
        periodicidade: caso.periodicidade,
        responsavel: `Dono ${caso.meses}`,
        email: `dono${caso.meses}@ciclos.com.br`,
      },
    })
    assert.equal(criada.status, 201, JSON.stringify(criada.corpo))

    const conta = criada.corpo.contas.find((c) => c.nome === caso.nome)
    assert.equal(conta.cobranca.slug, caso.periodicidade)
    assert.equal(conta.cobranca.meses, caso.meses)
    // Conta nova sem período de teste nasce sem vencimento.
    assert.equal(conta.expiraEm, null)

    // Renovar SEM dizer quantos meses: usa o ciclo da conta.
    const renovada = await operador.pedir(`/api/plataforma/contas/${conta.id}/renovar`, { metodo: 'POST', corpo: {} })
    assert.equal(renovada.status, 200)

    const depois = renovada.corpo.contas.find((c) => c.nome === caso.nome)
    const esperado = new Date()
    esperado.setUTCMonth(esperado.getUTCMonth() + caso.meses)

    assert.equal(
      depois.expiraEm.slice(0, 7),
      esperado.toISOString().slice(0, 7),
      `${caso.nome}: esperava vencer em ${caso.meses} mês(es)`,
    )
  }
})

test('dois ciclos somam o dobro, e o ciclo muda pela edição', async () => {
  const operador = criarCliente()
  await operador.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'ana@operadora.com.br', senha: 'opera-2026-forte' },
  })

  const antes = await operador.pedir('/api/plataforma')
  const trimestral = antes.corpo.contas.find((c) => c.nome === 'Ciclo Trimestral')
  const partida = trimestral.expiraEm

  // 2 ciclos de 3 meses = 6 meses a partir do vencimento que já existe.
  const renovada = await operador.pedir(`/api/plataforma/contas/${trimestral.id}/renovar`, {
    metodo: 'POST',
    corpo: { ciclos: 2 },
  })
  const depois = renovada.corpo.contas.find((c) => c.nome === 'Ciclo Trimestral')

  const esperado = new Date(`${partida.replace(' ', 'T')}Z`)
  esperado.setUTCMonth(esperado.getUTCMonth() + 6)
  assert.equal(depois.expiraEm.slice(0, 10), esperado.toISOString().slice(0, 10))

  // Trocar o ciclo pela edição muda o que a próxima renovação vai somar.
  const editada = await operador.pedir(`/api/plataforma/contas/${trimestral.id}`, {
    metodo: 'PUT',
    corpo: { periodicidade: 'anual' },
  })
  assert.equal(editada.status, 200)
  assert.equal(editada.corpo.contas.find((c) => c.nome === 'Ciclo Trimestral').cobranca.meses, 12)

  const invalida = await operador.pedir(`/api/plataforma/contas/${trimestral.id}`, {
    metodo: 'PUT',
    corpo: { periodicidade: 'quinzenal' },
  })
  assert.equal(invalida.status, 400)
  assert.match(invalida.corpo.erro, /Periodicidade desconhecida/)

  const ciclosDemais = await operador.pedir(`/api/plataforma/contas/${trimestral.id}/renovar`, {
    metodo: 'POST',
    corpo: { ciclos: 99 },
  })
  assert.equal(ciclosDemais.status, 400)
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

test('o usuário master não pertence a cliente nenhum', async () => {
  const saida = await provisionar('--master', 'chefe@plataforma.com.br', '--nome', 'Chefe Geral', '--usuario', 'chefe')
  const token = saida.match(/definir-senha\/([\w-]+)/)?.[1]
  assert.ok(token, `esperava o link de senha do master:\n${saida}`)

  const master = criarCliente()
  await master.pedir('/api/auth/definir-senha', { metodo: 'POST', corpo: { token, senha: 'chefe-2026-forte' } })

  const login = await master.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'chefe', senha: 'chefe-2026-forte' },
  })
  assert.equal(login.status, 200)
  assert.equal(login.corpo.master, true)
  // Sem conta: nada de plano, assento ou vencimento.
  assert.equal(login.corpo.conta, null)
  assert.equal(login.corpo.precisaConfigurar2fa, false)

  // Ele administra os clientes...
  const painel = await master.pedir('/api/plataforma')
  assert.equal(painel.status, 200)
  assert.ok(painel.corpo.contas.length > 0)

  // ...e cuida da própria segurança.
  assert.equal((await master.pedir('/api/seguranca/sessoes')).status, 200)

  // Mas não tem base de empreendimentos: se passasse, a consulta sairia sem
  // filtro de conta — exatamente o buraco que a conta dona fecha.
  for (const [caminho, metodo] of [
    ['/api/empreendimentos', 'GET'],
    ['/api/empreendimentos', 'POST'],
    ['/api/conta', 'GET'],
    ['/api/unidades', 'POST'],
    ['/api/fluxos', 'POST'],
  ]) {
    const resposta = await master.pedir(caminho, { metodo, corpo: metodo === 'GET' ? undefined : { nome: 'X' } })
    assert.equal(resposta.status, 403, `${metodo} ${caminho}`)
    assert.equal(resposta.corpo.master, true)
  }

  // E não aparece como usuário de nenhum cliente, nem nos números.
  const pessoas = painel.corpo.contas.flatMap((conta) => conta.usuarios.map((u) => u.email))
  assert.ok(!pessoas.includes('chefe@plataforma.com.br'), 'o master não é usuário de cliente nenhum')
})

test('promover alguém a master o solta da conta em que estava', async () => {
  await abrirConta({
    conta: 'Vira Master',
    nome: 'Gil Souza',
    email: 'gil@viramaster.com.br',
    senha: 'gil-2026-forte',
    plano: 'equipe',
  })

  const operador = criarCliente()
  await operador.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'ana@operadora.com.br', senha: 'opera-2026-forte' },
  })

  const antes = await operador.pedir('/api/plataforma')
  const contaAntes = antes.corpo.contas.find((conta) => conta.nome === 'Vira Master')
  assert.equal(contaAntes.usuarios.length, 1)
  assert.equal(contaAntes.assentos.usuarios, 1)

  await provisionar('--master', 'gil@viramaster.com.br')

  const depois = await operador.pedir('/api/plataforma')
  const contaDepois = depois.corpo.contas.find((conta) => conta.nome === 'Vira Master')
  // A conta continua existindo, com os dados — mas sem ninguém dentro, e o
  // assento dele voltou para o plano.
  assert.equal(contaDepois.usuarios.length, 0)
  assert.equal(contaDepois.assentos.usuarios, 0)

  // E ele entra direto na administração, sem passar por conta nenhuma.
  const gil = criarCliente()
  const login = await gil.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'gil@viramaster.com.br', senha: 'gil-2026-forte' },
  })
  assert.equal(login.corpo.master, true)
  assert.equal(login.corpo.conta, null)
})

test('o operador acrescenta usuário a um cliente, respeitando o teto', async () => {
  const operador = criarCliente()
  await operador.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'ana@operadora.com.br', senha: 'opera-2026-forte' },
  })

  // Uma conta pequena de propósito, para o teto aparecer rápido.
  await provisionar('--conta', 'Casa Pequena', '--plano', 'individual', '--nome', 'Elis', '--email', 'elis@pequena.com.br')

  const antes = await operador.pedir('/api/plataforma')
  const alvo = antes.corpo.contas.find((conta) => conta.nome === 'Casa Pequena')
  assert.equal(alvo.assentos.limite, 1)

  // O plano Individual já está cheio com o dono.
  const estourou = await operador.pedir(`/api/plataforma/contas/${alvo.id}/usuarios`, {
    metodo: 'POST',
    corpo: { nome: 'Fábio', email: 'fabio@pequena.com.br', papel: 'membro' },
  })
  assert.equal(estourou.status, 409, 'o teto vale também para quem vende')
  assert.match(estourou.corpo.erro, /permite 1 usuário/)

  // Aumentar o plano abre a vaga.
  await operador.pedir(`/api/plataforma/contas/${alvo.id}`, { metodo: 'PUT', corpo: { plano: 'equipe' } })

  const criado = await operador.pedir(`/api/plataforma/contas/${alvo.id}/usuarios`, {
    metodo: 'POST',
    corpo: { nome: 'Fábio Nunes', email: 'fabio@pequena.com.br', papel: 'admin' },
  })
  assert.equal(criado.status, 201)
  assert.match(criado.corpo.link, /^\/definir-senha\//)

  const depois = criado.corpo.contas.find((conta) => conta.nome === 'Casa Pequena')
  assert.equal(depois.usuarios.length, 2)

  const novo = depois.usuarios.find((usuario) => usuario.email === 'fabio@pequena.com.br')
  assert.equal(novo.papel, 'admin')
  // Nasce sem senha: ela é definida pelo link, no navegador de quem vai usar.
  assert.equal(novo.senhaDefinida, false)

  const repetido = await operador.pedir(`/api/plataforma/contas/${alvo.id}/usuarios`, {
    metodo: 'POST',
    corpo: { nome: 'Outro', email: 'fabio@pequena.com.br', papel: 'membro' },
  })
  assert.equal(repetido.status, 400)
})

test('o suporte enxerga a base do cliente — e só enxerga', async () => {
  // Um cliente com base de verdade: empreendimento, unidade e tabela de venda.
  const cliente = await abrirConta({
    conta: 'Com Base',
    nome: 'Iara Melo',
    email: 'iara@combase.com.br',
    senha: 'iara-2026-forte',
    plano: 'equipe',
  })

  const empreendimento = await cliente.pedir('/api/empreendimentos', {
    metodo: 'POST',
    corpo: { nome: 'Residencial Aurora', cidade: 'Curitiba', construtora: 'Aurora Inc' },
  })
  assert.equal(empreendimento.status, 201)

  const unidade = await cliente.pedir('/api/unidades', {
    metodo: 'POST',
    corpo: {
      empreendimento_id: empreendimento.corpo.id,
      identificacao: 'Apto 101',
      metragem_total: 80,
      valor: '800.000',
      dormitorios: 3,
    },
  })
  assert.equal(unidade.status, 201)

  await cliente.pedir('/api/fluxos', {
    metodo: 'POST',
    corpo: {
      unidade_id: unidade.corpo.id,
      nome: 'Tabela padrão',
      cub_valor_imovel: '800.000',
      entrada_valor: '160.000',
      parcelas: 36,
      parcela_valor: '5.000',
    },
  })

  const operador = criarCliente()
  await operador.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'ana@operadora.com.br', senha: 'opera-2026-forte' },
  })

  const painel = await operador.pedir('/api/plataforma')
  const alvo = painel.corpo.contas.find((conta) => conta.nome === 'Com Base')

  const base = await operador.pedir(`/api/plataforma/contas/${alvo.id}/base`)
  assert.equal(base.status, 200)
  assert.equal(base.corpo.conta.nome, 'Com Base')

  assert.equal(base.corpo.resumo.empreendimentos, 1)
  assert.equal(base.corpo.resumo.unidades, 1)
  assert.equal(base.corpo.resumo.fluxos, 1)
  // Sem latitude/longitude o imóvel não vai ao mapa — o suporte precisa ver isso.
  assert.equal(base.corpo.resumo.semCoordenada, 1)

  const [primeiro] = base.corpo.empreendimentos
  assert.equal(primeiro.nome, 'Residencial Aurora')
  assert.equal(primeiro.unidades.length, 1)
  assert.equal(primeiro.unidades[0].fluxos.length, 1)
  // O ponto é separador de milhar nos dois caminhos.
  assert.equal(primeiro.unidades[0].valor, 800000)
  assert.equal(primeiro.unidades[0].fluxos[0].entrada_valor, 160000)

  // A visão é SOMENTE LEITURA: não existe rota de escrita nela, e as do
  // cliente seguem fechadas para quem não é da conta.
  const escrita = await operador.pedir(`/api/plataforma/contas/${alvo.id}/base`, { metodo: 'POST', corpo: {} })
  assert.ok(escrita.status === 404 || escrita.status === 405, `esperava sem rota de escrita, veio ${escrita.status}`)

  // O operador continua sendo de OUTRA conta: pela porta do cliente, nada.
  const porFora = await operador.pedir(`/api/empreendimentos/${empreendimento.corpo.id}`, { metodo: 'PUT', corpo: { nome: 'Mexido' } })
  assert.equal(porFora.status, 404)

  const conferindo = await cliente.pedir(`/api/empreendimentos/${empreendimento.corpo.id}`)
  assert.equal(conferindo.corpo.nome, 'Residencial Aurora', 'a base do cliente não pode ter mudado')

  // Conta que não existe não vaza nada.
  assert.equal((await operador.pedir('/api/plataforma/contas/99999/base')).status, 404)
})

test('cliente comum não abre a base de ninguém', async () => {
  const cliente = criarCliente()
  await cliente.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'iara@combase.com.br', senha: 'iara-2026-forte' },
  })

  // Nem da própria conta: esta porta é da administração, não do cliente.
  const painel = await cliente.pedir('/api/plataforma/contas/1/base')
  assert.equal(painel.status, 404)
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

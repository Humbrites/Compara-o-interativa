/**
 * Smoke do acesso, de ponta a ponta e contra a API de verdade.
 *
 * Sobe um servidor num banco descartavel (nunca no `data/compara.db`) e exerce
 * o que quebra caro: sessao, isolamento entre contas, teto de assentos,
 * segundo fator e conta suspensa. Provisiona pela CLI de proposito — e o mesmo
 * caminho que uma venda percorre.
 */
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { codigoDoPasso, gerarCodigo, passoAtual } from '../src/totp.js'

/**
 * Codigo do proximo passo de 30s. A janela do servidor aceita (e por isso que
 * relogio adiantado nao tranca ninguem para fora), e ele e sempre "mais novo"
 * que o ultimo passo ja gravado — que e como se pede um codigo inedito sem
 * ficar esperando meio minuto dentro do teste.
 */
const codigoInedito = (segredo) => codigoDoPasso(segredo, passoAtual() + 1)

const executar = promisify(execFile)
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = Number(process.env.PORTA_TESTE || 3311)
const BASE = `http://127.0.0.1:${PORTA}`

let pasta
let servidor

/** Jar de cookie minimo: o `fetch` do Node nao guarda cookie sozinho. */
function criarCliente() {
  let cookie = null

  return {
    get cookie() {
      return cookie
    },
    set cookie(valor) {
      cookie = valor
    },
    async pedir(caminho, { metodo = 'GET', corpo, bruto = false } = {}) {
      const resposta = await fetch(`${BASE}${caminho}`, {
        method: metodo,
        headers: {
          ...(corpo ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
      })

      const recebido = resposta.headers.getSetCookie?.() ?? []
      for (const linha of recebido) {
        const par = linha.split(';')[0]
        // Max-Age=0 e o logout: some com o cookie em vez de guardar vazio.
        cookie = /Max-Age=0/i.test(linha) ? null : par
      }

      if (bruto) return resposta
      const texto = await resposta.text()
      return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null }
    },
  }
}

/** Roda a CLI de provisionamento e devolve a saida. */
async function provisionar(...argumentos) {
  const { stdout } = await executar('node', ['src/provisionar.js', ...argumentos], {
    cwd: RAIZ,
    env: { ...process.env, DB_FILE: join(pasta, 'teste.db'), URL_BASE: BASE },
  })
  return stdout
}

/** O token do link de definicao de senha, que e o que a CLI imprime. */
function tokenDoLink(saida) {
  const encontrado = saida.match(/definir-senha\/([\w-]+)/)
  assert.ok(encontrado, `nenhum link de senha na saída:\n${saida}`)
  return encontrado[1]
}

before(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'compara-acesso-'))

  servidor = spawn('node', ['src/server.js'], {
    cwd: RAIZ,
    env: { ...process.env, DB_FILE: join(pasta, 'teste.db'), PORT: String(PORTA), LOG_LEVEL: 'silent' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Espera a porta responder em vez de dormir um tempo fixo.
  const limite = Date.now() + 15000
  for (;;) {
    try {
      const resposta = await fetch(`${BASE}/api/health`)
      if (resposta.ok) break
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

test('sem sessão, a API não entrega nada', async () => {
  const cliente = criarCliente()

  for (const caminho of ['/api/empreendimentos', '/api/conta', '/api/sessao', '/api/indicadores']) {
    const { status } = await cliente.pedir(caminho)
    assert.equal(status, 401, caminho)
  }

  // Escrita também não passa.
  const criacao = await cliente.pedir('/api/empreendimentos', { metodo: 'POST', corpo: { nome: 'Invasor' } })
  assert.equal(criacao.status, 401)

  // A saúde continua pública — é o que o monitoramento consulta.
  const saude = await cliente.pedir('/api/health')
  assert.equal(saude.status, 200)
})

test('primeiro acesso: link define a senha e o login entra', async () => {
  const saida = await provisionar(
    '--conta', 'Imobiliária Alfa',
    '--plano', 'equipe',
    '--nome', 'Ana Souza',
    '--email', 'ana@alfa.com.br',
    '--usuario', 'ana',
  )
  const token = tokenDoLink(saida)

  const cliente = criarCliente()

  // Enquanto não define a senha, ninguém entra com aquele e-mail.
  const cedo = await cliente.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'ana@alfa.com.br', senha: 'qualquercoisa1' },
  })
  assert.equal(cedo.status, 401)

  const curta = await cliente.pedir('/api/auth/definir-senha', { metodo: 'POST', corpo: { token, senha: 'abc' } })
  assert.equal(curta.status, 400)
  assert.match(curta.corpo.erro, /10 caracteres/)

  const definida = await cliente.pedir('/api/auth/definir-senha', {
    metodo: 'POST',
    corpo: { token, senha: 'alfa-2026-segura' },
  })
  assert.equal(definida.status, 200)

  // Token de uso único: a segunda vez não vale.
  const repetida = await cliente.pedir('/api/auth/definir-senha', {
    metodo: 'POST',
    corpo: { token, senha: 'outra-senha-9999' },
  })
  assert.equal(repetida.status, 400)

  const errada = await cliente.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'ana@alfa.com.br', senha: 'alfa-2026-segurA' },
  })
  assert.equal(errada.status, 401)
  assert.equal(errada.corpo.erro, 'Usuário ou senha incorretos')

  // Entra pelo apelido, não só pelo e-mail.
  const login = await cliente.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'ana', senha: 'alfa-2026-segura' },
  })
  assert.equal(login.status, 200)
  assert.equal(login.corpo.usuario.papel, 'dono')
  assert.equal(login.corpo.conta.plano.limite, 3)
  assert.ok(cliente.cookie, 'o login precisa devolver o cookie de sessão')

  const sessao = await cliente.pedir('/api/sessao')
  assert.equal(sessao.status, 200)
  assert.equal(sessao.corpo.usuario.email, 'ana@alfa.com.br')
})

/** Faz login e devolve um cliente já com sessão. */
async function entrar(identificador, senha) {
  const cliente = criarCliente()
  const { status, corpo } = await cliente.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador, senha },
  })
  assert.equal(status, 200, `login de ${identificador}: ${JSON.stringify(corpo)}`)
  return cliente
}

test('uma conta nunca enxerga o dado da outra', async () => {
  const alfa = await entrar('ana@alfa.com.br', 'alfa-2026-segura')

  const criado = await alfa.pedir('/api/empreendimentos', {
    metodo: 'POST',
    corpo: { nome: 'Edifício da Alfa', cidade: 'Curitiba', valor_m2: '10.500' },
  })
  assert.equal(criado.status, 201)
  const idDaAlfa = criado.corpo.id

  // O ponto sozinho é separador de milhar: 10.500 são dez mil e quinhentos.
  assert.equal(criado.corpo.valor_m2, 10500)

  const saidaBeta = await provisionar(
    '--conta', 'Imobiliária Beta',
    '--plano', 'individual',
    '--nome', 'Bruno Lima',
    '--email', 'bruno@beta.com.br',
  )
  const clienteBeta = criarCliente()
  await clienteBeta.pedir('/api/auth/definir-senha', {
    metodo: 'POST',
    corpo: { token: tokenDoLink(saidaBeta), senha: 'beta-2026-segura' },
  })
  const beta = await entrar('bruno@beta.com.br', 'beta-2026-segura')

  const listaBeta = await beta.pedir('/api/empreendimentos')
  assert.equal(listaBeta.status, 200)
  assert.deepEqual(listaBeta.corpo, [], 'a conta nova tem de nascer vazia')

  // Nem pelo id direto: para a outra conta o registro simplesmente não existe.
  for (const [caminho, metodo] of [
    [`/api/empreendimentos/${idDaAlfa}`, 'GET'],
    [`/api/empreendimentos/${idDaAlfa}`, 'PUT'],
    [`/api/empreendimentos/${idDaAlfa}`, 'DELETE'],
    [`/api/empreendimentos/${idDaAlfa}/unidades`, 'GET'],
  ]) {
    const resposta = await beta.pedir(caminho, { metodo, corpo: metodo === 'PUT' ? { nome: 'Roubado' } : undefined })
    assert.equal(resposta.status, 404, `${metodo} ${caminho}`)
  }

  // E não dá para pendurar uma unidade no empreendimento alheio.
  const unidade = await beta.pedir('/api/unidades', {
    metodo: 'POST',
    corpo: { empreendimento_id: idDaAlfa, identificacao: 'Apto 101' },
  })
  assert.equal(unidade.status, 404)

  // A Alfa continua vendo o que é dela.
  const listaAlfa = await alfa.pedir('/api/empreendimentos')
  assert.equal(listaAlfa.corpo.length, 1)
  assert.equal(listaAlfa.corpo[0].nome, 'Edifício da Alfa')
})

test('o plano limita os assentos, e convite pendente ocupa vaga', async () => {
  const alfa = await entrar('ana@alfa.com.br', 'alfa-2026-segura')

  const conta = await alfa.pedir('/api/conta')
  assert.equal(conta.corpo.assentos.limite, 3)
  assert.equal(conta.corpo.assentos.ocupados, 1)

  const primeiro = await alfa.pedir('/api/conta/convites', {
    metodo: 'POST',
    corpo: { email: 'carla@alfa.com.br', nome: 'Carla', papel: 'membro' },
  })
  assert.equal(primeiro.status, 201)
  assert.match(primeiro.corpo.link, /^\/convite\//)
  assert.equal(primeiro.corpo.assentos.ocupados, 2)

  const segundo = await alfa.pedir('/api/conta/convites', {
    metodo: 'POST',
    corpo: { email: 'davi@alfa.com.br', papel: 'admin' },
  })
  assert.equal(segundo.status, 201)
  assert.equal(segundo.corpo.assentos.disponiveis, 0)

  // 1 usuário + 2 convites = as 3 vagas do plano Equipe. O quarto é recusado
  // ANTES de alguém aceitar — é isso que impede furar o limite por convite.
  const terceiro = await alfa.pedir('/api/conta/convites', {
    metodo: 'POST',
    corpo: { email: 'eva@alfa.com.br' },
  })
  assert.equal(terceiro.status, 409)
  assert.match(terceiro.corpo.erro, /permite 3 usuário/)
  assert.match(terceiro.corpo.erro, /2 convite\(s\) aguardando/)

  // Convite repetido para quem já foi convidado não abre outra vaga.
  const repetido = await alfa.pedir('/api/conta/convites', {
    metodo: 'POST',
    corpo: { email: 'carla@alfa.com.br' },
  })
  assert.equal(repetido.status, 400)

  // Cancelar devolve a vaga na hora.
  const convites = await alfa.pedir('/api/conta')
  const doDavi = convites.corpo.convites.find((convite) => convite.email === 'davi@alfa.com.br')
  const cancelado = await alfa.pedir(`/api/conta/convites/${doDavi.id}`, { metodo: 'DELETE' })
  assert.equal(cancelado.status, 200)
  assert.equal(cancelado.corpo.assentos.disponiveis, 1)

  // Aceitar o convite da Carla cria o usuário e já entra.
  const token = primeiro.corpo.link.replace('/convite/', '')
  const anonimo = criarCliente()

  const previa = await anonimo.pedir(`/api/auth/convite/${token}`)
  assert.equal(previa.status, 200)
  assert.equal(previa.corpo.conta, 'Imobiliária Alfa')
  assert.equal(previa.corpo.email, 'carla@alfa.com.br')

  const aceite = await anonimo.pedir(`/api/auth/convite/${token}`, {
    metodo: 'POST',
    corpo: { nome: 'Carla Dias', senha: 'carla-2026-segura' },
  })
  assert.equal(aceite.status, 201)
  assert.equal(aceite.corpo.usuario.papel, 'membro')
  assert.equal(aceite.corpo.conta.assentos.usuarios, 2)

  // O mesmo link não serve duas vezes.
  const rejogado = await anonimo.pedir(`/api/auth/convite/${token}`)
  assert.equal(rejogado.status, 404)

  // Membro enxerga a base da conta, mas não administra a equipe.
  const carla = await entrar('carla@alfa.com.br', 'carla-2026-segura')
  const baseDaCarla = await carla.pedir('/api/empreendimentos')
  assert.equal(baseDaCarla.corpo.length, 1)

  const tentativa = await carla.pedir('/api/conta/convites', { metodo: 'POST', corpo: { email: 'x@alfa.com.br' } })
  assert.equal(tentativa.status, 403)
})

test('o cliente não muda o próprio plano', async () => {
  const alfa = await entrar('ana@alfa.com.br', 'alfa-2026-segura')

  // Só o nome e a exigência de 2FA passam por aqui; plano e limite são do
  // contrato, e contrato não se edita pelo lado de quem paga.
  const tentativa = await alfa.pedir('/api/conta', {
    metodo: 'PUT',
    corpo: { nome: 'Alfa', plano: 'personalizado', limite_usuarios: 0, limiteUsuarios: 0, status: 'ativa' },
  })
  assert.equal(tentativa.status, 200)
  assert.equal(tentativa.corpo.plano.slug, 'equipe')
  assert.equal(tentativa.corpo.plano.limite, 3)
  assert.equal(tentativa.corpo.status, 'ativa')
})

test('segundo fator: ativa, exige no login e não aceita código repetido', async () => {
  const carla = await entrar('carla@alfa.com.br', 'carla-2026-segura')

  const inicio = await carla.pedir('/api/seguranca/2fa/iniciar', { metodo: 'POST' })
  assert.equal(inicio.status, 200)
  assert.match(inicio.corpo.url, /^otpauth:\/\/totp\//)
  assert.match(inicio.corpo.qr, /^<svg/, 'o QR precisa vir pronto para a tela')

  const segredo = inicio.corpo.segredo

  // Código errado não liga o fator.
  const recusado = await carla.pedir('/api/seguranca/2fa/ativar', { metodo: 'POST', corpo: { codigo: '000000' } })
  assert.equal(recusado.status, 400)

  const ativado = await carla.pedir('/api/seguranca/2fa/ativar', {
    metodo: 'POST',
    corpo: { codigo: gerarCodigo(segredo) },
  })
  assert.equal(ativado.status, 200)
  assert.equal(ativado.corpo.codigos.length, 8, 'tem de vir com os códigos de recuperação')

  // Agora o login para no meio do caminho.
  const cliente = criarCliente()
  const login = await cliente.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'carla@alfa.com.br', senha: 'carla-2026-segura' },
  })
  assert.equal(login.status, 200)
  assert.equal(login.corpo.precisa2fa, true)
  assert.ok(login.corpo.desafio)
  assert.equal(cliente.cookie, null, 'senha certa sozinha não pode virar sessão')

  // O desafio não substitui o código.
  const semCodigo = await cliente.pedir('/api/auth/2fa', {
    metodo: 'POST',
    corpo: { desafio: login.corpo.desafio, codigo: '123456' },
  })
  assert.equal(semCodigo.status, 401)

  // Repare que NAO da para reusar aqui o codigo que ativou o fator: ele ja
  // esta gravado como ultimo passo aceito. Isso e a trava de replay em acao.
  const gasto = await cliente.pedir('/api/auth/2fa', {
    metodo: 'POST',
    corpo: { desafio: login.corpo.desafio, codigo: gerarCodigo(segredo) },
  })
  assert.equal(gasto.status, 401, 'o código que ativou o 2FA não serve para entrar de novo')

  const codigo = codigoInedito(segredo)
  const entrou = await cliente.pedir('/api/auth/2fa', {
    metodo: 'POST',
    corpo: { desafio: login.corpo.desafio, codigo },
  })
  assert.equal(entrou.status, 200)
  assert.equal(entrou.corpo.usuario.totpAtivo, true)
  assert.ok(cliente.cookie)

  // O MESMO código, ainda dentro dos 30 segundos, não entra de novo.
  const outro = criarCliente()
  const login2 = await outro.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'carla@alfa.com.br', senha: 'carla-2026-segura' },
  })
  const repetido = await outro.pedir('/api/auth/2fa', {
    metodo: 'POST',
    corpo: { desafio: login2.corpo.desafio, codigo },
  })
  assert.equal(repetido.status, 401, 'código já usado tem de ser recusado')

  // O código de recuperação salva quem perdeu o celular — e queima ao usar.
  const recuperacao = ativado.corpo.codigos[0]
  const comRecuperacao = await outro.pedir('/api/auth/2fa', {
    metodo: 'POST',
    corpo: { desafio: login2.corpo.desafio, recuperacao },
  })
  assert.equal(comRecuperacao.status, 200)
  assert.match(comRecuperacao.corpo.aviso, /Restam 7/)

  const terceiro = criarCliente()
  const login3 = await terceiro.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'carla@alfa.com.br', senha: 'carla-2026-segura' },
  })
  const reusado = await terceiro.pedir('/api/auth/2fa', {
    metodo: 'POST',
    corpo: { desafio: login3.corpo.desafio, recuperacao },
  })
  assert.equal(reusado.status, 401, 'código de recuperação é de uso único')
})

test('trocar a senha derruba as outras sessões', async () => {
  const antiga = await entrar('bruno@beta.com.br', 'beta-2026-segura')
  const outra = await entrar('bruno@beta.com.br', 'beta-2026-segura')

  const troca = await outra.pedir('/api/seguranca/senha', {
    metodo: 'POST',
    corpo: { senhaAtual: 'beta-2026-segura', novaSenha: 'beta-2026-nova99' },
  })
  assert.equal(troca.status, 200)

  // Quem trocou continua dentro...
  assert.equal((await outra.pedir('/api/sessao')).status, 200)
  // ...e a sessão antiga cai na hora.
  assert.equal((await antiga.pedir('/api/sessao')).status, 401)
})

test('conta suspensa consulta, mas não grava', async () => {
  await provisionar('--status-da-conta', '2', '--status', 'suspensa')

  const beta = await entrar('bruno@beta.com.br', 'beta-2026-nova99')

  const leitura = await beta.pedir('/api/empreendimentos')
  assert.equal(leitura.status, 200, 'suspensa não pode perder o acesso ao próprio dado')

  const escrita = await beta.pedir('/api/empreendimentos', { metodo: 'POST', corpo: { nome: 'Novo' } })
  assert.equal(escrita.status, 402)
  assert.match(escrita.corpo.erro, /suspensa/)

  const sessao = await beta.pedir('/api/sessao')
  assert.equal(sessao.corpo.conta.somenteLeitura, true)

  // Reativada, volta a gravar.
  await provisionar('--status-da-conta', '2', '--status', 'ativa')
  const depois = await beta.pedir('/api/empreendimentos', { metodo: 'POST', corpo: { nome: 'Depois de reativar' } })
  assert.equal(depois.status, 201)
})

test('conta encerrada não entra mais', async () => {
  await provisionar('--status-da-conta', '2', '--status', 'cancelada')

  const cliente = criarCliente()
  const login = await cliente.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'bruno@beta.com.br', senha: 'beta-2026-nova99' },
  })
  assert.equal(login.status, 403)
  assert.match(login.corpo.erro, /encerrada/)
})

test('sair encerra a sessão de verdade', async () => {
  const alfa = await entrar('ana@alfa.com.br', 'alfa-2026-segura')
  const cookie = alfa.cookie

  assert.equal((await alfa.pedir('/api/auth/sair', { metodo: 'POST' })).status, 200)

  // Mesmo reapresentando o cookie antigo na mão, a sessão já não existe.
  const zumbi = criarCliente()
  zumbi.cookie = cookie
  assert.equal((await zumbi.pedir('/api/sessao')).status, 401)
})

test('o operador aumenta o plano e a vaga aparece', async () => {
  const antes = await entrar('ana@alfa.com.br', 'alfa-2026-segura')

  // Sobrou uma vaga do plano Equipe (Ana e Carla ocupam duas das três).
  const ultima = await antes.pedir('/api/conta/convites', { metodo: 'POST', corpo: { email: 'eva@alfa.com.br' } })
  assert.equal(ultima.status, 201)
  assert.equal(ultima.corpo.assentos.disponiveis, 0)

  const cheio = await antes.pedir('/api/conta/convites', { metodo: 'POST', corpo: { email: 'fabio@alfa.com.br' } })
  assert.equal(cheio.status, 409)

  await provisionar('--plano-da-conta', '1', '--plano', 'profissional')

  const depois = await entrar('ana@alfa.com.br', 'alfa-2026-segura')
  const conta = await depois.pedir('/api/conta')
  assert.equal(conta.corpo.plano.limite, 10)

  const agora = await depois.pedir('/api/conta/convites', { metodo: 'POST', corpo: { email: 'fabio@alfa.com.br' } })
  assert.equal(agora.status, 201)
})

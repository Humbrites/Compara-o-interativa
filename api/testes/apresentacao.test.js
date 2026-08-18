/**
 * O que vai impresso no material entregue ao cliente: o CRECI do corretor e a
 * logo da imobiliária.
 *
 * Sobe um servidor num banco descartável (nunca no `data/compara.db`) e exerce
 * o que quebra caro: o CRECI "corrigido" por alguém e saindo diferente do
 * carimbo; a logo de uma imobiliária aparecendo na base de outra; o arquivo
 * antigo ficando no disco a cada troca; e a configuração da marca gravada fora
 * das faixas, que faria a marca d'água cobrir o texto ou sumir.
 */
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const executar = promisify(execFile)
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = Number(process.env.PORTA_TESTE_APRESENTACAO || 3341)
const BASE = `http://127.0.0.1:${PORTA}`

/**
 * Onde a API grava os arquivos enviados. O caminho é montado à mão de
 * propósito: importar `db.js` aqui abriria o banco de desenvolvimento.
 */
const UPLOADS = join(RAIZ, 'data', 'uploads')

let pasta
let ambiente
let servidor

/** Jar de cookie mínimo: o `fetch` do Node não guarda cookie sozinho. */
function criarCliente() {
  let cookie = null

  return {
    async pedir(caminho, { metodo = 'GET', corpo, formulario, bruto = false } = {}) {
      const resposta = await fetch(`${BASE}${caminho}`, {
        method: metodo,
        headers: {
          // Multipart monta o próprio content-type (com o boundary).
          ...(corpo ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: formulario ?? (corpo ? JSON.stringify(corpo) : undefined),
      })

      for (const linha of resposta.headers.getSetCookie?.() ?? []) {
        cookie = /Max-Age=0/i.test(linha) ? null : linha.split(';')[0]
      }

      if (bruto) return resposta
      const texto = await resposta.text()
      return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null }
    },
  }
}

async function provisionar(...argumentos) {
  const { stdout } = await executar('node', ['src/provisionar.js', ...argumentos], { cwd: RAIZ, env: ambiente })
  return stdout
}

function tokenDoLink(saida) {
  const encontrado = saida.match(/definir-senha\/([\w-]+)/)
  assert.ok(encontrado, `nenhum link de senha na saída:\n${saida}`)
  return encontrado[1]
}

/** Provisiona a conta, define a senha e entra — o caminho de uma venda. */
async function abrirConta({ conta, nome, email, senha }) {
  const saida = await provisionar('--conta', conta, '--plano', 'equipe', '--nome', nome, '--email', email)
  const cliente = criarCliente()
  await cliente.pedir('/api/auth/definir-senha', {
    metodo: 'POST',
    corpo: { token: tokenDoLink(saida), senha },
  })
  const login = await cliente.pedir('/api/auth/login', { metodo: 'POST', corpo: { identificador: email, senha } })
  assert.equal(login.status, 200, `login de ${email} falhou`)
  return cliente
}

/** Um arquivo qualquer com o tipo declarado — a API não abre a imagem. */
function arquivo(bytes, tipo, nome) {
  const dados = new FormData()
  dados.append('arquivo', new Blob([new Uint8Array(bytes)], { type: tipo }), nome)
  return dados
}

const enviarLogo = (cliente, formulario) =>
  cliente.pedir('/api/conta/logo', { metodo: 'POST', formulario })

const existeNoDisco = (nome) =>
  access(join(UPLOADS, nome)).then(
    () => true,
    () => false,
  )

let alfa
let beta
let master

before(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'compara-apresentacao-'))
  ambiente = { ...process.env, DB_FILE: join(pasta, 'teste.db'), LOG_LEVEL: 'silent' }

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
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  alfa = await abrirConta({
    conta: 'Imobiliária Alfa',
    nome: 'Ana Souza',
    email: 'ana@alfa.com.br',
    senha: 'alfa-2026-segura',
  })
  beta = await abrirConta({
    conta: 'Imobiliária Beta',
    nome: 'Bruno Lima',
    email: 'bruno@beta.com.br',
    senha: 'beta-2026-segura',
  })

  // O master de suporte não tem conta — e precisa enxergar a marca de qualquer
  // cliente para conferir o material com ele ao telefone.
  const saida = await provisionar('--master', 'suporte@compara.com.br', '--nome', 'Suporte')
  master = criarCliente()
  await master.pedir('/api/auth/definir-senha', {
    metodo: 'POST',
    corpo: { token: tokenDoLink(saida), senha: 'suporte-2026-forte' },
  })
  await master.pedir('/api/auth/login', {
    metodo: 'POST',
    corpo: { identificador: 'suporte@compara.com.br', senha: 'suporte-2026-forte' },
  })
})

after(async () => {
  // A logo de cada conta sai do disco junto com o banco descartável.
  for (const cliente of [alfa, beta]) {
    await cliente?.pedir('/api/conta/logo', { metodo: 'DELETE' }).catch(() => {})
  }
  servidor?.kill()
  if (pasta) await rm(pasta, { recursive: true, force: true })
})

/* ------------------------------------------------------------------ */
/* CRECI                                                               */
/* ------------------------------------------------------------------ */

test('o CRECI é gravado exatamente como foi digitado', async () => {
  const digitado = '  CRECI/RS 12.345-J  '
  const salvo = await alfa.pedir('/api/seguranca/perfil', { metodo: 'PUT', corpo: { creci: digitado } })

  assert.equal(salvo.status, 200)
  // Só as pontas em branco somem: nada de máscara, maiúscula ou pontuação.
  assert.equal(salvo.corpo.creci, 'CRECI/RS 12.345-J')

  const sessao = await alfa.pedir('/api/sessao')
  assert.equal(sessao.corpo.usuario.creci, 'CRECI/RS 12.345-J')

  // Campo apagado volta a ser NULL — nunca string vazia.
  const limpo = await alfa.pedir('/api/seguranca/perfil', { metodo: 'PUT', corpo: { creci: '   ' } })
  assert.equal(limpo.corpo.creci, null)

  const exagero = await alfa.pedir('/api/seguranca/perfil', { metodo: 'PUT', corpo: { creci: 'x'.repeat(61) } })
  assert.equal(exagero.status, 400)
  assert.match(exagero.corpo.erro, /60 caracteres/)

  // Devolve o valor para os testes seguintes lerem a sessão completa.
  await alfa.pedir('/api/seguranca/perfil', { metodo: 'PUT', corpo: { creci: 'CRECI 12345-F' } })
})

test('o CRECI é de quem está logado — um usuário não mexe no do outro', async () => {
  await beta.pedir('/api/seguranca/perfil', { metodo: 'PUT', corpo: { creci: 'CRECI 99999-B' } })

  const daAlfa = await alfa.pedir('/api/sessao')
  assert.equal(daAlfa.corpo.usuario.creci, 'CRECI 12345-F')
})

/* ------------------------------------------------------------------ */
/* Logo da conta                                                       */
/* ------------------------------------------------------------------ */

test('a logo sobe, é servida para a conta dona e some para as outras', async () => {
  const enviada = await enviarLogo(alfa, arquivo([137, 80, 78, 71], 'image/png', 'marca.png'))

  assert.equal(enviada.status, 201)
  const { logo } = enviada.corpo
  assert.match(logo.arquivo, /^[0-9a-f-]{36}\.png$/, 'o nome do arquivo é gerado aqui, nunca o do cliente')
  assert.equal(logo.url, `/uploads/${logo.arquivo}`)
  assert.equal(logo.posicao, 'marca-dagua', 'nasce como marca d’água apagada')
  assert.equal(logo.tamanho, 30)
  assert.equal(logo.opacidade, 0.08)
  assert.equal(await existeNoDisco(logo.arquivo), true)

  // A sessão carrega a marca: é dela que as exportações em PDF partem.
  const sessao = await alfa.pedir('/api/sessao')
  assert.equal(sessao.corpo.conta.logo.url, logo.url)

  assert.equal((await alfa.pedir(logo.url, { bruto: true })).status, 200)
  // Link vazado não abre a marca de um cliente na sessão de outro.
  assert.equal((await beta.pedir(logo.url, { bruto: true })).status, 404)
  // O suporte vê — é a marca dele, não o link, que abre a porta.
  assert.equal((await master.pedir(logo.url, { bruto: true })).status, 200)
})

test('trocar a logo grava a nova antes de apagar a antiga do disco', async () => {
  const antiga = (await alfa.pedir('/api/sessao')).corpo.conta.logo.arquivo
  assert.ok(antiga)

  const trocada = await enviarLogo(alfa, arquivo([255, 216, 255], 'image/jpeg', 'nova.jpg'))
  assert.equal(trocada.status, 201)

  const nova = trocada.corpo.logo.arquivo
  assert.notEqual(nova, antiga)
  assert.equal(await existeNoDisco(nova), true)
  assert.equal(await existeNoDisco(antiga), false, 'o arquivo trocado não pode ficar no disco')
})

test('a logo recusa formato de fora da lista e arquivo acima de 2 MB', async () => {
  const atual = (await alfa.pedir('/api/sessao')).corpo.conta.logo.arquivo

  const formato = await enviarLogo(alfa, arquivo([1, 2, 3], 'application/pdf', 'folder.pdf'))
  assert.equal(formato.status, 400)
  assert.match(formato.corpo.erro, /PNG, JPG ou WEBP/)

  const grande = await enviarLogo(
    alfa,
    arquivo(new Array(2 * 1024 * 1024 + 1024).fill(0), 'image/png', 'enorme.png'),
  )
  assert.equal(grande.status, 400)
  assert.match(grande.corpo.erro, /2 MB/)

  // Nenhuma das recusas trocou a logo que já estava lá.
  assert.equal((await alfa.pedir('/api/sessao')).corpo.conta.logo.arquivo, atual)
})

test('só o dono mexe na logo da conta', async () => {
  // Um membro da MESMA conta: ele usa a marca, mas não a troca.
  const convite = await alfa.pedir('/api/conta/convites', {
    metodo: 'POST',
    corpo: { email: 'carla@alfa.com.br', nome: 'Carla', papel: 'membro' },
  })
  assert.equal(convite.status, 201)

  const membro = criarCliente()
  const entrou = await membro.pedir(convite.corpo.link.replace('/convite/', '/api/auth/convite/'), {
    metodo: 'POST',
    corpo: { nome: 'Carla', senha: 'carla-2026-segura' },
  })
  assert.equal(entrou.status, 201)

  const logo = (await alfa.pedir('/api/sessao')).corpo.conta.logo
  // Ele enxerga a marca (o PDF dele também sai com ela)...
  assert.equal((await membro.pedir(logo.url, { bruto: true })).status, 200)

  // ...mas trocar e remover são do dono.
  const troca = await enviarLogo(membro, arquivo([137, 80, 78, 71], 'image/png', 'outra.png'))
  assert.equal(troca.status, 403)
  assert.equal((await membro.pedir('/api/conta/logo', { metodo: 'DELETE' })).status, 403)
  assert.equal((await alfa.pedir('/api/sessao')).corpo.conta.logo.arquivo, logo.arquivo)
})

test('a configuração da marca só aceita valores dentro das faixas', async () => {
  const recusas = [
    [{ logo_posicao: 'centro' }, /posição da logo/],
    [{ logo_tamanho: 5 }, /10% a 60%/],
    [{ logo_tamanho: 90 }, /10% a 60%/],
    [{ logo_opacidade: 0 }, /opacidade/],
    [{ logo_opacidade: 1.5 }, /opacidade/],
  ]

  for (const [corpo, esperado] of recusas) {
    const resposta = await alfa.pedir('/api/conta', { metodo: 'PUT', corpo })
    assert.equal(resposta.status, 400, JSON.stringify(corpo))
    assert.match(resposta.corpo.erro, esperado)
  }

  const certo = await alfa.pedir('/api/conta', {
    metodo: 'PUT',
    corpo: { logo_posicao: 'topo', logo_tamanho: 45, logo_opacidade: 1 },
  })
  assert.equal(certo.status, 200)
  assert.deepEqual(
    { posicao: certo.corpo.logo.posicao, tamanho: certo.corpo.logo.tamanho, opacidade: certo.corpo.logo.opacidade },
    { posicao: 'topo', tamanho: 45, opacidade: 1 },
  )

  // Salvar o nome da conta não pode zerar a configuração da marca.
  const soONome = await alfa.pedir('/api/conta', { metodo: 'PUT', corpo: { nome: 'Imobiliária Alfa' } })
  assert.equal(soONome.corpo.logo.posicao, 'topo')
  assert.equal(soONome.corpo.logo.tamanho, 45)
})

test('remover a logo limpa a coluna, apaga o arquivo e mantém os ajustes', async () => {
  const arquivoAtual = (await alfa.pedir('/api/sessao')).corpo.conta.logo.arquivo

  const removida = await alfa.pedir('/api/conta/logo', { metodo: 'DELETE' })
  assert.equal(removida.status, 200)
  assert.equal(removida.corpo.logo.url, null)
  assert.equal(removida.corpo.logo.arquivo, null)
  // Quem remove hoje costuma mandar a nova amanhã: posição e tamanho ficam.
  assert.equal(removida.corpo.logo.posicao, 'topo')
  assert.equal(removida.corpo.logo.tamanho, 45)

  assert.equal(await existeNoDisco(arquivoAtual), false)
  assert.equal((await alfa.pedir(`/uploads/${arquivoAtual}`, { bruto: true })).status, 404)

  // Conta sem logo continua respondendo a sessão normalmente.
  assert.equal((await alfa.pedir('/api/sessao')).corpo.conta.logo.url, null)
})

/* ------------------------------------------------------------------ */
/* Migracao                                                            */
/* ------------------------------------------------------------------ */

test('a migração roda de novo no mesmo banco sem mexer no que já está lá', async () => {
  // A migração roda no boot — e o banco do Daniel vai recebê-la sozinho no
  // primeiro `node --watch`. Subir uma segunda vez sobre o MESMO arquivo é o
  // que prova que ela não repete o ALTER nem reescreve dado.
  const porta = PORTA + 1
  const segundo = spawn('node', ['src/server.js'], {
    cwd: RAIZ,
    env: { ...ambiente, PORT: String(porta) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let erro = ''
  segundo.stderr.on('data', (pedaco) => {
    erro += String(pedaco)
  })

  try {
    const limite = Date.now() + 15000
    for (;;) {
      try {
        if ((await fetch(`http://127.0.0.1:${porta}/api/health`)).ok) break
      } catch {
        // ainda subindo
      }
      if (Date.now() > limite) throw new Error(`a API não subiu na segunda vez:\n${erro}`)
      await new Promise((resolve) => setTimeout(resolve, 150))
    }

    const cliente = criarCliente()
    const login = await fetch(`http://127.0.0.1:${porta}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identificador: 'ana@alfa.com.br', senha: 'alfa-2026-segura' }),
    })
    assert.equal(login.status, 200)

    const sessao = await login.json()
    // O que foi gravado antes da segunda migração continua lá.
    assert.equal(sessao.usuario.creci, 'CRECI 12345-F')
    assert.equal(sessao.conta.logo.posicao, 'topo')
    assert.equal(sessao.conta.logo.tamanho, 45)
    assert.ok(cliente)
  } finally {
    segundo.kill()
  }
})

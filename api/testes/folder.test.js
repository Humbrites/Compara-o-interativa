/**
 * O folder de venda do empreendimento — o PDF que a construtora entrega.
 *
 * Sobe um servidor num banco descartável (nunca no `data/compara.db`) e exerce
 * o que quebra caro: o folder de uma imobiliária abrindo na sessão de outra; o
 * arquivo antigo ficando no disco a cada troca; um .exe renomeado para .pdf
 * entrando como material de venda; e o arquivo grande demais passando por causa
 * do `throwFileSizeLimit: false`, que TRUNCA em vez de recusar.
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
const PORTA = Number(process.env.PORTA_TESTE_FOLDER || 3351)
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

/** Um PDF de mentira, mas com a assinatura de verdade — é ela que a API confere. */
function pdf(miolo = 'folder de teste', tamanho = null) {
  const cabecalho = Buffer.from(`%PDF-1.4\n${miolo}\n%%EOF\n`, 'utf8')
  if (tamanho === null) return cabecalho
  const enchimento = Buffer.alloc(Math.max(0, tamanho - cabecalho.length), 0x20)
  return Buffer.concat([cabecalho, enchimento])
}

/** Um arquivo qualquer com o tipo declarado — a API não abre o documento. */
function arquivo(conteudo, tipo, nome) {
  const dados = new FormData()
  dados.append('arquivo', new Blob([conteudo], { type: tipo }), nome)
  return dados
}

const enviarFolder = (cliente, id, formulario) =>
  cliente.pedir(`/api/empreendimentos/${id}/folder`, { metodo: 'POST', formulario })

const existeNoDisco = (nome) =>
  access(join(UPLOADS, nome)).then(
    () => true,
    () => false,
  )

let alfa
let beta
let master
let empreendimento

before(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'compara-folder-'))
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
    conta: 'Imobiliária do Folder',
    nome: 'Ana Souza',
    email: 'ana@folder.com.br',
    senha: 'folder-2026-segura',
  })
  beta = await abrirConta({
    conta: 'Imobiliária Vizinha',
    nome: 'Bruno Lima',
    email: 'bruno@vizinha.com.br',
    senha: 'vizinha-2026-segura',
  })

  // O suporte não tem conta e enxerga a base do cliente quando entra nela.
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

  const criado = await alfa.pedir('/api/empreendimentos', { metodo: 'POST', corpo: { nome: 'Residencial Folder' } })
  assert.equal(criado.status, 201)
  empreendimento = criado.corpo.id
})

after(async () => {
  // O PDF sai do disco junto com o banco descartável.
  await alfa?.pedir(`/api/empreendimentos/${empreendimento}/folder`, { metodo: 'DELETE' }).catch(() => {})
  servidor?.kill()
  if (pasta) await rm(pasta, { recursive: true, force: true })
})

/* ------------------------------------------------------------------ */

test('o folder sobe, abre inline com o nome original e some para as outras contas', async () => {
  const conteudo = pdf('plantas e implantação')
  const enviado = await enviarFolder(alfa, empreendimento, arquivo(conteudo, 'application/pdf', 'Folder Vivatto.pdf'))

  assert.equal(enviado.status, 201)
  assert.match(enviado.corpo.folder_arquivo, /^[0-9a-f-]{36}\.pdf$/, 'o nome no disco é gerado aqui, nunca o do cliente')
  assert.equal(enviado.corpo.folder_nome, 'Folder Vivatto.pdf')
  assert.equal(enviado.corpo.folder_tamanho, conteudo.length)
  assert.equal(await existeNoDisco(enviado.corpo.folder_arquivo), true)

  // A base já devolve o folder: é dela que a tela do imóvel monta o bloco.
  const naBase = (await alfa.pedir('/api/empreendimentos')).corpo.find((e) => e.id === empreendimento)
  assert.equal(naBase.folder_arquivo, enviado.corpo.folder_arquivo)

  const aberto = await alfa.pedir(`/api/empreendimentos/${empreendimento}/folder`, { bruto: true })
  assert.equal(aberto.status, 200)
  assert.equal(aberto.headers.get('content-type'), 'application/pdf')
  // `inline`: o corretor abre na aba, na frente do cliente — não baixa.
  assert.match(aberto.headers.get('content-disposition'), /^inline;/)
  assert.match(aberto.headers.get('content-disposition'), /Folder Vivatto\.pdf/)
  assert.equal(Buffer.from(await aberto.arrayBuffer()).equals(conteudo), true)

  // Link vazado não abre o material de venda de um cliente na conta de outro.
  assert.equal((await beta.pedir(`/api/empreendimentos/${empreendimento}/folder`, { bruto: true })).status, 404)
  // E nem o empreendimento do vizinho recebe folder por id chutado.
  assert.equal(
    (await enviarFolder(beta, empreendimento, arquivo(pdf(), 'application/pdf', 'invasao.pdf'))).status,
    404,
  )
  // O suporte, sem entrar na conta, não tem base nenhuma para consultar.
  assert.equal((await master.pedir(`/api/empreendimentos/${empreendimento}/folder`, { bruto: true })).status, 403)
})

test('o nome do arquivo sai escapado no cabeçalho, com acento e pontuação', async () => {
  const enviado = await enviarFolder(
    alfa,
    empreendimento,
    arquivo(pdf(), 'application/pdf', 'Folder Jardim das Acácias; 2026.pdf'),
  )
  assert.equal(enviado.status, 201)
  assert.equal(enviado.corpo.folder_nome, 'Folder Jardim das Acácias; 2026.pdf', 'o nome original é guardado inteiro')

  const aberto = await alfa.pedir(`/api/empreendimentos/${empreendimento}/folder`, { bruto: true })
  const cabecalho = aberto.headers.get('content-disposition')
  await aberto.arrayBuffer()

  // A parte entre aspas não pode ter aspas, ponto e vírgula nem acento — é ela
  // que o navegador antigo lê, e qualquer um dos três quebraria o cabeçalho. O
  // nome de verdade viaja na `filename*`, que aceita UTF-8.
  const simples = /filename="([^"]*)"/.exec(cabecalho)
  assert.ok(simples, `sem filename simples em: ${cabecalho}`)
  assert.equal(simples[1], 'Folder Jardim das Ac_cias_ 2026.pdf')
  assert.match(cabecalho, /filename\*=UTF-8''Folder%20Jardim%20das%20Ac%C3%A1cias%3B%202026\.pdf/)
})

test('trocar o folder grava o novo antes de apagar o antigo do disco', async () => {
  const antes = (await alfa.pedir('/api/empreendimentos')).corpo.find((e) => e.id === empreendimento)
  assert.ok(antes.folder_arquivo)

  const trocado = await enviarFolder(alfa, empreendimento, arquivo(pdf('versão 2'), 'application/pdf', 'novo.pdf'))
  assert.equal(trocado.status, 201)

  assert.notEqual(trocado.corpo.folder_arquivo, antes.folder_arquivo)
  assert.equal(trocado.corpo.folder_nome, 'novo.pdf')
  assert.equal(await existeNoDisco(trocado.corpo.folder_arquivo), true)
  assert.equal(await existeNoDisco(antes.folder_arquivo), false, 'o arquivo trocado não pode ficar no disco')
})

test('só entra PDF de verdade: mimetype e conteúdo são conferidos, e há teto de 15 MB', async () => {
  const atual = (await alfa.pedir('/api/empreendimentos')).corpo.find((e) => e.id === empreendimento).folder_arquivo

  const formato = await enviarFolder(alfa, empreendimento, arquivo(pdf(), 'image/png', 'folder.png'))
  assert.equal(formato.status, 400)
  assert.match(formato.corpo.erro, /PDF/)

  // Renomear .exe para .pdf muda o mimetype junto — quem desmente é o conteúdo.
  const disfarcado = await enviarFolder(
    alfa,
    empreendimento,
    arquivo(Buffer.from('MZ programa', 'binary'), 'application/pdf', 'folder.pdf'),
  )
  assert.equal(disfarcado.status, 400)
  assert.match(disfarcado.corpo.erro, /não é um PDF/)

  // `throwFileSizeLimit: false` TRUNCA em vez de recusar: sem conferir o
  // tamanho do que chegou, um arquivo de 20 MB entraria cortado pela metade.
  const grande = await enviarFolder(
    alfa,
    empreendimento,
    arquivo(pdf('enorme', 15 * 1024 * 1024 + 4096), 'application/pdf', 'enorme.pdf'),
  )
  assert.equal(grande.status, 400)
  assert.match(grande.corpo.erro, /15 MB/)

  // Nenhuma das recusas trocou o folder que já estava lá.
  const depois = (await alfa.pedir('/api/empreendimentos')).corpo.find((e) => e.id === empreendimento)
  assert.equal(depois.folder_arquivo, atual)
  assert.equal(await existeNoDisco(atual), true)
})

test('excluir o folder limpa as colunas e tira o arquivo do disco', async () => {
  const atual = (await alfa.pedir('/api/empreendimentos')).corpo.find((e) => e.id === empreendimento).folder_arquivo
  assert.ok(atual)

  const removido = await alfa.pedir(`/api/empreendimentos/${empreendimento}/folder`, { metodo: 'DELETE' })
  assert.equal(removido.status, 200)
  assert.deepEqual(removido.corpo, { folder_arquivo: null, folder_nome: null, folder_tamanho: null })
  assert.equal(await existeNoDisco(atual), false)

  // Sem folder, não há o que abrir.
  assert.equal((await alfa.pedir(`/api/empreendimentos/${empreendimento}/folder`, { bruto: true })).status, 404)
  // E a conta vizinha não apaga o folder de ninguém.
  assert.equal(
    (await beta.pedir(`/api/empreendimentos/${empreendimento}/folder`, { metodo: 'DELETE' })).status,
    404,
  )
})

test('apagar o empreendimento leva o folder do disco junto', async () => {
  const criado = await alfa.pedir('/api/empreendimentos', { metodo: 'POST', corpo: { nome: 'Residencial Efêmero' } })
  const enviado = await enviarFolder(alfa, criado.corpo.id, arquivo(pdf(), 'application/pdf', 'some.pdf'))
  assert.equal(enviado.status, 201)

  await alfa.pedir(`/api/empreendimentos/${criado.corpo.id}`, { metodo: 'DELETE' })
  assert.equal(await existeNoDisco(enviado.corpo.folder_arquivo), false, 'o PDF não pode sobrar no disco')
})

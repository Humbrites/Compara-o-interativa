/**
 * Ferramenta do OPERADOR do produto (voce), fora das contas dos clientes.
 *
 * Provisionar por linha de comando e uma decisao, nao preguica de fazer tela:
 * quem vende define contrato, e contrato nao pode ser editavel por quem paga.
 * Se o plano fosse alteravel pela interface, bastaria ao cliente se colocar em
 * "personalizado, sem teto" para o limite virar enfeite. Pelo mesmo motivo o
 * operador nao tem usuario dentro da conta — ele nao ocupa assento nem aparece
 * na equipe do cliente.
 *
 *   npm run provisionar -- --listar
 *   npm run provisionar -- --conta "Imobiliaria Alfa" --plano equipe \
 *                          --nome "Ana Souza" --email ana@alfa.com.br [--usuario ana]
 *   npm run provisionar -- --plano-da-conta 2 --plano profissional
 *   npm run provisionar -- --plano-da-conta 2 --plano personalizado --usuarios 25
 *   npm run provisionar -- --status-da-conta 2 --status suspensa
 *   npm run provisionar -- --link-senha ana@alfa.com.br
 */
import { db } from './db.js'
import {
  agora,
  buscarConta,
  buscarUsuarioPorIdentificador,
  conferirVaga,
  criarConta,
  criarTokenSenha,
  criarUsuario,
  resumoAssentos,
  statusEfetivo,
} from './contas.js'
import { descreverPlano, PLANOS, STATUS_CONTA, validarPlano } from './planos.js'

const URL_BASE = process.env.URL_BASE || 'http://localhost:5273'

function lerArgumentos(argv) {
  const opcoes = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue
    const chave = argv[i].slice(2)
    const proximo = argv[i + 1]
    // Sinalizador sem valor (--listar) vira `true`.
    opcoes[chave] = proximo && !proximo.startsWith('--') ? proximo : true
    if (opcoes[chave] !== true) i += 1
  }
  return opcoes
}

function numero(valor) {
  if (valor === undefined || valor === true) return null
  const convertido = Number(valor)
  return Number.isFinite(convertido) ? Math.trunc(convertido) : null
}

function encerrar(mensagem, codigo = 1) {
  console.error(`\n✖ ${mensagem}\n`)
  process.exit(codigo)
}

function mostrarConta(conta) {
  const plano = descreverPlano(conta)
  const assentos = resumoAssentos(conta)
  const limite = assentos.limite === null ? 'sem teto' : assentos.limite
  const vencimento = conta.expira_em ? ` · vence ${conta.expira_em}` : ''

  console.log(
    `  #${String(conta.id).padStart(3)} ${conta.nome}\n` +
      `        ${plano.nome} · ${assentos.usuarios} usuário(s) + ${assentos.convitesPendentes} convite(s) de ${limite}` +
      ` · ${statusEfetivo(conta)}${vencimento}`,
  )
}

/* ------------------------------------------------------------------ */

const opcoes = lerArgumentos(process.argv.slice(2))

if (opcoes.listar) {
  const contas = db.prepare('SELECT * FROM contas ORDER BY id').all()
  if (contas.length === 0) {
    console.log('\nNenhuma conta cadastrada. Crie a primeira com --conta.\n')
  } else {
    console.log(`\n${contas.length} conta(s):\n`)
    for (const conta of contas) mostrarConta(conta)
    console.log()
  }
  process.exit(0)
}

/* Trocar plano/limite de uma conta existente. */
if (opcoes['plano-da-conta']) {
  const conta = buscarConta.get(numero(opcoes['plano-da-conta']))
  if (!conta) encerrar('Conta não encontrada')

  const plano = opcoes.plano === undefined || opcoes.plano === true ? conta.plano : String(opcoes.plano)
  const limite = opcoes.usuarios === undefined ? conta.limite_usuarios : numero(opcoes.usuarios)

  const problema = validarPlano(plano, limite)
  if (problema) encerrar(problema)

  // Reduzir o plano NAO desliga ninguem automaticamente: quem decide quem sai
  // e o cliente. O sistema so para de aceitar gente nova ate caber.
  db.prepare("UPDATE contas SET plano = ?, limite_usuarios = ?, atualizado_em = datetime('now') WHERE id = ?").run(
    plano,
    limite,
    conta.id,
  )

  const atualizada = buscarConta.get(conta.id)
  const assentos = resumoAssentos(atualizada)
  console.log('\n✓ Plano atualizado.\n')
  mostrarConta(atualizada)
  if (assentos.limite !== null && assentos.ocupados > assentos.limite) {
    console.log(
      `\n⚠ A conta está com ${assentos.ocupados} assento(s) ocupado(s) para um limite de ${assentos.limite}.\n` +
        '  Ninguém foi desligado — só não entra mais gente até o cliente ajustar.',
    )
  }
  console.log()
  process.exit(0)
}

/* Suspender, reativar, encerrar ou marcar vencimento. */
if (opcoes['status-da-conta']) {
  const conta = buscarConta.get(numero(opcoes['status-da-conta']))
  if (!conta) encerrar('Conta não encontrada')

  const status = opcoes.status === undefined || opcoes.status === true ? conta.status : String(opcoes.status)
  if (!STATUS_CONTA.includes(status)) encerrar(`Status inválido. Use um de: ${STATUS_CONTA.join(', ')}`)

  const dias = numero(opcoes.dias)
  // `--dias 0` limpa o vencimento (conta sem data para vencer).
  const expiraEm = dias === null ? conta.expira_em : dias > 0 ? agora(dias * 24 * 60 * 60 * 1000) : null

  db.prepare("UPDATE contas SET status = ?, expira_em = ?, atualizado_em = datetime('now') WHERE id = ?").run(
    status,
    expiraEm,
    conta.id,
  )

  console.log('\n✓ Status atualizado.\n')
  mostrarConta(buscarConta.get(conta.id))
  console.log()
  process.exit(0)
}

/* Acrescentar um usuário a uma conta que já existe (sem passar por convite). */
if (opcoes['usuario-na-conta']) {
  const conta = buscarConta.get(numero(opcoes['usuario-na-conta']))
  if (!conta) encerrar('Conta não encontrada')

  if (!opcoes.nome || opcoes.nome === true) encerrar('Informe --nome')
  if (!opcoes.email || opcoes.email === true) encerrar('Informe --email')

  const papel = opcoes.papel === undefined || opcoes.papel === true ? 'dono' : String(opcoes.papel)

  // O teto vale para o operador também: furá-lo por linha de comando faria o
  // limite virar sugestão. A saída é aumentar o plano, não ignorá-lo.
  const semVaga = conferirVaga(conta)
  if (semVaga) encerrar(semVaga)

  let usuario
  try {
    usuario = await criarUsuario({
      contaId: conta.id,
      nome: String(opcoes.nome),
      email: String(opcoes.email),
      usuario: opcoes.usuario && opcoes.usuario !== true ? String(opcoes.usuario) : null,
      papel,
    })
  } catch (erro) {
    encerrar(erro.message)
  }

  const token = criarTokenSenha(usuario.id, 'primeiro-acesso')
  console.log(`\n✓ ${usuario.nome} <${usuario.email}> entrou em ${conta.nome} como ${papel}.\n`)
  console.log('  Link para definir a senha (vale 48 horas):\n')
  console.log(`  ${URL_BASE}/definir-senha/${token}\n`)
  process.exit(0)
}

/* Corrigir nome ou apelido de quem já existe. */
if (opcoes['editar-usuario'] && opcoes['editar-usuario'] !== true) {
  const usuario = buscarUsuarioPorIdentificador(String(opcoes['editar-usuario']))
  if (!usuario) encerrar('Usuário não encontrado')

  const nome = opcoes.nome && opcoes.nome !== true ? String(opcoes.nome).trim() : usuario.nome
  if (!nome) encerrar('O nome não pode ficar vazio')

  // `--apelido ""` remove o apelido (sobra o e-mail para entrar).
  let apelido = usuario.usuario
  if (opcoes.apelido !== undefined) {
    apelido = opcoes.apelido === true ? null : String(opcoes.apelido).trim().toLowerCase() || null
    if (apelido && !/^[a-z0-9._-]{3,40}$/.test(apelido)) {
      encerrar('O apelido aceita de 3 a 40 letras, números, ponto, hífen ou sublinhado')
    }
  }

  try {
    db.prepare("UPDATE usuarios SET nome = ?, usuario = ?, atualizado_em = datetime('now') WHERE id = ?").run(
      nome,
      apelido,
      usuario.id,
    )
  } catch (erro) {
    // O índice único é quem garante isso; testar antes seria uma corrida.
    encerrar(String(erro.message).includes('UNIQUE') ? 'Esse apelido já está em uso' : erro.message)
  }

  console.log(`\n✓ ${nome} <${usuario.email}>${apelido ? ` — entra como @${apelido}` : ' — sem apelido'}\n`)
  process.exit(0)
}

/* Conceder ou tirar a marca de operador da plataforma. */
if (opcoes.operador && opcoes.operador !== true) {
  const usuario = buscarUsuarioPorIdentificador(String(opcoes.operador))
  if (!usuario) encerrar('Usuário não encontrado')

  // `--tirar` remove; sem ele, concede.
  const marca = opcoes.tirar ? 0 : 1
  db.prepare("UPDATE usuarios SET operador = ?, atualizado_em = datetime('now') WHERE id = ?").run(marca, usuario.id)

  console.log(
    marca
      ? `\n✓ ${usuario.nome} <${usuario.email}> agora enxerga TODAS as contas na área da plataforma.\n` +
          '  (entre de novo no sistema para o menu aparecer)\n'
      : `\n✓ ${usuario.nome} <${usuario.email}> deixou de ser operador.\n`,
  )
  process.exit(0)
}

/* Link novo de senha para alguém que já existe. */
if (opcoes['link-senha'] && opcoes['link-senha'] !== true) {
  const usuario = buscarUsuarioPorIdentificador(String(opcoes['link-senha']))
  if (!usuario) encerrar('Usuário não encontrado')

  const token = criarTokenSenha(usuario.id, 'redefinicao')
  console.log(`\n✓ Link de senha para ${usuario.nome} <${usuario.email}> — vale 48 horas:\n`)
  console.log(`  ${URL_BASE}/definir-senha/${token}\n`)
  process.exit(0)
}

/* Criar conta + primeiro usuário (o caminho normal de uma venda). */
if (opcoes.conta && opcoes.conta !== true) {
  const plano = opcoes.plano === undefined || opcoes.plano === true ? 'individual' : String(opcoes.plano)
  const limite = opcoes.usuarios === undefined ? null : numero(opcoes.usuarios)
  const diasTeste = numero(opcoes['dias-teste'])

  const problema = validarPlano(plano, limite)
  if (problema) encerrar(problema)

  if (!opcoes.nome || opcoes.nome === true) encerrar('Informe --nome do primeiro usuário')
  if (!opcoes.email || opcoes.email === true) encerrar('Informe --email do primeiro usuário')

  let conta
  let usuario

  try {
    conta = criarConta({
      nome: String(opcoes.conta),
      plano,
      limiteUsuarios: limite,
      status: diasTeste ? 'trial' : 'ativa',
      diasTeste,
    })

    // O primeiro usuário é sempre o dono: alguém precisa poder convidar o resto.
    usuario = await criarUsuario({
      contaId: conta.id,
      nome: String(opcoes.nome),
      email: String(opcoes.email),
      usuario: opcoes.usuario && opcoes.usuario !== true ? String(opcoes.usuario) : null,
      papel: 'dono',
    })
  } catch (erro) {
    // Conta criada e usuário recusado deixaria uma conta órfã no banco.
    if (conta && !usuario) db.prepare('DELETE FROM contas WHERE id = ?').run(conta.id)
    encerrar(erro.message)
  }

  // A senha nunca é escolhida por nós: o dono define a dele pelo link, e
  // assim ela não passa por e-mail, por bilhete nem pelo seu terminal.
  const token = criarTokenSenha(usuario.id, 'primeiro-acesso')

  console.log('\n✓ Conta criada.\n')
  mostrarConta(buscarConta.get(conta.id))
  console.log(`\n  Dono: ${usuario.nome} <${usuario.email}>${usuario.usuario ? ` (@${usuario.usuario})` : ''}`)
  console.log('\n  Mande este link para ele definir a senha (vale 48 horas):\n')
  console.log(`  ${URL_BASE}/definir-senha/${token}\n`)
  process.exit(0)
}

/* Sem comando reconhecido: mostra a ajuda. */
console.log(`
Provisionamento do Compara Interativa

  --listar                          lista as contas, o plano e os assentos em uso

  --conta "Nome da empresa"         cria a conta e o primeiro usuário (dono)
    --plano <${Object.keys(PLANOS).join('|')}>
    --usuarios <n>                  limite próprio da conta (0 = sem teto);
                                    obrigatório no plano personalizado
    --nome "Nome da pessoa"
    --email pessoa@empresa.com.br
    --usuario apelido               opcional, para entrar sem digitar o e-mail
    --dias-teste <n>                abre em teste, vencendo em n dias

  --usuario-na-conta <id>           acrescenta alguém a uma conta existente
    --nome "Nome" --email pessoa@empresa.com.br
    [--usuario apelido] [--papel dono|admin|membro]   (padrão: dono)

  --plano-da-conta <id>             muda o plano/limite de uma conta
    --plano <slug> [--usuarios <n>]

  --status-da-conta <id>            muda o status
    --status <${STATUS_CONTA.join('|')}>
    --dias <n>                      novo vencimento (0 limpa)

  --editar-usuario <e-mail|apelido> corrige nome e/ou apelido
    [--nome "Nome"] [--apelido apelido]

  --link-senha <e-mail|apelido>     gera um link novo de definição de senha

  --operador <e-mail|apelido>       dá acesso à área da plataforma (ver TODAS
                                    as contas, planos e renovações)
    --tirar                         remove esse acesso

Endereço usado nos links: ${URL_BASE} (mude com URL_BASE=...)
`)
process.exit(0)

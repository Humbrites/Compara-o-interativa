/**
 * Contas, usuarios, sessoes, convites e assentos.
 *
 * Este arquivo e a fonte da verdade de "quem e voce e o que a sua conta pode
 * fazer". As rotas so perguntam; a regra mora aqui.
 */
import { db } from './db.js'
import {
  conferirSenha,
  gerarCodigoRecuperacao,
  gerarHashSenha,
  gerarToken,
  hashDeToken,
  normalizarCodigoRecuperacao,
} from './senhas.js'
import { limiteDeUsuarios, PAPEIS, PERIODICIDADE_PADRAO, validarPeriodicidade, validarPlano } from './planos.js'

/** Sessao longa com renovacao a cada uso. */
export const DIAS_SESSAO = 30
/** De quanto em quanto tempo vale a pena reescrever a validade no banco. */
const MINUTOS_ENTRE_RENOVACOES = 60
export const DIAS_CONVITE = 7
export const HORAS_TOKEN_SENHA = 48
export const CODIGOS_RECUPERACAO = 8

/**
 * Data no mesmo formato do `datetime('now')` do SQLite (UTC, 'YYYY-MM-DD
 * HH:MM:SS'). Precisa ser identico: as comparacoes de validade sao feitas como
 * TEXTO, e formato diferente compara errado sem dar erro nenhum.
 */
export function agora(deslocamentoMs = 0) {
  return new Date(Date.now() + deslocamentoMs).toISOString().slice(0, 19).replace('T', ' ')
}

const DIA_MS = 24 * 60 * 60 * 1000

/* ------------------------------------------------------------------ */
/* Contas                                                              */
/* ------------------------------------------------------------------ */

export const buscarConta = db.prepare('SELECT * FROM contas WHERE id = ?')

export function criarConta({
  nome,
  plano = 'individual',
  limiteUsuarios = null,
  status = 'trial',
  diasTeste = null,
  periodicidade = PERIODICIDADE_PADRAO,
}) {
  const problema = validarPlano(plano, limiteUsuarios) || validarPeriodicidade(periodicidade)
  if (problema) throw new Error(problema)
  if (!nome?.trim()) throw new Error('A conta precisa de um nome')

  const expiraEm = diasTeste ? agora(diasTeste * DIA_MS) : null

  const id = db
    .prepare(
      `INSERT INTO contas (nome, plano, limite_usuarios, status, expira_em, periodicidade)
       VALUES (@nome, @plano, @limite, @status, @expiraEm, @periodicidade)`,
    )
    .run({ nome: nome.trim(), plano, limite: limiteUsuarios, status, expiraEm, periodicidade }).lastInsertRowid

  return buscarConta.get(id)
}

/**
 * O status que vale AGORA. Uma conta paga cujo vencimento passou fica em so
 * leitura sozinha, sem ninguem precisar rodar nada — e sem perder dado, que e
 * a diferenca entre cobrar e punir.
 */
export function statusEfetivo(conta) {
  if (conta.status === 'cancelada' || conta.status === 'suspensa') return conta.status
  if (conta.expira_em && conta.expira_em <= agora()) return 'suspensa'
  return conta.status
}

/** Conta suspensa entra e consulta; quem nao pode mais entrar e a cancelada. */
export function podeEntrar(conta) {
  return statusEfetivo(conta) !== 'cancelada'
}

export function podeGravar(conta) {
  const status = statusEfetivo(conta)
  return status === 'ativa' || status === 'trial'
}

/* ------------------------------------------------------------------ */
/* Assentos                                                            */
/* ------------------------------------------------------------------ */

const contarUsuariosAtivos = db.prepare('SELECT COUNT(*) AS total FROM usuarios WHERE conta_id = ? AND ativo = 1')

const contarConvitesPendentes = db.prepare(
  `SELECT COUNT(*) AS total FROM convites
    WHERE conta_id = ? AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em > ?`,
)

/**
 * Assentos em uso = quem ja entra + quem foi convidado e ainda pode aceitar.
 *
 * Contar o convite e o que fecha o furo obvio do limite: sem isso, o plano de
 * 3 vira 10 mandando convite para todo mundo e deixando eles aceitarem depois.
 * O convite vence em 7 dias e a vaga volta sozinha.
 */
export function assentosEmUso(contaId) {
  return {
    usuarios: contarUsuariosAtivos.get(contaId).total,
    convites: contarConvitesPendentes.get(contaId, agora()).total,
  }
}

export function resumoAssentos(conta) {
  const uso = assentosEmUso(conta.id)
  const limite = limiteDeUsuarios(conta)
  const ocupados = uso.usuarios + uso.convites

  return {
    usuarios: uso.usuarios,
    convitesPendentes: uso.convites,
    ocupados,
    limite: limite === Infinity ? null : limite,
    disponiveis: limite === Infinity ? null : Math.max(0, limite - ocupados),
  }
}

/**
 * Devolve a mensagem do bloqueio ou `null` quando ha vaga. A mensagem diz o
 * limite e o que fazer — "limite atingido" sozinho so gera chamado.
 */
export function conferirVaga(conta) {
  const limite = limiteDeUsuarios(conta)
  if (limite === Infinity) return null

  const uso = assentosEmUso(conta.id)
  const ocupados = uso.usuarios + uso.convites
  if (ocupados < limite) return null

  const detalhe =
    uso.convites > 0
      ? `${uso.usuarios} em uso e ${uso.convites} convite(s) aguardando resposta`
      : `${uso.usuarios} em uso`

  return `O plano da conta permite ${limite} usuário(s) e já está completo (${detalhe}). Remova um usuário, cancele um convite pendente ou aumente o plano.`
}

/* ------------------------------------------------------------------ */
/* Usuarios                                                            */
/* ------------------------------------------------------------------ */

export const buscarUsuario = db.prepare('SELECT * FROM usuarios WHERE id = ?')

/** O login aceita e-mail OU apelido — as duas colunas sao unicas no sistema. */
const buscarPorIdentificador = db.prepare(
  'SELECT * FROM usuarios WHERE email = ? COLLATE NOCASE OR usuario = ? COLLATE NOCASE',
)

export function buscarUsuarioPorIdentificador(identificador) {
  const texto = String(identificador ?? '').trim()
  if (!texto) return undefined
  return buscarPorIdentificador.get(texto, texto)
}

export const listarUsuariosDaConta = db.prepare(
  `SELECT id, conta_id, nome, email, usuario, papel, ativo, totp_ativo, senha_hash IS NOT NULL AS senha_definida,
          ultimo_acesso, criado_em
     FROM usuarios WHERE conta_id = ? ORDER BY nome COLLATE NOCASE`,
)

/**
 * Usuario sem conta e o MASTER da plataforma: quem vende o sistema. Ele nao
 * ocupa assento, nao aparece na equipe de ninguem e nao tem base propria.
 */
export function ehMaster(usuario) {
  return Boolean(usuario) && (usuario.conta_id === null || usuario.conta_id === undefined)
}

export async function criarUsuario({ contaId = null, nome, email, usuario = null, papel = 'membro', senha = null }) {
  if (!PAPEIS.includes(papel)) throw new Error(`Papel invalido: ${papel}`)
  if (!nome?.trim()) throw new Error('O usuário precisa de um nome')

  const emailLimpo = String(email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpo)) throw new Error('E-mail inválido')

  const apelido = usuario ? String(usuario).trim().toLowerCase() : null
  if (apelido && !/^[a-z0-9._-]{3,40}$/.test(apelido)) {
    throw new Error('O nome de usuário aceita de 3 a 40 letras, números, ponto, hífen ou sublinhado')
  }

  const senhaHash = senha ? await gerarHashSenha(senha) : null

  try {
    const id = db
      .prepare(
        `INSERT INTO usuarios (conta_id, nome, email, usuario, papel, senha_hash)
         VALUES (@contaId, @nome, @email, @usuario, @papel, @senhaHash)`,
      )
      .run({ contaId, nome: nome.trim(), email: emailLimpo, usuario: apelido, papel, senhaHash }).lastInsertRowid

    return buscarUsuario.get(id)
  } catch (erro) {
    // O indice unico e quem garante isso; testar antes seria uma corrida.
    if (String(erro.message).includes('UNIQUE')) {
      throw new Error('Já existe um usuário com esse e-mail ou nome de usuário')
    }
    throw erro
  }
}

export async function definirSenha(usuarioId, senha) {
  db.prepare("UPDATE usuarios SET senha_hash = ?, atualizado_em = datetime('now') WHERE id = ?").run(
    await gerarHashSenha(senha),
    usuarioId,
  )
}

/* ------------------------------------------------------------------ */
/* Tentativas de login                                                 */
/* ------------------------------------------------------------------ */

const MINUTOS_JANELA_TENTATIVAS = 15
const TENTATIVAS_LIVRES = 5
const ATRASO_MAXIMO_MS = 5000

const contarTentativas = db.prepare('SELECT COUNT(*) AS total FROM tentativas_login WHERE chave = ? AND criada_em > ?')

export function registrarTentativa(chave) {
  db.prepare('INSERT INTO tentativas_login (chave) VALUES (?)').run(chave)
}

export function limparTentativas(chave) {
  db.prepare('DELETE FROM tentativas_login WHERE chave = ?').run(chave)
}

/**
 * Atraso progressivo por identificador+IP — e NAO bloqueio de conta.
 *
 * Travar a conta depois de N erros entrega a qualquer pessoa da internet o
 * poder de deixar o cliente de fora do proprio sistema, bastando errar a senha
 * dele de proposito. O atraso encarece a forca bruta sem esse efeito colateral.
 */
export function atrasoDaTentativa(chave) {
  const desde = agora(-MINUTOS_JANELA_TENTATIVAS * 60 * 1000)
  const total = contarTentativas.get(chave, desde).total
  if (total <= TENTATIVAS_LIVRES) return 0
  return Math.min(ATRASO_MAXIMO_MS, 2 ** (total - TENTATIVAS_LIVRES) * 100)
}

/* ------------------------------------------------------------------ */
/* Sessoes                                                             */
/* ------------------------------------------------------------------ */

export function criarSessao(usuarioId, { agente = null, ip = null } = {}) {
  const token = gerarToken()

  db.prepare(
    `INSERT INTO sessoes (token_hash, usuario_id, agente, ip, expira_em)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(hashDeToken(token), usuarioId, agente, ip, agora(DIAS_SESSAO * DIA_MS))

  db.prepare("UPDATE usuarios SET ultimo_acesso = datetime('now') WHERE id = ?").run(usuarioId)

  return token
}

const buscarSessao = db.prepare('SELECT * FROM sessoes WHERE token_hash = ?')

/**
 * Resolve o cookie em usuario + conta, renovando a validade.
 *
 * A renovacao deslizante e deliberada: sessao de prazo fixo e curto foi
 * exatamente o que, no CRM, virou onda de gente sendo deslogada no meio do
 * trabalho. Quem usa todo dia nao e interrompido; quem sumiu 30 dias volta
 * pelo login.
 */
export function lerSessao(token) {
  if (!token) return null

  const sessao = buscarSessao.get(hashDeToken(token))
  if (!sessao) return null

  if (sessao.expira_em <= agora()) {
    db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(sessao.token_hash)
    return null
  }

  const usuario = buscarUsuario.get(sessao.usuario_id)
  if (!usuario || !usuario.ativo) return null

  // O master nao tem conta — e por isso a sessao dele nao passa pelas regras
  // de plano, vencimento e suspensao, que sao do CLIENTE.
  const conta = ehMaster(usuario) ? null : buscarConta.get(usuario.conta_id)
  if (!ehMaster(usuario) && (!conta || !podeEntrar(conta))) return null

  // So reescreve de hora em hora: renovar a cada requisicao seria uma escrita
  // no banco por clique, sem nenhum ganho.
  if (sessao.ultimo_uso <= agora(-MINUTOS_ENTRE_RENOVACOES * 60 * 1000)) {
    db.prepare("UPDATE sessoes SET ultimo_uso = datetime('now'), expira_em = ? WHERE token_hash = ?").run(
      agora(DIAS_SESSAO * DIA_MS),
      sessao.token_hash,
    )
  }

  return { sessao, usuario, conta }
}

export function encerrarSessao(token) {
  if (!token) return
  db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashDeToken(token))
}

export function encerrarTodasAsSessoes(usuarioId, exceto = null) {
  if (exceto) {
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token_hash != ?').run(usuarioId, hashDeToken(exceto))
  } else {
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(usuarioId)
  }
}

export const listarSessoesDoUsuario = db.prepare(
  'SELECT token_hash, agente, ip, criada_em, ultimo_uso FROM sessoes WHERE usuario_id = ? ORDER BY ultimo_uso DESC',
)

/** Limpeza preguicosa: roda no login, que e raro o bastante. */
export function limparExpirados() {
  const momento = agora()
  db.prepare('DELETE FROM sessoes WHERE expira_em <= ?').run(momento)
  db.prepare('DELETE FROM tokens_senha WHERE expira_em <= ? OR usado_em IS NOT NULL').run(momento)
  db.prepare('DELETE FROM tentativas_login WHERE criada_em <= ?').run(agora(-24 * 60 * 60 * 1000))
}

/* ------------------------------------------------------------------ */
/* Convites                                                            */
/* ------------------------------------------------------------------ */

/**
 * Diz por que este e-mail nao pode ser convidado — ou `null` quando pode.
 *
 * Existe separado de `criarConvite` para poder rodar ANTES da conferencia de
 * vaga: reconvidar quem ja foi convidado nao consome assento nenhum, e com a
 * ordem invertida a conta cheia respondia "sem vaga" a quem so precisava ouvir
 * "essa pessoa ja foi convidada".
 */
export function motivoParaNaoConvidar(email) {
  const emailLimpo = String(email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpo)) return 'E-mail inválido'

  if (buscarUsuarioPorIdentificador(emailLimpo)) return 'Esse e-mail já tem acesso ao sistema'

  const pendente = db
    .prepare(
      `SELECT id FROM convites
        WHERE email = ? AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em > ?`,
    )
    .get(emailLimpo, agora())
  if (pendente) return 'Já existe um convite em aberto para esse e-mail'

  return null
}

export function criarConvite({ contaId, email, nome = null, papel = 'membro', criadoPor = null }) {
  if (!PAPEIS.includes(papel)) throw new Error(`Papel invalido: ${papel}`)

  const emailLimpo = String(email ?? '').trim().toLowerCase()
  const impedimento = motivoParaNaoConvidar(emailLimpo)
  if (impedimento) throw new Error(impedimento)

  const token = gerarToken()
  const id = db
    .prepare(
      `INSERT INTO convites (conta_id, email, nome, papel, token_hash, criado_por, expira_em)
       VALUES (@contaId, @email, @nome, @papel, @tokenHash, @criadoPor, @expiraEm)`,
    )
    .run({
      contaId,
      email: emailLimpo,
      nome: nome?.trim() || null,
      papel,
      tokenHash: hashDeToken(token),
      criadoPor,
      expiraEm: agora(DIAS_CONVITE * DIA_MS),
    }).lastInsertRowid

  // O token cru so existe aqui, nesta resposta: e ele que vai no link que o
  // administrador copia e manda pela ferramenta que ele ja usa.
  return { convite: db.prepare('SELECT * FROM convites WHERE id = ?').get(id), token }
}

export const listarConvitesDaConta = db.prepare(
  `SELECT id, email, nome, papel, criado_em, expira_em, aceito_em, cancelado_em
     FROM convites WHERE conta_id = ? AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em > ?
    ORDER BY criado_em DESC`,
)

export function buscarConvitePorToken(token) {
  if (!token) return null
  const convite = db.prepare('SELECT * FROM convites WHERE token_hash = ?').get(hashDeToken(token))
  if (!convite) return null
  if (convite.aceito_em || convite.cancelado_em || convite.expira_em <= agora()) return null
  return convite
}

export function cancelarConvite(id, contaId) {
  const resultado = db
    .prepare(
      `UPDATE convites SET cancelado_em = datetime('now')
        WHERE id = ? AND conta_id = ? AND aceito_em IS NULL AND cancelado_em IS NULL`,
    )
    .run(id, contaId)
  return resultado.changes > 0
}

/* ------------------------------------------------------------------ */
/* Token de senha (primeiro acesso e redefinicao)                      */
/* ------------------------------------------------------------------ */

export function criarTokenSenha(usuarioId, motivo = 'primeiro-acesso') {
  const token = gerarToken()
  db.prepare(
    `INSERT INTO tokens_senha (usuario_id, token_hash, motivo, expira_em)
     VALUES (?, ?, ?, ?)`,
  ).run(usuarioId, hashDeToken(token), motivo, agora(HORAS_TOKEN_SENHA * 60 * 60 * 1000))
  return token
}

export function lerTokenSenha(token) {
  if (!token) return null
  const registro = db.prepare('SELECT * FROM tokens_senha WHERE token_hash = ?').get(hashDeToken(token))
  if (!registro || registro.usado_em || registro.expira_em <= agora()) return null
  return registro
}

export function marcarTokenSenhaUsado(id) {
  db.prepare("UPDATE tokens_senha SET usado_em = datetime('now') WHERE id = ?").run(id)
}

/* ------------------------------------------------------------------ */
/* Codigos de recuperacao do 2FA                                       */
/* ------------------------------------------------------------------ */

/**
 * Gera codigos novos e descarta os antigos. Devolve os codigos em claro UMA
 * vez — o banco fica so com o hash, entao nem nos conseguimos mostrar de novo.
 */
export async function gerarCodigosRecuperacao(usuarioId) {
  const codigos = Array.from({ length: CODIGOS_RECUPERACAO }, () => gerarCodigoRecuperacao())

  const hashes = await Promise.all(codigos.map((codigo) => gerarHashSenha(normalizarCodigoRecuperacao(codigo))))

  const trocar = db.transaction(() => {
    db.prepare('DELETE FROM codigos_recuperacao WHERE usuario_id = ?').run(usuarioId)
    const inserir = db.prepare('INSERT INTO codigos_recuperacao (usuario_id, codigo_hash) VALUES (?, ?)')
    for (const hash of hashes) inserir.run(usuarioId, hash)
  })
  trocar()

  return codigos
}

export function contarCodigosRecuperacao(usuarioId) {
  return db
    .prepare('SELECT COUNT(*) AS total FROM codigos_recuperacao WHERE usuario_id = ? AND usado_em IS NULL')
    .get(usuarioId).total
}

/**
 * Confere o codigo digitado contra os que sobraram. E uma varredura porque o
 * hash tem sal proprio — nao da para procurar pelo valor, so comparar um a um.
 * Sao no maximo 8 comparacoes.
 */
export async function usarCodigoRecuperacao(usuarioId, codigo) {
  const digitado = normalizarCodigoRecuperacao(codigo)
  if (!digitado) return false

  const disponiveis = db
    .prepare('SELECT id, codigo_hash FROM codigos_recuperacao WHERE usuario_id = ? AND usado_em IS NULL')
    .all(usuarioId)

  for (const registro of disponiveis) {
    if (await conferirSenha(digitado, registro.codigo_hash)) {
      db.prepare("UPDATE codigos_recuperacao SET usado_em = datetime('now') WHERE id = ?").run(registro.id)
      return true
    }
  }

  return false
}

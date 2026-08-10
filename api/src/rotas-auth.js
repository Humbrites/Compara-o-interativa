/**
 * A camada HTTP do acesso: cookie de sessao, login, segundo fator, convites e
 * gestao da equipe. As regras moram em `contas.js` e `planos.js`; aqui so
 * entram traducao para HTTP e permissao de quem pode chamar o que.
 */
import { toString as qrParaSvg } from 'qrcode'

import { db } from './db.js'
import {
  agora,
  atrasoDaTentativa,
  buscarConta,
  buscarConvitePorToken,
  buscarUsuario,
  buscarUsuarioPorIdentificador,
  cancelarConvite,
  conferirVaga,
  contarCodigosRecuperacao,
  criarConvite,
  criarSessao,
  criarTokenSenha,
  criarUsuario,
  definirSenha,
  DIAS_SESSAO,
  encerrarSessao,
  ehMaster,
  encerrarTodasAsSessoes,
  gerarCodigosRecuperacao,
  lerSessao,
  lerTokenSenha,
  limparExpirados,
  limparTentativas,
  listarConvitesDaConta,
  listarSessoesDoUsuario,
  listarUsuariosDaConta,
  marcarTokenSenhaUsado,
  motivoParaNaoConvidar,
  podeGravar,
  registrarTentativa,
  resumoAssentos,
  statusEfetivo,
  usarCodigoRecuperacao,
} from './contas.js'
import { descreverCobranca, descreverPlano, podeGerirEquipe, PAPEIS } from './planos.js'
import { conferirSenha, gerarToken, validarSenha } from './senhas.js'
import { conferirCodigo, gerarSegredo, urlOtpauth } from './totp.js'

const NOME_COOKIE = 'ci_sessao'

// Em producao (atras de HTTPS) isto TEM de estar ligado, senao o cookie de
// sessao trafega em claro. Fica por variavel porque o ambiente local roda em
// http://localhost, onde `Secure` faria o navegador descartar o cookie.
const COOKIE_SEGURO = process.env.COOKIE_SEGURO === '1'

/** Rotas que existem justamente para quem ainda nao entrou. */
const PUBLICAS = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/2fa',
  '/api/auth/sair',
  '/api/auth/definir-senha',
])

const PREFIXOS_PUBLICOS = ['/api/auth/convite/']

/* ------------------------------------------------------------------ */
/* Cookie                                                              */
/* ------------------------------------------------------------------ */

function lerCookie(req, nome) {
  const cabecalho = req.headers.cookie
  if (!cabecalho) return null

  for (const parte of cabecalho.split(';')) {
    const igual = parte.indexOf('=')
    if (igual < 0) continue
    if (parte.slice(0, igual).trim() === nome) {
      return decodeURIComponent(parte.slice(igual + 1).trim())
    }
  }
  return null
}

function gravarCookie(reply, token) {
  const partes = [
    `${NOME_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    // Lax e o que impede outro site de disparar POST autenticado no lugar do
    // usuario: o navegador simplesmente nao manda o cookie nessas requisicoes.
    'SameSite=Lax',
    `Max-Age=${DIAS_SESSAO * 24 * 60 * 60}`,
  ]
  if (COOKIE_SEGURO) partes.push('Secure')
  reply.header('set-cookie', partes.join('; '))
}

function apagarCookie(reply) {
  const partes = [`${NOME_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (COOKIE_SEGURO) partes.push('Secure')
  reply.header('set-cookie', partes.join('; '))
}

/* ------------------------------------------------------------------ */
/* Desafio do segundo fator                                            */
/* ------------------------------------------------------------------ */

/**
 * Entre "senha certa" e "codigo certo" existe um estado que NAO e sessao. Ele
 * vive so na memoria e por 5 minutos: reiniciar a API no meio disso custa ao
 * usuario refazer o login, e isso e melhor do que gravar meio-acesso no banco.
 */
const desafios = new Map()
const MINUTOS_DESAFIO = 5

function criarDesafio(usuarioId) {
  const token = gerarToken()
  desafios.set(token, { usuarioId, expiraEm: Date.now() + MINUTOS_DESAFIO * 60 * 1000 })

  for (const [chave, valor] of desafios) {
    if (valor.expiraEm <= Date.now()) desafios.delete(chave)
  }

  return token
}

function lerDesafio(token) {
  const desafio = desafios.get(token)
  if (!desafio) return null
  if (desafio.expiraEm <= Date.now()) {
    desafios.delete(token)
    return null
  }
  return desafio
}

/* ------------------------------------------------------------------ */
/* Formatos devolvidos ao front                                        */
/* ------------------------------------------------------------------ */

function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    usuario: usuario.usuario,
    papel: usuario.papel,
    totpAtivo: Boolean(usuario.totp_ativo),
    // É o que faz a área do operador aparecer no menu — e ela só existe para
    // quem recebeu a marca pela linha de comando.
    operador: Boolean(usuario.operador),
  }
}

function contaPublica(conta) {
  const status = statusEfetivo(conta)
  return {
    id: conta.id,
    nome: conta.nome,
    status,
    somenteLeitura: !podeGravar(conta),
    expiraEm: conta.expira_em,
    exigir2fa: Boolean(conta.exigir_2fa),
    plano: descreverPlano(conta),
    cobranca: descreverCobranca(conta),
    assentos: resumoAssentos(conta),
  }
}

/**
 * Conta que exige 2FA e usuario que ainda nao configurou: ele entra, mas so
 * enxerga a tela de seguranca ate resolver. A alternativa (recusar o login)
 * deixaria a pessoa sem nenhum caminho para se regularizar sozinha.
 */
function pendencia2fa(usuario, conta) {
  return Boolean(conta.exigir_2fa) && !usuario.totp_ativo
}

function sessaoPublica({ usuario, conta }) {
  return {
    usuario: usuarioPublico(usuario),
    // `null` diz ao front que este login é o master: ele abre direto na
    // administração, sem mapa nem empreendimentos.
    conta: conta ? contaPublica(conta) : null,
    master: ehMaster(usuario),
    precisaConfigurar2fa: conta ? pendencia2fa(usuario, conta) : false,
  }
}

/** Usuario + conta recem-lidos do banco (a conta e `null` para o master). */
function montarContexto(usuarioId) {
  const usuario = buscarUsuario.get(usuarioId)
  return { usuario, conta: ehMaster(usuario) ? null : buscarConta.get(usuario.conta_id) }
}

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/* ------------------------------------------------------------------ */

export function registrarAutenticacao(app) {
  /* ---------------------------------------------------------------- */
  /* Guarda: nenhuma rota da API responde sem sessao                    */
  /* ---------------------------------------------------------------- */

  app.addHook('onRequest', async (req, reply) => {
    const caminho = req.url.split('?')[0]

    if (PUBLICAS.has(caminho) || PREFIXOS_PUBLICOS.some((prefixo) => caminho.startsWith(prefixo))) return

    const contexto = lerSessao(lerCookie(req, NOME_COOKIE))
    if (!contexto) {
      return reply.code(401).send({ erro: 'Faça login para continuar', autenticado: false })
    }

    req.contexto = contexto

    /**
     * O MASTER não tem conta: ele administra clientes, não usa o dashboard.
     * Sem esta parada, `contaDe(req)` leria `undefined` e as consultas de
     * empreendimento sairiam sem filtro — que é exatamente o buraco que a
     * conta dona fecha.
     */
    if (ehMaster(contexto.usuario)) {
      const permitido =
        caminho.startsWith('/api/plataforma') ||
        caminho.startsWith('/api/seguranca') ||
        // As fotos entram na visao de suporte; quem confere o dono e a rota.
        caminho.startsWith('/uploads/') ||
        caminho === '/api/sessao' ||
        caminho === '/api/indicadores'

      if (!permitido) {
        return reply.code(403).send({
          erro: 'Este login administra os clientes e não tem base própria de empreendimentos.',
          master: true,
        })
      }
      return
    }

    const escrita = req.method !== 'GET' && req.method !== 'HEAD'
    if (!escrita) return

    // Enquanto o 2FA obrigatorio nao for configurado, o usuario so pode mexer
    // na propria seguranca — e nada mais.
    if (pendencia2fa(contexto.usuario, contexto.conta) && !caminho.startsWith('/api/seguranca/')) {
      return reply.code(403).send({ erro: 'Configure a verificação em duas etapas para continuar', precisa2fa: true })
    }

    // A area do operador nao e dado do cliente: se a conta DELE estiver
    // vencida, ele ainda precisa poder renovar as dos outros — inclusive a
    // propria. Bloquear aqui criaria um travamento sem saida.
    if (caminho.startsWith('/api/plataforma')) return

    // Conta vencida/suspensa continua abrindo e consultando tudo; o que ela
    // perde e a escrita. Ninguem perde dado por boleto atrasado.
    if (!podeGravar(contexto.conta)) {
      return reply.code(402).send({
        erro: 'A conta está suspensa — os dados seguem disponíveis para consulta, mas não é possível gravar. Fale com o suporte para reativar.',
        somenteLeitura: true,
      })
    }
  })

  /* ---------------------------------------------------------------- */
  /* Sessao                                                            */
  /* ---------------------------------------------------------------- */

  app.get('/api/sessao', (req) => sessaoPublica(req.contexto))

  app.post('/api/auth/login', async (req, reply) => {
    const identificador = String(req.body?.identificador ?? '').trim()
    const senha = String(req.body?.senha ?? '')

    if (!identificador || !senha) {
      return reply.code(400).send({ erro: 'Informe o usuário ou e-mail e a senha' })
    }

    limparExpirados()

    // A chave junta identificador e IP: assim uma rajada contra a conta de
    // alguem nao atrapalha o dono legitimo vindo de outro lugar.
    const chave = `${identificador.toLowerCase()}|${req.ip}`
    const atraso = atrasoDaTentativa(chave)
    if (atraso) await espera(atraso)

    const usuario = buscarUsuarioPorIdentificador(identificador)
    const senhaConfere = usuario ? await conferirSenha(senha, usuario.senha_hash) : false

    // Mensagem unica de proposito: dizer "esse e-mail nao existe" entrega a
    // quem esta tentando a lista de quem e cliente.
    if (!usuario || !senhaConfere || !usuario.ativo) {
      registrarTentativa(chave)
      return reply.code(401).send({ erro: 'Usuário ou senha incorretos' })
    }

    // O master nao tem conta; so o cliente pode estar encerrado.
    const conta = ehMaster(usuario) ? null : buscarConta.get(usuario.conta_id)
    if (conta && statusEfetivo(conta) === 'cancelada') {
      registrarTentativa(chave)
      return reply.code(403).send({ erro: 'Esta conta está encerrada. Fale com o suporte.' })
    }

    limparTentativas(chave)

    if (usuario.totp_ativo) {
      return { precisa2fa: true, desafio: criarDesafio(usuario.id) }
    }

    const token = criarSessao(usuario.id, { agente: req.headers['user-agent'] || null, ip: req.ip })
    gravarCookie(reply, token)
    return sessaoPublica(montarContexto(usuario.id))
  })

  app.post('/api/auth/2fa', async (req, reply) => {
    const desafio = lerDesafio(String(req.body?.desafio ?? ''))
    if (!desafio) {
      return reply.code(401).send({ erro: 'A verificação expirou. Faça login novamente.', reiniciar: true })
    }

    const usuario = buscarUsuario.get(desafio.usuarioId)
    if (!usuario || !usuario.ativo) {
      return reply.code(401).send({ erro: 'A verificação expirou. Faça login novamente.', reiniciar: true })
    }

    const chave = `2fa:${usuario.id}|${req.ip}`
    const atraso = atrasoDaTentativa(chave)
    if (atraso) await espera(atraso)

    const codigo = String(req.body?.codigo ?? '')
    const recuperacao = String(req.body?.recuperacao ?? '')

    let liberado = false
    let avisoRecuperacao = null

    if (recuperacao) {
      liberado = await usarCodigoRecuperacao(usuario.id, recuperacao)
      if (liberado) {
        const restantes = contarCodigosRecuperacao(usuario.id)
        avisoRecuperacao = `Código de recuperação usado. Restam ${restantes}. Gere novos em Segurança.`
      }
    } else {
      const passo = conferirCodigo(usuario.totp_segredo, codigo, { ultimoPasso: usuario.totp_passo })
      if (passo !== null) {
        // Grava o passo aceito: o mesmo codigo nao serve uma segunda vez.
        db.prepare('UPDATE usuarios SET totp_passo = ? WHERE id = ?').run(passo, usuario.id)
        liberado = true
      }
    }

    if (!liberado) {
      registrarTentativa(chave)
      return reply.code(401).send({ erro: 'Código inválido ou já usado' })
    }

    limparTentativas(chave)
    desafios.delete(String(req.body?.desafio ?? ''))

    const token = criarSessao(usuario.id, { agente: req.headers['user-agent'] || null, ip: req.ip })
    gravarCookie(reply, token)

    return {
      ...sessaoPublica(montarContexto(usuario.id)),
      aviso: avisoRecuperacao,
    }
  })

  app.post('/api/auth/sair', (req, reply) => {
    encerrarSessao(lerCookie(req, NOME_COOKIE))
    apagarCookie(reply)
    return { ok: true }
  })

  /* ---------------------------------------------------------------- */
  /* Primeiro acesso, redefinicao e convite                            */
  /* ---------------------------------------------------------------- */

  app.post('/api/auth/definir-senha', async (req, reply) => {
    const registro = lerTokenSenha(String(req.body?.token ?? ''))
    if (!registro) return reply.code(400).send({ erro: 'Este link expirou ou já foi usado' })

    const senha = String(req.body?.senha ?? '')
    const problema = validarSenha(senha)
    if (problema) return reply.code(400).send({ erro: problema })

    await definirSenha(registro.usuario_id, senha)
    marcarTokenSenhaUsado(registro.id)
    // Quem redefine a senha derruba as sessoes antigas: se alguem tinha
    // entrado, e agora que ele sai.
    encerrarTodasAsSessoes(registro.usuario_id)

    return { ok: true }
  })

  app.get('/api/auth/convite/:token', (req, reply) => {
    const convite = buscarConvitePorToken(req.params.token)
    if (!convite) return reply.code(404).send({ erro: 'Convite inválido, cancelado ou vencido' })

    const conta = buscarConta.get(convite.conta_id)
    return { email: convite.email, nome: convite.nome, papel: convite.papel, conta: conta.nome }
  })

  app.post('/api/auth/convite/:token', async (req, reply) => {
    const convite = buscarConvitePorToken(req.params.token)
    if (!convite) return reply.code(404).send({ erro: 'Convite inválido, cancelado ou vencido' })

    const conta = buscarConta.get(convite.conta_id)
    if (!podeGravar(conta)) {
      return reply.code(402).send({ erro: 'A conta que convidou você está suspensa. Fale com quem administra.' })
    }

    // A vaga e conferida de novo AQUI: entre o convite e o aceite o plano pode
    // ter mudado, ou outra pessoa pode ter entrado antes.
    const semVaga = conferirVaga(conta)
    if (semVaga) return reply.code(409).send({ erro: semVaga })

    const senha = String(req.body?.senha ?? '')
    const problema = validarSenha(senha)
    if (problema) return reply.code(400).send({ erro: problema })

    let usuario
    try {
      usuario = await criarUsuario({
        contaId: convite.conta_id,
        nome: String(req.body?.nome ?? convite.nome ?? '').trim(),
        email: convite.email,
        usuario: req.body?.usuario || null,
        papel: convite.papel,
        senha,
      })
    } catch (erro) {
      return reply.code(400).send({ erro: erro.message })
    }

    db.prepare("UPDATE convites SET aceito_em = datetime('now') WHERE id = ?").run(convite.id)

    const token = criarSessao(usuario.id, { agente: req.headers['user-agent'] || null, ip: req.ip })
    gravarCookie(reply, token)
    return reply.code(201).send(sessaoPublica({ usuario, conta }))
  })

  /* ---------------------------------------------------------------- */
  /* Seguranca do proprio usuario                                       */
  /* ---------------------------------------------------------------- */

  app.post('/api/seguranca/senha', async (req, reply) => {
    const { usuario } = req.contexto

    if (!(await conferirSenha(String(req.body?.senhaAtual ?? ''), usuario.senha_hash))) {
      return reply.code(401).send({ erro: 'Senha atual incorreta' })
    }

    const problema = validarSenha(String(req.body?.novaSenha ?? ''))
    if (problema) return reply.code(400).send({ erro: problema })

    await definirSenha(usuario.id, String(req.body.novaSenha))
    encerrarTodasAsSessoes(usuario.id, lerCookie(req, NOME_COOKIE))

    return { ok: true, aviso: 'Senha alterada. As outras sessões foram encerradas.' }
  })

  /**
   * Passo 1 do 2FA: gera o segredo e o QR, mas ainda NAO liga nada. So depois
   * de a pessoa digitar um codigo valido e que o fator passa a valer — senao
   * daria para se trancar para fora com um segredo que nunca foi lido.
   */
  app.post('/api/seguranca/2fa/iniciar', async (req) => {
    const { usuario } = req.contexto
    const segredo = gerarSegredo()

    db.prepare('UPDATE usuarios SET totp_segredo = ?, totp_ativo = 0 WHERE id = ?').run(segredo, usuario.id)

    const url = urlOtpauth({ segredo, email: usuario.email })
    const qr = await qrParaSvg(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })

    return { segredo, url, qr }
  })

  app.post('/api/seguranca/2fa/ativar', async (req, reply) => {
    const { usuario } = req.contexto
    const atual = buscarUsuario.get(usuario.id)

    if (!atual.totp_segredo) {
      return reply.code(400).send({ erro: 'Comece pela leitura do QR Code' })
    }

    const passo = conferirCodigo(atual.totp_segredo, String(req.body?.codigo ?? ''), { ultimoPasso: atual.totp_passo })
    if (passo === null) {
      return reply.code(400).send({ erro: 'Código inválido. Confira o relógio do celular e tente o código atual.' })
    }

    db.prepare('UPDATE usuarios SET totp_ativo = 1, totp_passo = ? WHERE id = ?').run(passo, usuario.id)
    const codigos = await gerarCodigosRecuperacao(usuario.id)

    return { ok: true, codigos }
  })

  app.post('/api/seguranca/2fa/desativar', async (req, reply) => {
    const { usuario, conta } = req.contexto

    if (conta.exigir_2fa) {
      return reply.code(403).send({ erro: 'A conta exige verificação em duas etapas — não é possível desativar.' })
    }
    if (!(await conferirSenha(String(req.body?.senha ?? ''), usuario.senha_hash))) {
      return reply.code(401).send({ erro: 'Senha incorreta' })
    }

    db.prepare('UPDATE usuarios SET totp_ativo = 0, totp_segredo = NULL, totp_passo = NULL WHERE id = ?').run(usuario.id)
    db.prepare('DELETE FROM codigos_recuperacao WHERE usuario_id = ?').run(usuario.id)

    return { ok: true }
  })

  app.post('/api/seguranca/2fa/codigos', async (req, reply) => {
    const { usuario } = req.contexto
    const atual = buscarUsuario.get(usuario.id)

    if (!atual.totp_ativo) return reply.code(400).send({ erro: 'A verificação em duas etapas não está ativa' })
    if (!(await conferirSenha(String(req.body?.senha ?? ''), usuario.senha_hash))) {
      return reply.code(401).send({ erro: 'Senha incorreta' })
    }

    return { codigos: await gerarCodigosRecuperacao(usuario.id) }
  })

  app.get('/api/seguranca/sessoes', (req) => {
    const { usuario, sessao: atual } = req.contexto

    return {
      codigosRecuperacao: contarCodigosRecuperacao(usuario.id),
      sessoes: listarSessoesDoUsuario.all(usuario.id).map((sessao) => ({
        agente: sessao.agente,
        ip: sessao.ip,
        criadaEm: sessao.criada_em,
        ultimoUso: sessao.ultimo_uso,
        atual: sessao.token_hash === atual.token_hash,
      })),
    }
  })

  app.post('/api/seguranca/sessoes/encerrar-outras', (req) => {
    encerrarTodasAsSessoes(req.contexto.usuario.id, lerCookie(req, NOME_COOKIE))
    return { ok: true }
  })

  /* ---------------------------------------------------------------- */
  /* Conta e equipe                                                    */
  /* ---------------------------------------------------------------- */

  app.get('/api/conta', (req) => {
    const { conta, usuario } = req.contexto
    return {
      ...contaPublica(conta),
      podeGerirEquipe: podeGerirEquipe(usuario.papel),
      usuarios: listarUsuariosDaConta.all(conta.id).map((linha) => ({
        id: linha.id,
        nome: linha.nome,
        email: linha.email,
        usuario: linha.usuario,
        papel: linha.papel,
        ativo: Boolean(linha.ativo),
        totpAtivo: Boolean(linha.totp_ativo),
        senhaDefinida: Boolean(linha.senha_definida),
        ultimoAcesso: linha.ultimo_acesso,
      })),
      convites: listarConvitesDaConta.all(conta.id, agora()),
    }
  })

  /** Nome e exigencia de 2FA sao do dono. O PLANO nao passa por aqui de
   *  proposito: quem vende define o contrato, senao bastaria trocar o proprio
   *  plano para "personalizado, sem teto" e o limite viraria enfeite. */
  app.put('/api/conta', (req, reply) => {
    const { conta, usuario } = req.contexto
    if (usuario.papel !== 'dono') return reply.code(403).send({ erro: 'Somente o dono da conta pode alterar isso' })

    const nome = req.body?.nome === undefined ? conta.nome : String(req.body.nome).trim()
    if (!nome) return reply.code(400).send({ erro: 'A conta precisa de um nome' })

    const exigir = req.body?.exigir2fa === undefined ? conta.exigir_2fa : req.body.exigir2fa ? 1 : 0

    db.prepare("UPDATE contas SET nome = ?, exigir_2fa = ?, atualizado_em = datetime('now') WHERE id = ?").run(
      nome,
      exigir,
      conta.id,
    )

    return contaPublica(buscarConta.get(conta.id))
  })

  app.post('/api/conta/convites', (req, reply) => {
    const { conta, usuario } = req.contexto
    if (!podeGerirEquipe(usuario.papel)) {
      return reply.code(403).send({ erro: 'Somente o dono ou um administrador pode convidar' })
    }

    const papel = String(req.body?.papel ?? 'membro')
    if (!PAPEIS.includes(papel)) return reply.code(400).send({ erro: 'Papel inválido' })
    if (papel === 'dono' && usuario.papel !== 'dono') {
      return reply.code(403).send({ erro: 'Somente o dono pode convidar outro dono' })
    }

    // Impedimento do e-mail vem ANTES da vaga: reconvidar quem já foi
    // convidado não ocupa assento novo, e responder "sem vaga" nesse caso
    // manda o administrador procurar um problema que não existe.
    const impedimento = motivoParaNaoConvidar(req.body?.email)
    if (impedimento) return reply.code(400).send({ erro: impedimento })

    const semVaga = conferirVaga(conta)
    if (semVaga) return reply.code(409).send({ erro: semVaga })

    try {
      const { convite, token } = criarConvite({
        contaId: conta.id,
        email: req.body?.email,
        nome: req.body?.nome,
        papel,
        criadoPor: usuario.id,
      })

      // Sem servidor de e-mail, quem entrega o convite e o administrador: o
      // link volta na resposta para ele copiar e mandar pelo canal que usa.
      return reply.code(201).send({
        convite: { id: convite.id, email: convite.email, papel: convite.papel, expiraEm: convite.expira_em },
        link: `/convite/${token}`,
        assentos: resumoAssentos(buscarConta.get(conta.id)),
      })
    } catch (erro) {
      return reply.code(400).send({ erro: erro.message })
    }
  })

  app.delete('/api/conta/convites/:id', (req, reply) => {
    const { conta, usuario } = req.contexto
    if (!podeGerirEquipe(usuario.papel)) {
      return reply.code(403).send({ erro: 'Somente o dono ou um administrador pode cancelar convites' })
    }

    if (!cancelarConvite(Number(req.params.id), conta.id)) {
      return reply.code(404).send({ erro: 'Convite não encontrado' })
    }

    return { ok: true, assentos: resumoAssentos(buscarConta.get(conta.id)) }
  })

  app.put('/api/conta/usuarios/:id', (req, reply) => {
    const { conta, usuario } = req.contexto
    if (!podeGerirEquipe(usuario.papel)) {
      return reply.code(403).send({ erro: 'Somente o dono ou um administrador pode alterar usuários' })
    }

    const alvo = buscarUsuario.get(Number(req.params.id))
    if (!alvo || alvo.conta_id !== conta.id) return reply.code(404).send({ erro: 'Usuário não encontrado' })

    // Alterar a si mesmo abre o caminho de se rebaixar sem querer e deixar a
    // conta sem ninguem que administre.
    if (alvo.id === usuario.id) {
      return reply.code(400).send({ erro: 'Você não pode alterar o próprio acesso por aqui' })
    }
    if (alvo.papel === 'dono' && usuario.papel !== 'dono') {
      return reply.code(403).send({ erro: 'Somente o dono pode alterar outro dono' })
    }

    const papel = req.body?.papel === undefined ? alvo.papel : String(req.body.papel)
    if (!PAPEIS.includes(papel)) return reply.code(400).send({ erro: 'Papel inválido' })
    if (papel === 'dono' && usuario.papel !== 'dono') {
      return reply.code(403).send({ erro: 'Somente o dono pode promover alguém a dono' })
    }

    const ativo = req.body?.ativo === undefined ? alvo.ativo : req.body.ativo ? 1 : 0

    // Reativar consome assento de novo — e o limite vale igual.
    if (ativo && !alvo.ativo) {
      const semVaga = conferirVaga(conta)
      if (semVaga) return reply.code(409).send({ erro: semVaga })
    }

    const restaria = db
      .prepare("SELECT COUNT(*) AS total FROM usuarios WHERE conta_id = ? AND papel = 'dono' AND ativo = 1 AND id != ?")
      .get(conta.id, alvo.id).total
    if (alvo.papel === 'dono' && alvo.ativo && (papel !== 'dono' || !ativo) && restaria === 0) {
      return reply.code(400).send({ erro: 'A conta precisa de pelo menos um dono ativo' })
    }

    db.prepare("UPDATE usuarios SET papel = ?, ativo = ?, atualizado_em = datetime('now') WHERE id = ?").run(
      papel,
      ativo,
      alvo.id,
    )

    // Desativado perde as sessoes na hora — senao ele segue dentro do sistema
    // ate o cookie vencer, que e o oposto do que "remover acesso" quer dizer.
    if (!ativo) encerrarTodasAsSessoes(alvo.id)

    return { ok: true, assentos: resumoAssentos(buscarConta.get(conta.id)) }
  })

  /**
   * Gera um link novo de definicao de senha. Serve para quem esqueceu a senha
   * (nao ha e-mail para o "esqueci minha senha" automatico) e para quem nunca
   * chegou a definir a primeira.
   */
  app.post('/api/conta/usuarios/:id/link-senha', (req, reply) => {
    const { conta, usuario } = req.contexto
    if (!podeGerirEquipe(usuario.papel)) {
      return reply.code(403).send({ erro: 'Somente o dono ou um administrador pode gerar o link' })
    }

    const alvo = buscarUsuario.get(Number(req.params.id))
    if (!alvo || alvo.conta_id !== conta.id) return reply.code(404).send({ erro: 'Usuário não encontrado' })
    if (alvo.papel === 'dono' && usuario.papel !== 'dono') {
      return reply.code(403).send({ erro: 'Somente o dono pode gerar link para outro dono' })
    }

    const token = criarTokenSenha(alvo.id, 'redefinicao')
    return { link: `/definir-senha/${token}`, expiraEmHoras: 48 }
  })
}

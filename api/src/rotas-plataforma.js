/**
 * Rotas do OPERADOR (quem vende). Tudo aqui atravessa as contas, entao a
 * guarda e mais estreita que a do resto: nao basta ter sessao, tem de ter a
 * marca `operador` — que nenhuma tela concede.
 */
import { db } from './db.js'
import { listarBaseDaConta } from './base.js'
import {
  agora,
  buscarConta,
  buscarUsuario,
  conferirVaga,
  criarConta,
  criarTokenSenha,
  criarUsuario,
  encerrarTodasAsSessoes,
} from './contas.js'
import { ehOperador, novaDataDeRenovacao, panorama } from './plataforma.js'
import { PAPEIS, PLANOS, STATUS_CONTA, validarPlano } from './planos.js'

/** Prefixo que a guarda de sessão trata em separado (ver `rotas-auth.js`). */
export const PREFIXO_PLATAFORMA = '/api/plataforma'

async function somenteOperador(req, reply) {
  if (!ehOperador(req.contexto?.usuario)) {
    // 404, não 403: para quem não é operador, esta área simplesmente não
    // existe — confirmar que ela existe já é informação.
    return reply.code(404).send({ erro: 'Não encontrado' })
  }
}

/**
 * A data digitada ("2026-09-30") vira o FIM daquele dia. Guardar 00:00:00
 * faria a conta vencer na virada da meia-noite anterior — o cliente perderia
 * o último dia que pagou, e ninguém entenderia por quê.
 */
function fimDoDia(data) {
  if (!data) return null
  const texto = String(data).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return undefined
  return `${texto} 23:59:59`
}

export function registrarPlataforma(app) {
  const guarda = { preHandler: somenteOperador }

  /** Tudo que a tela precisa numa chamada só: a base é pequena. */
  app.get(PREFIXO_PLATAFORMA, guarda, () => panorama())

  app.put(`${PREFIXO_PLATAFORMA}/contas/:id`, guarda, (req, reply) => {
    const conta = buscarConta.get(Number(req.params.id))
    if (!conta) return reply.code(404).send({ erro: 'Conta não encontrada' })

    const corpo = req.body || {}

    const nome = corpo.nome === undefined ? conta.nome : String(corpo.nome).trim()
    if (!nome) return reply.code(400).send({ erro: 'A conta precisa de um nome' })

    const plano = corpo.plano === undefined ? conta.plano : String(corpo.plano)
    const limite =
      corpo.limiteUsuarios === undefined
        ? conta.limite_usuarios
        : corpo.limiteUsuarios === null || corpo.limiteUsuarios === ''
          ? null
          : Number(corpo.limiteUsuarios)

    const problema = validarPlano(plano, limite)
    if (problema) return reply.code(400).send({ erro: problema })

    const status = corpo.status === undefined ? conta.status : String(corpo.status)
    if (!STATUS_CONTA.includes(status)) {
      return reply.code(400).send({ erro: `Status inválido. Use um de: ${STATUS_CONTA.join(', ')}` })
    }

    let expiraEm = conta.expira_em
    if (corpo.expiraEm !== undefined) {
      // String vazia limpa o vencimento (conta sem data para vencer).
      expiraEm = corpo.expiraEm ? fimDoDia(corpo.expiraEm) : null
      if (expiraEm === undefined) return reply.code(400).send({ erro: 'Data de vencimento inválida' })
    }

    db.prepare(
      `UPDATE contas
          SET nome = @nome, plano = @plano, limite_usuarios = @limite, status = @status,
              expira_em = @expiraEm, observacoes = @observacoes, atualizado_em = datetime('now')
        WHERE id = @id`,
    ).run({
      nome,
      plano,
      limite,
      status,
      expiraEm,
      observacoes: corpo.observacoes === undefined ? conta.observacoes : String(corpo.observacoes).trim() || null,
      id: conta.id,
    })

    // Encerrar a conta tira todo mundo na hora; suspender NÃO — a conta
    // suspensa segue consultando, e derrubar a sessão contradiz isso.
    if (status === 'cancelada' && conta.status !== 'cancelada') {
      for (const usuario of db.prepare('SELECT id FROM usuarios WHERE conta_id = ?').all(conta.id)) {
        encerrarTodasAsSessoes(usuario.id)
      }
    }

    return panorama()
  })

  /** Renova N meses a partir do vencimento atual (ou de hoje, se já passou). */
  app.post(`${PREFIXO_PLATAFORMA}/contas/:id/renovar`, guarda, (req, reply) => {
    const conta = buscarConta.get(Number(req.params.id))
    if (!conta) return reply.code(404).send({ erro: 'Conta não encontrada' })

    const meses = Number(req.body?.meses ?? 1)
    if (!Number.isInteger(meses) || meses < 1 || meses > 60) {
      return reply.code(400).send({ erro: 'Informe de 1 a 60 meses' })
    }

    // Renovar reativa: cobrar e deixar suspensa seria o pior dos dois mundos.
    db.prepare("UPDATE contas SET expira_em = ?, status = 'ativa', atualizado_em = datetime('now') WHERE id = ?").run(
      novaDataDeRenovacao(conta, meses),
      conta.id,
    )

    return panorama()
  })

  app.post(`${PREFIXO_PLATAFORMA}/contas`, guarda, async (req, reply) => {
    const corpo = req.body || {}

    const plano = String(corpo.plano || 'individual')
    const limite =
      corpo.limiteUsuarios === undefined || corpo.limiteUsuarios === null || corpo.limiteUsuarios === ''
        ? null
        : Number(corpo.limiteUsuarios)

    const problema = validarPlano(plano, limite)
    if (problema) return reply.code(400).send({ erro: problema })

    let conta
    let usuario
    try {
      conta = criarConta({
        nome: String(corpo.nome || ''),
        plano,
        limiteUsuarios: limite,
        status: corpo.diasTeste ? 'trial' : 'ativa',
        diasTeste: corpo.diasTeste ? Number(corpo.diasTeste) : null,
      })

      // O primeiro é sempre dono: alguém precisa poder convidar o resto.
      usuario = await criarUsuario({
        contaId: conta.id,
        nome: String(corpo.responsavel || ''),
        email: String(corpo.email || ''),
        usuario: corpo.usuario || null,
        papel: 'dono',
      })
    } catch (erro) {
      // Conta criada e usuário recusado deixaria uma conta órfã no banco.
      if (conta && !usuario) db.prepare('DELETE FROM contas WHERE id = ?').run(conta.id)
      return reply.code(400).send({ erro: erro.message })
    }

    // A senha nunca é escolhida por nós: ela nasce no navegador do cliente.
    const token = criarTokenSenha(usuario.id, 'primeiro-acesso')

    return reply.code(201).send({ link: `/definir-senha/${token}`, ...panorama() })
  })

  /**
   * Acrescenta alguem a uma conta que ja existe, sem passar por convite.
   *
   * O convite serve para o cliente montar a propria equipe; isto serve para
   * quando quem vende cadastra a pessoa junto com o contrato. O TETO vale
   * igual: furar o limite por aqui faria dele uma sugestao.
   */
  app.post(`${PREFIXO_PLATAFORMA}/contas/:id/usuarios`, guarda, async (req, reply) => {
    const conta = buscarConta.get(Number(req.params.id))
    if (!conta) return reply.code(404).send({ erro: 'Conta não encontrada' })

    const semVaga = conferirVaga(conta)
    if (semVaga) return reply.code(409).send({ erro: semVaga })

    const papel = String(req.body?.papel || 'membro')
    if (!PAPEIS.includes(papel)) return reply.code(400).send({ erro: 'Papel inválido' })

    let usuario
    try {
      usuario = await criarUsuario({
        contaId: conta.id,
        nome: String(req.body?.nome || ''),
        email: String(req.body?.email || ''),
        usuario: req.body?.usuario || null,
        papel,
      })
    } catch (erro) {
      return reply.code(400).send({ erro: erro.message })
    }

    // A senha nasce no navegador de quem vai usá-la, nunca aqui.
    const token = criarTokenSenha(usuario.id, 'primeiro-acesso')

    return reply.code(201).send({ link: `/definir-senha/${token}`, ...panorama() })
  })

  app.post(`${PREFIXO_PLATAFORMA}/usuarios/:id/link-senha`, guarda, (req, reply) => {
    const alvo = buscarUsuario.get(Number(req.params.id))
    if (!alvo) return reply.code(404).send({ erro: 'Usuário não encontrado' })

    return { link: `/definir-senha/${criarTokenSenha(alvo.id, 'redefinicao')}`, expiraEmHoras: 48 }
  })

  /**
   * A base do cliente, para dar suporte: empreendimentos com unidades, fluxos
   * de pagamento e galeria.
   *
   * SOMENTE LEITURA, e de propósito. Enxergar o que o cliente cadastrou é o que
   * permite responder "por que meu valor do m² está assim"; editar por cima
   * dele, sem que ele saiba, é outra coisa — e nada aqui grava.
   */
  app.get(`${PREFIXO_PLATAFORMA}/contas/:id/base`, guarda, (req, reply) => {
    const conta = buscarConta.get(Number(req.params.id))
    if (!conta) return reply.code(404).send({ erro: 'Conta não encontrada' })

    const empreendimentos = listarBaseDaConta(conta.id)

    return {
      conta: { id: conta.id, nome: conta.nome },
      empreendimentos,
      resumo: {
        empreendimentos: empreendimentos.length,
        unidades: empreendimentos.reduce((total, e) => total + e.unidades.length, 0),
        // Conta as tabelas de venda das unidades E as gerais (formato antigo),
        // senão um cliente que só usa as gerais apareceria com zero.
        fluxos: empreendimentos.reduce(
          (total, e) => total + e.fluxos.length + e.unidades.reduce((soma, u) => soma + u.fluxos.length, 0),
          0,
        ),
        fotos: empreendimentos.reduce((total, e) => total + e.imagens.length, 0),
        semCoordenada: empreendimentos.filter((e) => e.latitude === null || e.longitude === null).length,
      },
    }
  })

  /** O catálogo, para a tela montar os seletores sem repetir os números. */
  app.get(`${PREFIXO_PLATAFORMA}/planos`, guarda, () => ({
    planos: Object.entries(PLANOS).map(([slug, plano]) => ({ slug, ...plano })),
    status: STATUS_CONTA,
    agora: agora(),
  }))
}

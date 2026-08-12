/**
 * A visao de quem VENDE: todas as contas, todos os usuarios e o controle das
 * renovacoes.
 *
 * Separado de `contas.js` de proposito. La, toda consulta e escopada a UMA
 * conta — e essa e a garantia de que um cliente nao ve o outro. Aqui e o
 * oposto: tudo atravessa as contas. Deixar os dois no mesmo arquivo faria a
 * proxima pessoa copiar a query errada.
 */
import { db } from './db.js'
import { agora, resumoAssentos, statusEfetivo } from './contas.js'
import { descreverCobranca, descreverPlano, mesesDoCiclo, PLANOS } from './planos.js'

const DIA_MS = 24 * 60 * 60 * 1000

/** Quantos dias faltam para a data (negativo = já passou). `null` = sem data. */
export function diasAte(dataIso) {
  if (!dataIso) return null
  const alvo = new Date(`${dataIso.replace(' ', 'T')}Z`).getTime()
  if (Number.isNaN(alvo)) return null
  return Math.ceil((alvo - Date.now()) / DIA_MS)
}

/**
 * A faixa de renovacao. Existe para a tela nao precisar recalcular data em
 * lugar nenhum — e para "vence hoje" e "venceu ontem" nunca cairem no mesmo
 * balde por arredondamento.
 */
export function faixaDeRenovacao(conta) {
  if (conta.status === 'cancelada') return 'encerrada'
  if (conta.status === 'suspensa') return 'suspensa'

  const dias = diasAte(conta.expira_em)
  if (dias === null) return 'sem-vencimento'
  if (dias < 0) return 'vencida'
  if (dias <= 7) return 'vence-em-7'
  if (dias <= 30) return 'vence-em-30'
  return 'em-dia'
}

/** Ordem de urgencia: o que exige acao aparece primeiro na lista. */
const PESO_DA_FAIXA = {
  vencida: 0,
  'vence-em-7': 1,
  suspensa: 2,
  'vence-em-30': 3,
  'em-dia': 4,
  'sem-vencimento': 5,
  encerrada: 6,
}

const listarContas = db.prepare('SELECT * FROM contas ORDER BY nome COLLATE NOCASE')

const usuariosPorConta = db.prepare(
  `SELECT id, conta_id, nome, email, usuario, papel, ativo, totp_ativo, operador,
          senha_hash IS NOT NULL AS senha_definida, ultimo_acesso, criado_em
     FROM usuarios ORDER BY nome COLLATE NOCASE`,
)

/** Um retrato de cada conta, com o que a tela precisa mostrar e ordenar. */
export function panorama() {
  const contas = listarContas.all()
  const usuarios = usuariosPorConta.all()

  const porConta = new Map()
  for (const usuario of usuarios) {
    if (!porConta.has(usuario.conta_id)) porConta.set(usuario.conta_id, [])
    porConta.get(usuario.conta_id).push(usuario)
  }

  const linhas = contas.map((conta) => {
    const assentos = resumoAssentos(conta)
    const daConta = porConta.get(conta.id) || []
    const faixa = faixaDeRenovacao(conta)

    // O acesso mais recente da conta inteira responde "esse cliente sumiu?" —
    // que e a pergunta que antecede a renovacao.
    const ultimoAcesso = daConta.reduce(
      (maior, usuario) => (usuario.ultimo_acesso && usuario.ultimo_acesso > (maior || '') ? usuario.ultimo_acesso : maior),
      null,
    )

    return {
      id: conta.id,
      nome: conta.nome,
      plano: descreverPlano(conta),
      cobranca: descreverCobranca(conta),
      status: statusEfetivo(conta),
      statusGravado: conta.status,
      expiraEm: conta.expira_em,
      diasParaVencer: diasAte(conta.expira_em),
      faixa,
      exigir2fa: Boolean(conta.exigir_2fa),
      /** Base que o master abre para apresentar o sistema — e a única em que a
       *  visualização "como usuário" grava. */
      demonstracao: Boolean(conta.demonstracao),
      observacoes: conta.observacoes,
      criadoEm: conta.criado_em,
      ultimoAcesso,
      assentos,
      usuarios: daConta.map((usuario) => ({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        usuario: usuario.usuario,
        papel: usuario.papel,
        ativo: Boolean(usuario.ativo),
        totpAtivo: Boolean(usuario.totp_ativo),
        operador: Boolean(usuario.operador),
        senhaDefinida: Boolean(usuario.senha_definida),
        ultimoAcesso: usuario.ultimo_acesso,
        criadoEm: usuario.criado_em,
      })),
    }
  })

  linhas.sort((a, b) => {
    const peso = PESO_DA_FAIXA[a.faixa] - PESO_DA_FAIXA[b.faixa]
    if (peso !== 0) return peso
    // Dentro da mesma faixa, o que vence antes vem primeiro.
    if (a.diasParaVencer !== null && b.diasParaVencer !== null) return a.diasParaVencer - b.diasParaVencer
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })

  return { contas: linhas, resumo: resumir(linhas) }
}

/**
 * Os numeros do topo. Contam USUARIOS ATIVOS, nao assentos ocupados: convite
 * pendente ocupa vaga mas ainda nao e gente usando o sistema, e misturar os
 * dois daria um "quantas pessoas usam" inflado.
 */
function resumir(linhas) {
  const porPlano = Object.fromEntries(
    Object.keys(PLANOS).map((slug) => [slug, { contas: 0, usuarios: 0 }]),
  )

  const resumo = {
    contas: linhas.length,
    contasAtivas: 0,
    usuarios: 0,
    usuariosAtivos: 0,
    com2fa: 0,
    assentosOcupados: 0,
    vencidas: 0,
    venceEm7: 0,
    venceEm30: 0,
    suspensas: 0,
    encerradas: 0,
    porPlano,
  }

  for (const linha of linhas) {
    const ativos = linha.usuarios.filter((usuario) => usuario.ativo)

    resumo.usuarios += linha.usuarios.length
    resumo.usuariosAtivos += ativos.length
    resumo.com2fa += ativos.filter((usuario) => usuario.totpAtivo).length
    resumo.assentosOcupados += linha.assentos.ocupados

    if (porPlano[linha.plano.slug]) {
      porPlano[linha.plano.slug].contas += 1
      porPlano[linha.plano.slug].usuarios += ativos.length
    }

    if (linha.status === 'ativa' || linha.status === 'trial') resumo.contasAtivas += 1

    if (linha.faixa === 'vencida') resumo.vencidas += 1
    if (linha.faixa === 'vence-em-7') resumo.venceEm7 += 1
    if (linha.faixa === 'vence-em-30') resumo.venceEm30 += 1
    if (linha.faixa === 'suspensa') resumo.suspensas += 1
    if (linha.faixa === 'encerrada') resumo.encerradas += 1
  }

  return resumo
}

/**
 * Renova empurrando a data para a frente. Renovar a partir de HOJE quando a
 * conta ainda esta em dia faria o cliente perder os dias que ja pagou; a base
 * certa e o vencimento atual, e so quando ele ja passou e que vale hoje.
 */
export function novaDataDeRenovacao(conta, meses = mesesDoCiclo(conta)) {
  const atual = conta.expira_em ? new Date(`${conta.expira_em.replace(' ', 'T')}Z`) : null
  const base = atual && atual.getTime() > Date.now() ? atual : new Date()

  const alvo = new Date(base.getTime())
  const diaOriginal = alvo.getUTCDate()
  alvo.setUTCMonth(alvo.getUTCMonth() + meses)

  // 31/01 + 1 mes vira 03/03 no JavaScript. Quando o dia "transborda", volta
  // para o ultimo dia do mes pretendido.
  if (alvo.getUTCDate() !== diaOriginal) alvo.setUTCDate(0)

  return alvo.toISOString().slice(0, 19).replace('T', ' ')
}

/** O operador é quem tem a marca — e ela não é concedida por nenhuma tela. */
export function ehOperador(usuario) {
  return Boolean(usuario?.operador)
}

export { agora }

/**
 * Catalogo de planos e as regras de assento.
 *
 * O catalogo mora no codigo, nao no banco: ele muda quando a oferta muda (ou
 * seja, num commit), e deixar preco/limite editavel em tabela so cria a duvida
 * de qual dos dois esta valendo. O que varia por cliente — o limite negociado —
 * fica na conta.
 */

export const PLANOS = {
  individual: {
    nome: 'Individual',
    usuarios: 1,
    descricao: 'Uma pessoa, base propria de empreendimentos.',
  },
  equipe: {
    nome: 'Equipe',
    usuarios: 3,
    descricao: 'Ate 3 pessoas compartilhando a mesma base.',
  },
  profissional: {
    nome: 'Profissional',
    usuarios: 10,
    descricao: 'Ate 10 pessoas, com administradores proprios.',
  },
  personalizado: {
    nome: 'Personalizado',
    // Sem numero aqui de proposito: quem manda e o limite gravado na conta.
    usuarios: null,
    descricao: 'Limite combinado caso a caso.',
  },
}

export const SEM_TETO = 0

/**
 * De quanto em quanto tempo o cliente paga.
 *
 * Fica na CONTA, não na hora de renovar: é combinado comercial, igual ao
 * plano. Guardar aqui é o que permite o botão dizer "Renovar · 3 meses" em vez
 * de obrigar quem cobra a lembrar o ciclo de cada cliente — e é lembrar errado
 * que gera cobrança fora de hora.
 */
export const PERIODICIDADES = {
  mensal: { nome: 'Mensal', meses: 1, abreviado: 'mês' },
  trimestral: { nome: 'Trimestral', meses: 3, abreviado: 'trimestre' },
  semestral: { nome: 'Semestral', meses: 6, abreviado: 'semestre' },
  anual: { nome: 'Anual', meses: 12, abreviado: 'ano' },
}

export const PERIODICIDADE_PADRAO = 'mensal'

/** Quantos meses um ciclo de cobrança desta conta representa. */
export function mesesDoCiclo(conta) {
  return PERIODICIDADES[conta?.periodicidade]?.meses ?? PERIODICIDADES[PERIODICIDADE_PADRAO].meses
}

export function descreverCobranca(conta) {
  const slug = PERIODICIDADES[conta?.periodicidade] ? conta.periodicidade : PERIODICIDADE_PADRAO
  const periodicidade = PERIODICIDADES[slug]
  return { slug, nome: periodicidade.nome, meses: periodicidade.meses, abreviado: periodicidade.abreviado }
}

export function validarPeriodicidade(periodicidade) {
  if (!PERIODICIDADES[periodicidade]) {
    return `Periodicidade desconhecida: ${periodicidade}. Use uma de ${Object.keys(PERIODICIDADES).join(', ')}`
  }
  return null
}

/** Status em que a conta pode gravar; fora deles, so leitura (ou nem entra). */
export const STATUS_CONTA = ['trial', 'ativa', 'suspensa', 'cancelada']

export const PAPEIS = ['dono', 'admin', 'membro']

/** Quem pode mexer em usuario, convite e plano. */
export function podeGerirEquipe(papel) {
  return papel === 'dono' || papel === 'admin'
}

/** Trocar plano e limite e do dono — nem todo admin fala de contrato. */
export function podeGerirPlano(papel) {
  return papel === 'dono'
}

/**
 * Quantos assentos a conta tem.
 *
 * A ordem importa e e a regra comercial inteira: o que esta gravado na conta
 * VENCE o plano (cliente que negociou 15 nao vira um plano novo no catalogo),
 * `0` e "sem teto" dito explicitamente, e so na ausencia dos dois o plano
 * responde. Plano personalizado sem limite gravado seria "sem teto por
 * esquecimento" — esse caso e recusado na criacao da conta, nao aqui.
 */
export function limiteDeUsuarios(conta) {
  if (conta.limite_usuarios === SEM_TETO) return Infinity
  if (conta.limite_usuarios !== null && conta.limite_usuarios !== undefined) return conta.limite_usuarios

  const plano = PLANOS[conta.plano]
  if (!plano || plano.usuarios === null) return Infinity
  return plano.usuarios
}

/** Rotulo do plano para a tela ("Equipe — 3 usuarios"). */
export function descreverPlano(conta) {
  const plano = PLANOS[conta.plano]
  const limite = limiteDeUsuarios(conta)
  return {
    slug: conta.plano,
    nome: plano?.nome || conta.plano,
    limite: limite === Infinity ? null : limite,
    personalizado: conta.limite_usuarios !== null && conta.limite_usuarios !== undefined,
  }
}

/**
 * Valida o par plano + limite antes de gravar. Devolve a mensagem do problema
 * ou `null` quando esta tudo certo.
 */
export function validarPlano(plano, limite) {
  if (!PLANOS[plano]) {
    return `Plano desconhecido: ${plano}. Use um de ${Object.keys(PLANOS).join(', ')}`
  }
  if (limite !== null && limite !== undefined && (!Number.isInteger(limite) || limite < 0)) {
    return 'O limite de usuarios precisa ser um numero inteiro (0 = sem teto)'
  }
  // Sem esta trava, "personalizado" criado sem numero viraria conta ilimitada
  // por descuido — o jeito mais caro de errar aqui.
  if (plano === 'personalizado' && (limite === null || limite === undefined)) {
    return 'Plano personalizado exige o limite de usuarios (use 0 para sem teto)'
  }
  return null
}

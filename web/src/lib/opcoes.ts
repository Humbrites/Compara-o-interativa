/** Status da obra, do mais inicial ao mais avancado — a ordem alimenta o comparativo. */
export const STATUS_OBRA = [
  'Breve lançamento',
  'Lançamento',
  'Em obras',
  'Fase final',
  'Pronto para morar',
] as const

export const TIPOS = ['Apartamento', 'Casa', 'Comercial', 'Terreno', 'Loteamento', 'Studio', 'Cobertura'] as const

/* --- Unidades ----------------------------------------------------------- */

/** Para onde a unidade esta voltada — o que decide o sol da manha ou da tarde. */
export const POSICOES_SOLARES = [
  'Norte',
  'Sul',
  'Leste',
  'Oeste',
  'Nordeste',
  'Noroeste',
  'Sudeste',
  'Sudoeste',
] as const

/** Onde ela fica no prédio em relacao a rua. */
export const FACES = ['Frente', 'Fundos', 'Lateral', 'Esquina'] as const

export const STATUS_UNIDADE = ['Disponível', 'Reservada', 'Vendida', 'Indisponível'] as const

/**
 * Os quatro estados de disponibilidade, na forma NORMALIZADA (sem acento, em
 * minusculas) — e a mesma que a API grava desde a importacao de tabela.
 *
 * A base tem os dois formatos: o que foi digitado no cadastro ("Disponível") e
 * o que a importacao grava ("disponivel"). Por isso ninguem compara `status`
 * cru em lugar nenhum: passa sempre por `normalizarStatusUnidade`.
 */
export const STATUS_UNIDADE_SLUG = ['disponivel', 'reservada', 'vendida', 'indisponivel'] as const

export type StatusUnidadeSlug = (typeof STATUS_UNIDADE_SLUG)[number]

const ROTULO_STATUS: Record<StatusUnidadeSlug, string> = {
  disponivel: 'Disponível',
  reservada: 'Reservada',
  vendida: 'Vendida',
  indisponivel: 'Indisponível',
}

/** Tira acento e pontuacao — o que sobra e o que compara. */
const achatar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** O status num dos quatro valores; null quando nao da para afirmar qual e. */
export function normalizarStatusUnidade(status: string | null | undefined): StatusUnidadeSlug | null {
  if (!status) return null
  const chave = achatar(status)
  const equivalentes: Record<string, StatusUnidadeSlug> = {
    disponivel: 'disponivel',
    livre: 'disponivel',
    avenda: 'disponivel',
    reservada: 'reservada',
    reservado: 'reservada',
    vendida: 'vendida',
    vendido: 'vendida',
    indisponivel: 'indisponivel',
    bloqueada: 'indisponivel',
    permutada: 'indisponivel',
  }
  return equivalentes[chave] ?? null
}

/**
 * Como o status aparece na tela. Status que nao e um dos quatro (veio digitado
 * a mao antes disso existir) sai como esta — melhor mostrar o que o usuario
 * escreveu do que engolir a informacao.
 */
export function rotuloStatusUnidade(status: string | null): string {
  const slug = normalizarStatusUnidade(status)
  return slug ? ROTULO_STATUS[slug] : (status ?? '').trim()
}

export const CORES_STATUS_UNIDADE: Record<StatusUnidadeSlug, string> = {
  disponivel: 'verde',
  reservada: 'ambar',
  vendida: 'cinza',
  indisponivel: 'cinza',
}

export function corDoStatusUnidade(status: string | null): string {
  const slug = normalizarStatusUnidade(status)
  return slug ? CORES_STATUS_UNIDADE[slug] : 'cinza'
}

/** Peso de cada status: quanto maior, mais avancada a obra. */
export const PESO_STATUS: Record<string, number> = Object.fromEntries(
  STATUS_OBRA.map((status, indice) => [status.toLowerCase(), indice + 1]),
)

export function pesoDoStatus(status: string | null): number | null {
  if (!status) return null
  return PESO_STATUS[status.trim().toLowerCase()] ?? null
}

/** Converte "2027-06", "06/2027" ou "2027" em um numero ordenavel (ano*12+mes). */
export function ordemDaEntrega(entrega: string | null): number | null {
  if (!entrega) return null
  const texto = entrega.trim()

  const iso = /^(\d{4})-(\d{1,2})/.exec(texto)
  if (iso) return Number(iso[1]) * 12 + Number(iso[2])

  const barra = /^(\d{1,2})[\/\-](\d{4})$/.exec(texto)
  if (barra) return Number(barra[2]) * 12 + Number(barra[1])

  const soAno = /^(\d{4})$/.exec(texto)
  if (soAno) return Number(soAno[1]) * 12 + 12

  return null
}

export const CORES_STATUS: Record<string, string> = {
  'breve lançamento': 'roxo',
  lançamento: 'azul',
  'em obras': 'ambar',
  'fase final': 'ciano',
  'pronto para morar': 'verde',
}

export function corDoStatus(status: string | null): string {
  if (!status) return 'cinza'
  return CORES_STATUS[status.trim().toLowerCase()] ?? 'cinza'
}


/** Tipologias de unidade — o que a planta oferece, nao o que o predio e. */
export const TIPOLOGIAS = [
  'Studio',
  '1 dormitório',
  '2 dormitórios',
  '3 dormitórios',
  '4 dormitórios ou mais',
  'Cobertura',
  'Garden',
  'Duplex',
  'Loft',
]

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

export const STATUS_UNIDADE = ['Disponível', 'Reservada', 'Vendida'] as const

export const CORES_STATUS_UNIDADE: Record<string, string> = {
  disponível: 'verde',
  reservada: 'ambar',
  vendida: 'cinza',
}

export function corDoStatusUnidade(status: string | null): string {
  if (!status) return 'cinza'
  return CORES_STATUS_UNIDADE[status.trim().toLowerCase()] ?? 'cinza'
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

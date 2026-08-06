const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const moedaCheia = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export const TRACO = '—'

export function fmtMoeda(valor: number | null | undefined, cheia = false): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return TRACO
  return cheia ? moedaCheia.format(valor) : moeda.format(valor)
}

const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/**
 * Moeda curta para eixo de grafico: R$ 2,5 mil, R$ 628 mil, R$ 1,2 mi.
 * Acima de cem mil o eixo sai sem centavos — "R$ 628,49 mil" e ruido num
 * rotulo que so serve de referencia.
 */
export function fmtMoedaCurta(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return TRACO
  const absoluto = Math.abs(valor)
  if (absoluto >= 1_000_000) return `R$ ${numero.format(valor / 1_000_000)} mi`
  if (absoluto >= 100_000) return `R$ ${inteiro.format(valor / 1_000)} mil`
  if (absoluto >= 1_000) return `R$ ${numero.format(valor / 1_000)} mil`
  return `R$ ${numero.format(valor)}`
}

export function fmtNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return TRACO
  return numero.format(valor)
}

export function fmtArea(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return TRACO
  return `${numero.format(valor)} m²`
}

export function fmtPct(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return TRACO
  return `${numero.format(valor)}%`
}

export function fmtInteiro(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return TRACO
  return String(valor)
}

/** Faixa de metragem em uma linha: "45 – 82 m²", ou so um lado quando o outro falta. */
export function fmtFaixaMetragem(min: number | null, max: number | null): string {
  if (min == null && max == null) return TRACO
  if (min != null && max != null) return min === max ? fmtArea(min) : `${numero.format(min)} – ${fmtArea(max)}`
  return fmtArea(min ?? max)
}

/** Faixa de inteiros: "2 a 3", ou so o numero quando min e max coincidem. */
export function fmtFaixaInteiro(min: number | null, max: number | null): string {
  if (min == null && max == null) return TRACO
  if (min != null && max != null) return min === max ? String(min) : `${min} a ${max}`
  return String(min ?? max)
}

/** Faixa de valores: "R$ 486 mil – R$ 1,5 mi" vira "R$ 486.000 – R$ 1.560.000". */
export function fmtFaixaMoeda(min: number | null, max: number | null): string {
  if (min == null && max == null) return TRACO
  if (min != null && max != null) return min === max ? fmtMoeda(min) : `${fmtMoeda(min)} – ${fmtMoeda(max)}`
  return fmtMoeda(min ?? max)
}

/**
 * A entrega e guardada como texto livre ("2027-06", "Dez/2027", "2028").
 * Aqui so tentamos deixar bonito o formato ISO vindo do input month.
 */
export function fmtEntrega(valor: string | null | undefined): string {
  if (!valor) return TRACO
  const iso = /^(\d{4})-(\d{2})$/.exec(valor.trim())
  if (iso) {
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    const mes = meses[Number(iso[2]) - 1]
    if (mes) return `${mes}/${iso[1]}`
  }
  return valor
}

export function fmtTexto(valor: string | null | undefined): string {
  return valor && valor.trim() ? valor : TRACO
}

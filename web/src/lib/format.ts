const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const moedaCheia = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export const TRACO = '—'

export function fmtMoeda(valor: number | null | undefined, cheia = false): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return TRACO
  return cheia ? moedaCheia.format(valor) : moeda.format(valor)
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

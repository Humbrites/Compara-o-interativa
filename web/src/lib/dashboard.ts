import type { Empreendimento, Filtros } from '../types'

/** Remove acentos e caixa para a busca casar "Sao" com "São". */
function normalizar(texto: string | null | undefined): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function numeroOuNulo(texto: string): number | null {
  if (!texto.trim()) return null
  const num = Number(texto.replace(',', '.'))
  return Number.isFinite(num) ? num : null
}

export function aplicarFiltros(lista: Empreendimento[], filtros: Filtros): Empreendimento[] {
  const busca = normalizar(filtros.busca)
  const dormMin = numeroOuNulo(filtros.dormitorios)
  const metMin = numeroOuNulo(filtros.metragemMin)
  const metMax = numeroOuNulo(filtros.metragemMax)
  const valMin = numeroOuNulo(filtros.valorMin)
  const valMax = numeroOuNulo(filtros.valorMax)

  return lista.filter((e) => {
    if (busca) {
      const alvo = [e.nome, e.construtora, e.cidade, e.bairro].map(normalizar).join(' ')
      if (!alvo.includes(busca)) return false
    }

    if (filtros.cidade && e.cidade !== filtros.cidade) return false
    if (filtros.construtora && e.construtora !== filtros.construtora) return false
    if (filtros.tipo && e.tipo !== filtros.tipo) return false
    if (filtros.status && e.status_obra !== filtros.status) return false

    // "3 dormitorios" no filtro significa 3 ou mais.
    if (dormMin !== null && (e.dormitorios ?? -1) < dormMin) return false

    // A faixa de metragem casa por SOBREPOSICAO: o empreendimento entra se
    // qualquer planta dele cabe na faixa pedida.
    if (metMin !== null && (e.metragem_max ?? e.metragem_min ?? 0) < metMin) return false
    if (metMax !== null && (e.metragem_min ?? e.metragem_max ?? Infinity) > metMax) return false

    if (valMin !== null && (e.valor_m2 ?? -1) < valMin) return false
    if (valMax !== null && (e.valor_m2 ?? Infinity) > valMax) return false

    return true
  })
}

export interface Indicadores {
  total: number
  precoMedioM2: number | null
  maiorMetragem: number | null
  menorMetragem: number | null
  maisBarato: Empreendimento | null
  maisCaro: Empreendimento | null
}

export function calcularIndicadores(lista: Empreendimento[]): Indicadores {
  const comValor = lista.filter((e) => e.valor_m2 !== null && Number.isFinite(e.valor_m2))
  const metragens = lista.flatMap((e) =>
    [e.metragem_min, e.metragem_max].filter((m): m is number => m !== null && Number.isFinite(m)),
  )

  const precoMedioM2 = comValor.length
    ? comValor.reduce((soma, e) => soma + (e.valor_m2 as number), 0) / comValor.length
    : null

  // O "mais barato/caro" e sempre pelo valor do m², o indicador comparavel
  // entre empreendimentos de portes diferentes.
  const ordenadosPorValor = [...comValor].sort((a, b) => (a.valor_m2 as number) - (b.valor_m2 as number))

  return {
    total: lista.length,
    precoMedioM2,
    maiorMetragem: metragens.length ? Math.max(...metragens) : null,
    menorMetragem: metragens.length ? Math.min(...metragens) : null,
    maisBarato: ordenadosPorValor[0] ?? null,
    maisCaro: ordenadosPorValor[ordenadosPorValor.length - 1] ?? null,
  }
}

/** Valores distintos de um campo, para alimentar os selects de filtro. */
export function opcoesDe(lista: Empreendimento[], campo: keyof Empreendimento): string[] {
  const vistos = new Set<string>()
  for (const item of lista) {
    const valor = item[campo]
    if (typeof valor === 'string' && valor.trim()) vistos.add(valor.trim())
  }
  return [...vistos].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

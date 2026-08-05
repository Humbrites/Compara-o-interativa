import type { Unidade } from '../types'

/**
 * Como a unidade e chamada na tela. Cai para o numero, depois para a torre e,
 * em ultimo caso, para "Unidade" — nenhum campo dela e obrigatorio.
 */
export function rotuloUnidade(unidade: Unidade, indice?: number): string {
  const identificacao = unidade.identificacao?.trim()
  if (identificacao) return identificacao

  const numero = unidade.numero?.trim()
  if (numero) return `Unidade ${numero}`

  const torre = unidade.torre?.trim()
  if (torre) return torre

  return indice === undefined ? 'Unidade' : `Unidade ${indice + 1}`
}

/** Onde ela fica: "Torre 2 · 12º andar · nº 1204". */
export function localizacaoUnidade(unidade: Unidade): string {
  const partes: string[] = []
  if (unidade.torre?.trim()) partes.push(unidade.torre.trim())
  if (unidade.andar !== null && Number.isFinite(unidade.andar)) partes.push(`${unidade.andar}º andar`)
  if (unidade.numero?.trim()) partes.push(`nº ${unidade.numero.trim()}`)
  return partes.join(' · ')
}

/** Para onde ela esta voltada: "Norte · Frente". */
export function posicaoUnidade(unidade: Unidade): string {
  return [unidade.posicao_solar, unidade.face].filter((p) => p && p.trim()).join(' · ')
}

/**
 * Valor do m² da unidade: o informado a mao vence; sem ele, deriva do preco
 * total dividido pela metragem privativa.
 */
export function valorM2Da(unidade: Unidade): number | null {
  if (unidade.valor_m2 !== null && Number.isFinite(unidade.valor_m2)) return unidade.valor_m2

  const { valor, metragem } = unidade
  if (valor === null || metragem === null || !Number.isFinite(valor) || !Number.isFinite(metragem) || metragem <= 0) {
    return null
  }
  return valor / metragem
}

interface Faixa {
  min: number | null
  max: number | null
}

function faixa(valores: (number | null)[]): Faixa {
  const numeros = valores.filter((v): v is number => v !== null && Number.isFinite(v))
  if (numeros.length === 0) return { min: null, max: null }
  return { min: Math.min(...numeros), max: Math.max(...numeros) }
}

/**
 * Resumo do conjunto de unidades — e o que o painel mostra no lugar dos
 * campos gerais quando o empreendimento ja tem unidades cadastradas.
 */
export function resumoUnidades(unidades: Unidade[]) {
  return {
    total: unidades.length,
    disponiveis: unidades.filter((u) => (u.status || '').trim().toLowerCase() === 'disponível').length,
    metragem: faixa(unidades.map((u) => u.metragem)),
    valor: faixa(unidades.map((u) => u.valor)),
    valorM2: faixa(unidades.map(valorM2Da)),
    dormitorios: faixa(unidades.map((u) => u.dormitorios)),
    vagas: faixa(unidades.map((u) => u.vagas)),
  }
}

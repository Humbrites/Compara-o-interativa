import type { Empreendimento, FluxoPagamento } from '../types'
import { fmtArea, fmtEntrega, fmtInteiro, fmtMoeda, fmtPct, fmtTexto, TRACO } from './format'
import { ordemDaEntrega, pesoDoStatus } from './opcoes'

/** Em qual direcao esta o "melhor" de um indicador. */
export type Direcao = 'maior' | 'menor'

export type Vencedor = 'a' | 'b' | 'empate' | null

export interface LinhaComparativo {
  chave: string
  rotulo: string
  textoA: string
  textoB: string
  vencedor: Vencedor
  /** Explica por que um lado ganhou — vira o title/tooltip da linha. */
  criterio: string
}

interface Definicao<T> {
  chave: string
  rotulo: string
  direcao: Direcao
  /** Valor numerico usado na disputa (null = nao da para comparar). */
  valor: (item: T) => number | null
  /** Como o valor aparece na tela. */
  texto: (item: T) => string
  criterio: string
}

/**
 * Decide o vencedor de uma linha. So ha disputa quando os DOIS lados tem
 * numero: se um esta em branco, ninguem "ganha" — destacar seria mentir.
 */
function decidir(a: number | null, b: number | null, direcao: Direcao): Vencedor {
  if (a === null || b === null) return null
  if (a === b) return 'empate'
  const aVence = direcao === 'maior' ? a > b : a < b
  return aVence ? 'a' : 'b'
}

function montar<T>(defs: Definicao<T>[], a: T, b: T): LinhaComparativo[] {
  return defs.map((def) => ({
    chave: def.chave,
    rotulo: def.rotulo,
    textoA: def.texto(a),
    textoB: def.texto(b),
    vencedor: decidir(def.valor(a), def.valor(b), def.direcao),
    criterio: def.criterio,
  }))
}

/* ------------------------------------------------------------------ */
/* Empreendimento x Empreendimento                                     */
/* ------------------------------------------------------------------ */

const DEFS_EMPREENDIMENTO: Definicao<Empreendimento>[] = [
  {
    chave: 'valor_m2',
    rotulo: 'Valor médio do m²',
    direcao: 'menor',
    valor: (e) => e.valor_m2,
    texto: (e) => fmtMoeda(e.valor_m2, true),
    criterio: 'Menor valor por m² é melhor',
  },
  {
    chave: 'metragem_min',
    rotulo: 'Metragem mínima',
    direcao: 'maior',
    valor: (e) => e.metragem_min,
    texto: (e) => fmtArea(e.metragem_min),
    criterio: 'Maior metragem é melhor',
  },
  {
    chave: 'metragem_max',
    rotulo: 'Metragem máxima',
    direcao: 'maior',
    valor: (e) => e.metragem_max,
    texto: (e) => fmtArea(e.metragem_max),
    criterio: 'Maior metragem é melhor',
  },
  {
    chave: 'dormitorios',
    rotulo: 'Dormitórios',
    direcao: 'maior',
    valor: (e) => e.dormitorios,
    texto: (e) => fmtInteiro(e.dormitorios),
    criterio: 'Mais dormitórios é melhor',
  },
  {
    chave: 'suites',
    rotulo: 'Suítes',
    direcao: 'maior',
    valor: (e) => e.suites,
    texto: (e) => fmtInteiro(e.suites),
    criterio: 'Mais suítes é melhor',
  },
  {
    chave: 'banheiros',
    rotulo: 'Banheiros',
    direcao: 'maior',
    valor: (e) => e.banheiros,
    texto: (e) => fmtInteiro(e.banheiros),
    criterio: 'Mais banheiros é melhor',
  },
  {
    chave: 'vagas',
    rotulo: 'Vagas',
    direcao: 'maior',
    valor: (e) => e.vagas,
    texto: (e) => fmtInteiro(e.vagas),
    criterio: 'Mais vagas é melhor',
  },
  {
    chave: 'status_obra',
    rotulo: 'Status da obra',
    direcao: 'maior',
    valor: (e) => pesoDoStatus(e.status_obra),
    texto: (e) => fmtTexto(e.status_obra),
    criterio: 'Obra mais avançada é melhor',
  },
  {
    chave: 'entrega',
    rotulo: 'Entrega prevista',
    direcao: 'menor',
    valor: (e) => ordemDaEntrega(e.entrega),
    texto: (e) => fmtEntrega(e.entrega),
    criterio: 'Entrega mais próxima é melhor',
  },
]

export function compararEmpreendimentos(a: Empreendimento, b: Empreendimento): LinhaComparativo[] {
  return montar(DEFS_EMPREENDIMENTO, a, b)
}

/* ------------------------------------------------------------------ */
/* Fluxo de pagamento x Fluxo de pagamento                             */
/* ------------------------------------------------------------------ */

/** Entrada e parcelamento aceitam % e R$ juntos: "20% (R$ 60.000)". */
function pctComValor(pct: number | null, valor: number | null): string {
  const temPct = pct !== null && Number.isFinite(pct)
  const temValor = valor !== null && Number.isFinite(valor)
  if (temPct && temValor) return `${fmtPct(pct)} (${fmtMoeda(valor)})`
  if (temPct) return fmtPct(pct)
  if (temValor) return fmtMoeda(valor)
  return TRACO
}

const DEFS_FLUXO: Definicao<FluxoPagamento | null>[] = [
  {
    chave: 'entrada',
    rotulo: 'Entrada',
    direcao: 'menor',
    valor: (f) => f?.entrada_pct ?? null,
    texto: (f) => (f ? pctComValor(f.entrada_pct, f.entrada_valor) : TRACO),
    criterio: 'Entrada menor exige menos caixa',
  },
  {
    chave: 'parcelamento',
    rotulo: 'Parcelamento',
    direcao: 'maior',
    valor: (f) => f?.parcelas ?? null,
    texto: (f) => {
      if (!f) return TRACO
      const qtd = f.parcelas !== null && Number.isFinite(f.parcelas) ? `${f.parcelas}x` : null
      const valor = f.parcela_valor !== null && Number.isFinite(f.parcela_valor) ? fmtMoeda(f.parcela_valor) : null
      if (qtd && valor) return `${qtd} de ${valor}`
      return qtd ?? valor ?? TRACO
    },
    criterio: 'Mais parcelas dilui o desembolso',
  },
  {
    chave: 'reforcos',
    rotulo: 'Reforços',
    direcao: 'menor',
    valor: (f) => f?.reforcos_qtd ?? null,
    texto: (f) => {
      if (!f) return TRACO
      const qtd = f.reforcos_qtd !== null && Number.isFinite(f.reforcos_qtd) ? String(f.reforcos_qtd) : null
      const valor = f.reforco_valor !== null && Number.isFinite(f.reforco_valor) ? fmtMoeda(f.reforco_valor) : null
      if (qtd && valor) return `${qtd} de ${valor}`
      return qtd ?? valor ?? TRACO
    },
    criterio: 'Menos reforços é melhor para o comprador',
  },
  {
    chave: 'chaves',
    rotulo: 'Chaves',
    direcao: 'menor',
    valor: (f) => f?.chaves_pct ?? null,
    texto: (f) => (f ? fmtPct(f.chaves_pct) : TRACO),
    criterio: 'Parcela nas chaves menor é melhor',
  },
  {
    chave: 'financiamento',
    rotulo: 'Financiamento',
    direcao: 'maior',
    valor: (f) => f?.financiamento_pct ?? null,
    texto: (f) => (f ? fmtPct(f.financiamento_pct) : TRACO),
    criterio: 'Mais financiamento reduz o desembolso direto',
  },
]

export function compararFluxos(a: FluxoPagamento | null, b: FluxoPagamento | null): LinhaComparativo[] {
  return montar(DEFS_FLUXO, a, b)
}

/** Descricao livre e observacoes viram um bloco de texto abaixo da tabela. */
export function textosDoFluxo(fluxo: FluxoPagamento | null) {
  return {
    descricao: fluxo?.descricao?.trim() || '',
    observacoes: fluxo?.observacoes?.trim() || '',
  }
}

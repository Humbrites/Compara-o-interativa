/**
 * A condição de pagamento lida da tabela, dita em português.
 *
 * A prévia da importação mostrava os campos crus ("pos_reforcos_qtd: 4"), que
 * não dizem nada a quem vai conferir se a IA leu a tabela direito. Aqui cada
 * bloco vira uma linha legível — "6 semestrais de R$ 20.000" — na MESMA ordem
 * em que o dinheiro sai: entrada, obra, chaves, banco e o que vem depois.
 *
 * Módulo PURO: nenhuma importação de React — é o que deixa testar cada forma
 * de tabela sem montar a tela.
 */
import type { FluxoDaConstrutora } from '../types'
import { fmtMoeda, fmtPct } from './format'

export interface ParteImportada {
  rotulo: string
  texto: string
  /** Sai DEPOIS da entrega — a tela separa, porque não é desembolso de obra. */
  posChaves?: boolean
}

const numero = (valor: number | null | undefined): number | null =>
  valor !== null && valor !== undefined && Number.isFinite(valor) ? valor : null

/** "6 × R$ 20.000", "6 parcelas", "R$ 20.000 cada" — o que der para dizer. */
function serie(qtd: number | null, valor: number | null, nome: string): string | null {
  if (qtd !== null && valor !== null) return `${qtd} × ${fmtMoeda(valor)}`
  if (qtd !== null) return `${qtd} ${nome}`
  if (valor !== null) return `${fmtMoeda(valor)} cada`
  return null
}

const PERIODICIDADE: Record<string, string> = {
  semestral: 'semestrais',
  anual: 'anuais',
  trimestral: 'trimestrais',
  mensal: 'mensais',
}

/**
 * As partes de uma condição de pagamento, prontas para listar.
 *
 * O que a tabela não trouxe simplesmente NÃO aparece: uma linha "Chaves: —"
 * levaria quem confere a procurar na planilha um número que nunca existiu.
 */
export function descreverFluxoDaConstrutora(fluxo: FluxoDaConstrutora | null | undefined): ParteImportada[] {
  if (!fluxo) return []

  const partes: ParteImportada[] = []

  const entradaPct = numero(fluxo.entrada_pct)
  const entradaValor = numero(fluxo.entrada_valor)
  const entradaVezes = numero(fluxo.entrada_parcelas)
  if (entradaPct !== null || entradaValor !== null) {
    const quanto = [entradaPct !== null ? fmtPct(entradaPct) : null, entradaValor !== null ? fmtMoeda(entradaValor) : null]
      .filter(Boolean)
      .join(' · ')
    // "em 1x" é à vista, e dizer isso só ocupa espaço.
    const vezes = entradaVezes !== null && entradaVezes > 1 ? ` em ${entradaVezes}x` : ''
    partes.push({ rotulo: 'Entrada', texto: `${quanto}${vezes}` })
  }

  const mensais = serie(numero(fluxo.parcelas), numero(fluxo.parcela_valor), 'parcelas')
  if (mensais) partes.push({ rotulo: 'Mensais na obra', texto: mensais })

  const reforcos = serie(numero(fluxo.reforcos_qtd), numero(fluxo.reforco_valor), 'reforços')
  if (reforcos) {
    const periodo = fluxo.reforcos_periodicidade
      ? ` (${PERIODICIDADE[fluxo.reforcos_periodicidade] ?? fluxo.reforcos_periodicidade})`
      : ''
    partes.push({ rotulo: 'Semestrais / balões', texto: `${reforcos}${periodo}` })
  }

  const chavesPct = numero(fluxo.chaves_pct)
  const chavesValor = numero(fluxo.chaves_valor)
  if (chavesPct !== null || chavesValor !== null) {
    partes.push({
      rotulo: 'Chaves',
      texto: [chavesPct !== null ? fmtPct(chavesPct) : null, chavesValor !== null ? fmtMoeda(chavesValor) : null]
        .filter(Boolean)
        .join(' · '),
    })
  }

  const financiamentoPct = numero(fluxo.financiamento_pct)
  const financiamentoValor = numero(fluxo.financiamento_valor)
  if (financiamentoPct !== null || financiamentoValor !== null) {
    partes.push({
      rotulo: 'Saldo na entrega',
      texto: [
        financiamentoPct !== null ? fmtPct(financiamentoPct) : null,
        financiamentoValor !== null ? fmtMoeda(financiamentoValor) : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }

  const posMensais = serie(numero(fluxo.pos_parcelas), numero(fluxo.pos_parcela_valor), 'parcelas')
  if (posMensais) partes.push({ rotulo: 'Mensais pós-chaves', texto: posMensais, posChaves: true })

  const posReforcos = serie(numero(fluxo.pos_reforcos_qtd), numero(fluxo.pos_reforco_valor), 'reforços')
  if (posReforcos) partes.push({ rotulo: 'Semestrais pós-chaves', texto: posReforcos, posChaves: true })

  return partes
}

/** O nome com que a condição será gravada — o mesmo fallback da API. */
export const NOME_FLUXO_PADRAO = 'Tabela da construtora'

export function nomeDoFluxoImportado(fluxo: FluxoDaConstrutora | null | undefined): string {
  return fluxo?.nome?.trim() || NOME_FLUXO_PADRAO
}

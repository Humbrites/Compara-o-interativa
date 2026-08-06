/**
 * As contas de uma tabela de venda.
 *
 * O cartão do fluxo mostra o que foi CADASTRADO ("20%", "36x", "3 reforços").
 * Aqui ficam os números que saem disso: quanto é cada parte em reais, quanto
 * o cliente desembolsa até a entrega e o que sobra para o financiamento —
 * que é o que o corretor precisa dizer em voz alta.
 *
 * Módulo puro: recebe o fluxo e o preço de referência, devolve números.
 */

import type { FluxoPagamento } from '../types'
import { indiceFixo, simular, type Simulacao } from './cub'

/** Uma parte da composição do preço. */
export interface ParteDoFluxo {
  chave: 'entrada' | 'parcelas' | 'reforcos' | 'chaves' | 'financiamento'
  rotulo: string
  /** Quanto essa parte soma, em reais. null = não cadastrada. */
  valor: number | null
  /** Quanto ela representa do valor do imóvel. */
  percentual: number | null
  /** "36 × R$ 2.500", "20% do valor" — como a parte foi cadastrada. */
  detalhe: string | null
}

export interface DetalheFluxo {
  /** O valor do imóvel usado nas contas (do fluxo ou o preço da unidade). */
  base: number | null
  /** De onde veio a base — a tela avisa quando o número não é do próprio fluxo. */
  baseDoFluxo: boolean
  partes: ParteDoFluxo[]
  /** Entrada + parcelas + reforços: o que sai do bolso até a entrega. */
  durante: number
  /** Tudo que foi alocado, inclusive chaves e financiamento. */
  alocado: number
  /**
   * base − alocado. Positivo = falta alocar (a tabela não fecha o preço);
   * negativo = passou do valor do imóvel. null quando não há base.
   */
  diferenca: number | null
  /** A simulação do CUB que gerou o fluxo, quando ele veio da calculadora. */
  simulacao: Simulacao | null
  /** Parâmetros guardados da calculadora (para exibir a origem). */
  cub: { percentual: number; meses: number; parcelaInicial: number } | null
}

function num(valor: number | null | undefined): number | null {
  return valor !== null && valor !== undefined && Number.isFinite(valor) ? valor : null
}

/** Percentual sobre a base, quando os dois existem. */
function daBase(base: number | null, percentual: number | null): number | null {
  if (base === null || percentual === null) return null
  return (base * percentual) / 100
}

function percentualDe(base: number | null, valor: number | null): number | null {
  if (base === null || base <= 0 || valor === null) return null
  return (valor / base) * 100
}

/**
 * @param valorDaUnidade preço da unidade, usado quando a tabela não guardou o
 *   valor do imóvel — sem isso metade das contas ficaria em branco.
 */
export function detalharFluxo(fluxo: FluxoPagamento, valorDaUnidade: number | null = null): DetalheFluxo {
  const doFluxo = num(fluxo.cub_valor_imovel)
  const base = doFluxo ?? num(valorDaUnidade)

  // Entrada: o que valer — valor digitado vence o percentual.
  const entradaValor = num(fluxo.entrada_valor) ?? daBase(base, num(fluxo.entrada_pct))
  const entradaPct = num(fluxo.entrada_pct) ?? percentualDe(base, entradaValor)

  const parcelas = num(fluxo.parcelas)
  const parcelaValor = num(fluxo.parcela_valor)
  const totalParcelas = parcelas !== null && parcelaValor !== null ? parcelas * parcelaValor : parcelaValor

  const reforcos = num(fluxo.reforcos_qtd)
  const reforcoValor = num(fluxo.reforco_valor)
  const totalReforcos = reforcos !== null && reforcoValor !== null ? reforcos * reforcoValor : reforcoValor

  const chaves = daBase(base, num(fluxo.chaves_pct))
  const financiamento = daBase(base, num(fluxo.financiamento_pct))

  const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const partes: ParteDoFluxo[] = [
    {
      chave: 'entrada',
      rotulo: 'Entrada',
      valor: entradaValor,
      percentual: entradaPct,
      detalhe:
        num(fluxo.entrada_pct) !== null && num(fluxo.entrada_valor) !== null
          ? `${fluxo.entrada_pct}% cadastrados`
          : null,
    },
    {
      chave: 'parcelas',
      rotulo: 'Parcelas',
      valor: totalParcelas,
      percentual: percentualDe(base, totalParcelas),
      detalhe:
        parcelas !== null && parcelaValor !== null
          ? `${parcelas} × ${moeda(parcelaValor)}`
          : parcelas !== null
            ? `${parcelas} parcelas`
            : null,
    },
    {
      chave: 'reforcos',
      rotulo: 'Reforços',
      valor: totalReforcos,
      percentual: percentualDe(base, totalReforcos),
      detalhe:
        reforcos !== null && reforcoValor !== null
          ? `${reforcos} × ${moeda(reforcoValor)}`
          : reforcos !== null
            ? `${reforcos} reforços`
            : null,
    },
    {
      chave: 'chaves',
      rotulo: 'Chaves',
      valor: chaves,
      percentual: num(fluxo.chaves_pct),
      detalhe: num(fluxo.chaves_pct) !== null ? `${fluxo.chaves_pct}% do valor` : null,
    },
    {
      chave: 'financiamento',
      rotulo: 'Financiamento',
      valor: financiamento,
      percentual: num(fluxo.financiamento_pct),
      detalhe: num(fluxo.financiamento_pct) !== null ? `${fluxo.financiamento_pct}% do valor` : null,
    },
  ]

  const soma = (chaves_: ParteDoFluxo['chave'][]) =>
    partes.filter((p) => chaves_.includes(p.chave)).reduce((total, p) => total + (p.valor ?? 0), 0)

  const durante = soma(['entrada', 'parcelas', 'reforcos'])
  const alocado = durante + soma(['chaves', 'financiamento'])

  // A simulação só existe quando o fluxo saiu da calculadora do CUB — é ela
  // que grava percentual, meses e parcela inicial.
  const percentual = num(fluxo.cub_percentual)
  const meses = num(fluxo.cub_meses)
  const parcelaInicial = num(fluxo.cub_parcela_inicial)
  const temCub = percentual !== null && meses !== null && meses > 0 && parcelaInicial !== null && parcelaInicial > 0

  return {
    base,
    baseDoFluxo: doFluxo !== null,
    partes,
    durante,
    alocado,
    diferenca: base === null ? null : base - alocado,
    cub: temCub ? { percentual, meses, parcelaInicial } : null,
    simulacao: temCub
      ? simular({
          valorImovel: base,
          entrada: num(fluxo.cub_entrada) ?? entradaValor ?? 0,
          parcelaInicial,
          meses,
          fonte: indiceFixo(percentual),
        })
      : null,
  }
}

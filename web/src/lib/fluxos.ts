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
  chave: 'entrada' | 'parcelas' | 'reforcos' | 'chaves' | 'financiamento' | 'pos_parcelas' | 'pos_reforcos'
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
  /**
   * Chaves + financiamento: o que ainda se deve QUANDO A OBRA ENTREGA.
   *
   * Junto com `base` e `durante`, é a leitura que separa o preço NOMINAL do
   * custo EFETIVO: "R$ 500.000" não diz nada a quem vai pagar 200 mil até as
   * chaves e financiar os outros 300 mil.
   */
  naEntrega: number
  /**
   * Mensais e semestrais DEPOIS das chaves — o financiamento direto com a
   * construtora. Fica FORA de `durante` por definição: nada disso é
   * desembolsado até a entrega, e somá-lo ali faria a obra parecer duas vezes
   * mais cara do que é para quem ainda vai decidir a compra.
   */
  posChaves: number
  /** Tudo que foi alocado, inclusive chaves, financiamento e pós-chaves. */
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

/** Os números crus de uma tabela de venda, já convertidos de texto. */
export interface NumerosDoFluxo {
  /** Valor total do imóvel — sem ele não há saldo nenhum a calcular. */
  base: number | null
  entradaValor: number | null
  entradaPct: number | null
  parcelas: number | null
  parcelaValor: number | null
  reforcosQtd: number | null
  reforcoValor: number | null
  chavesPct: number | null
  /** Mensais DEPOIS das chaves (financiamento direto com a construtora). */
  posParcelas?: number | null
  posParcelaValor?: number | null
  /** Semestrais/balões depois das chaves. */
  posReforcosQtd?: number | null
  posReforcoValor?: number | null
}

export interface TotaisDoFluxo {
  entrada: number | null
  /** Já multiplicado: nº de parcelas × valor da parcela. */
  parcelas: number | null
  reforcos: number | null
  chaves: number | null
  posParcelas: number | null
  posReforcos: number | null
  /**
   * O que sobra para o banco: base menos tudo que o cliente paga direto —
   * entrada, parcelas, reforços, chaves E o que ele paga depois das chaves.
   * Negativo = a tabela já passou do valor do imóvel. null sem base.
   */
  saldo: number | null
  saldoPct: number | null
}

/**
 * A composição da tabela e o saldo que sobra dela.
 *
 * O financiamento é sempre o RESTO: o que o cliente não pagou de entrada, nas
 * parcelas, nos reforços e nas chaves é o que o banco cobre. Uma função só
 * para o formulário (que soma texto sendo digitado) e para o detalhe (que soma
 * o que está gravado) — duas contas dessas divergiriam no primeiro ajuste.
 */
export function totalizarFluxo(n: NumerosDoFluxo): TotaisDoFluxo {
  // Sem a quantidade, o valor unitário ainda diz algo (uma parcela, um reforço).
  const serie = (qtd: number | null | undefined, valor: number | null | undefined) =>
    qtd !== null && qtd !== undefined && valor !== null && valor !== undefined ? qtd * valor : (valor ?? null)

  const entrada = n.entradaValor ?? daBase(n.base, n.entradaPct)
  const parcelas = serie(n.parcelas, n.parcelaValor)
  const reforcos = serie(n.reforcosQtd, n.reforcoValor)
  const chaves = daBase(n.base, n.chavesPct)
  const posParcelas = serie(n.posParcelas, n.posParcelaValor)
  const posReforcos = serie(n.posReforcosQtd, n.posReforcoValor)

  // O que o cliente paga DEPOIS das chaves também sai do valor do imóvel: numa
  // tabela com financiamento direto, ignorá-lo aqui inflaria o saldo do banco
  // com um dinheiro que a construtora já cobrou.
  const saldo =
    n.base === null
      ? null
      : n.base -
        (entrada ?? 0) -
        (parcelas ?? 0) -
        (reforcos ?? 0) -
        (chaves ?? 0) -
        (posParcelas ?? 0) -
        (posReforcos ?? 0)

  return {
    entrada,
    parcelas,
    reforcos,
    chaves,
    posParcelas,
    posReforcos,
    saldo,
    saldoPct: percentualDe(n.base, saldo),
  }
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

  // O formulario mantem % e R$ da entrada em sincronia, entao os dois
  // cadastrados so merecem nota quando NAO batem (tabela antiga, ou base
  // trocada depois): ai o R$ vence e a nota conta o que ficou de fora.
  const pctCadastrado = num(fluxo.entrada_pct)
  const pctDoValorCadastrado = percentualDe(base, num(fluxo.entrada_valor))
  const entradaDivergente =
    pctCadastrado !== null && pctDoValorCadastrado !== null && Math.abs(pctCadastrado - pctDoValorCadastrado) > 0.01

  const parcelas = num(fluxo.parcelas)
  const parcelaValor = num(fluxo.parcela_valor)
  const reforcos = num(fluxo.reforcos_qtd)
  const reforcoValor = num(fluxo.reforco_valor)
  const posParcelas = num(fluxo.pos_parcelas)
  const posParcelaValor = num(fluxo.pos_parcela_valor)
  const posReforcos = num(fluxo.pos_reforcos_qtd)
  const posReforcoValor = num(fluxo.pos_reforco_valor)
  const entradaParcelas = num(fluxo.entrada_parcelas)

  const totais = totalizarFluxo({
    base,
    entradaValor: num(fluxo.entrada_valor),
    entradaPct: num(fluxo.entrada_pct),
    parcelas,
    parcelaValor,
    reforcosQtd: reforcos,
    reforcoValor,
    chavesPct: num(fluxo.chaves_pct),
    posParcelas,
    posParcelaValor,
    posReforcosQtd: posReforcos,
    posReforcoValor,
  })
  const totalParcelas = totais.parcelas
  const totalReforcos = totais.reforcos
  const chaves = totais.chaves

  // Financiamento: o R$ gravado vence, como na entrada. Ele é o saldo que
  // sobrou quando a tabela foi cadastrada; na falta dele (fluxo antigo, ou
  // vindo da calculadora do CUB) o percentual ainda responde.
  const financiamento = num(fluxo.financiamento_valor) ?? daBase(base, num(fluxo.financiamento_pct))
  const financiamentoPct = num(fluxo.financiamento_pct) ?? percentualDe(base, financiamento)

  const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // "10% em 4x de R$ 20.000": a entrada parcelada é a informação que mais
  // falta no cartão — o cliente pergunta "quanto entro hoje?", e a resposta é
  // a primeira das N, não o total.
  const entradaEmVezes =
    entradaParcelas !== null && entradaParcelas > 1
      ? entradaValor !== null
        ? `em ${entradaParcelas}x de ${moeda(entradaValor / entradaParcelas)}`
        : `em ${entradaParcelas}x`
      : null

  const detalheDaEntrada = [entradaEmVezes, entradaDivergente ? `${fluxo.entrada_pct}% cadastrados` : null]
    .filter(Boolean)
    .join(' · ')

  const partes: ParteDoFluxo[] = [
    {
      chave: 'entrada',
      rotulo: 'Entrada',
      valor: entradaValor,
      percentual: entradaPct,
      detalhe: detalheDaEntrada || null,
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
      percentual: financiamentoPct,
      detalhe: financiamento !== null ? 'saldo do valor do imóvel' : null,
    },
    {
      chave: 'pos_parcelas',
      rotulo: 'Mensais pós-chaves',
      valor: totais.posParcelas,
      percentual: percentualDe(base, totais.posParcelas),
      detalhe:
        posParcelas !== null && posParcelaValor !== null
          ? `${posParcelas} × ${moeda(posParcelaValor)} após a entrega`
          : posParcelas !== null
            ? `${posParcelas} parcelas após a entrega`
            : null,
    },
    {
      chave: 'pos_reforcos',
      rotulo: 'Semestrais pós-chaves',
      valor: totais.posReforcos,
      percentual: percentualDe(base, totais.posReforcos),
      detalhe:
        posReforcos !== null && posReforcoValor !== null
          ? `${posReforcos} × ${moeda(posReforcoValor)} após a entrega`
          : posReforcos !== null
            ? `${posReforcos} reforços após a entrega`
            : null,
    },
  ]

  const soma = (chaves_: ParteDoFluxo['chave'][]) =>
    partes.filter((p) => chaves_.includes(p.chave)).reduce((total, p) => total + (p.valor ?? 0), 0)

  const durante = soma(['entrada', 'parcelas', 'reforcos'])
  const naEntrega = soma(['chaves', 'financiamento'])
  // Pós-chaves entra na CONFERÊNCIA da soma (é dinheiro que compõe o preço),
  // mas nunca no desembolso até a entrega.
  const posChaves = soma(['pos_parcelas', 'pos_reforcos'])
  const alocado = durante + naEntrega + posChaves

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
    naEntrega,
    posChaves,
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

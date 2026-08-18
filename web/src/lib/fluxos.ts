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

import type { FluxoPagamento, TipoFluxo } from '../types'
import { indiceFixo, simular, type Simulacao } from './cub'
import { fmtMoeda, TRACO } from './format'

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

/** Os totais de uma tabela agrupados pelo MOMENTO em que o dinheiro sai. */
export interface AgregadosDoFluxo {
  /** Entrada + parcelas + reforços: o que sai do bolso até a entrega. */
  durante: number
  /** Chaves + saldo: o que ainda se deve quando a obra entrega. */
  naEntrega: number
  /** Mensais e semestrais DEPOIS das chaves. */
  posChaves: number
  alocado: number
  /** base − alocado. null quando não há valor do imóvel. */
  diferenca: number | null
}

/**
 * Os três momentos do desembolso, a partir dos totais já calculados.
 *
 * Existe separada de `detalharFluxo` porque o FORMULÁRIO precisa da mesma
 * conferência enquanto a tabela está sendo digitada — e duas somas escritas em
 * lugares diferentes divergiriam no primeiro campo novo.
 *
 * @param financiamento o saldo que sobra na entrega (o resto da tabela).
 */
export function agregarFluxo(
  base: number | null,
  totais: TotaisDoFluxo,
  financiamento: number | null,
): AgregadosDoFluxo {
  const durante = (totais.entrada ?? 0) + (totais.parcelas ?? 0) + (totais.reforcos ?? 0)
  const naEntrega = (totais.chaves ?? 0) + (financiamento ?? 0)
  // Pós-chaves entra na CONFERÊNCIA da soma (é dinheiro que compõe o preço),
  // mas nunca no desembolso até a entrega.
  const posChaves = (totais.posParcelas ?? 0) + (totais.posReforcos ?? 0)
  const alocado = durante + naEntrega + posChaves

  return { durante, naEntrega, posChaves, alocado, diferenca: base === null ? null : base - alocado }
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

  const { durante, naEntrega, posChaves, alocado, diferenca } = agregarFluxo(base, totais, financiamento)

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
    diferenca,
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

/* ------------------------------------------------------------------ */
/* Tabela da construtora × proposta personalizada                      */
/* ------------------------------------------------------------------ */

/** Como cada tipo de fluxo se chama na tela e no papel. */
export const ROTULO_TIPO_FLUXO: Record<TipoFluxo, string> = {
  construtora: 'Tabela da construtora',
  personalizado: 'Personalizado',
}

export type ChaveDaComparacao =
  | 'entrada'
  | 'parcelas'
  | 'reforcos'
  | 'durante'
  | 'chaves'
  | 'saldo'
  | 'pos_chaves'
  | 'total'

export interface LinhaDaComparacao {
  chave: ChaveDaComparacao
  rotulo: string
  /** Lado A (a tabela da construtora, no uso normal). null = não informado. */
  a: number | null
  b: number | null
  /**
   * B − A: quanto a proposta custa a MAIS (+) ou a MENOS (−) naquela linha.
   * null quando um dos lados não tem o dado — comparar contra o vazio faria a
   * ausência virar zero, e "zero de entrada" é uma condição comercial, não uma
   * informação que falta.
   */
  diferenca: number | null
  /** "36 × R$ 2.500" — como aquela parte foi cadastrada de cada lado. */
  detalheA: string | null
  detalheB: string | null
  textoA: string
  textoB: string
  textoDiferenca: string
}

export interface ComparacaoDeFluxos {
  linhas: LinhaDaComparacao[]
  /** O valor do imóvel de cada lado — a tela avisa quando os dois divergem. */
  baseA: number | null
  baseB: number | null
}

/** Diferença em R$ com sinal explícito; sem os dois lados não há diferença. */
function textoDaDiferenca(diferenca: number | null): string {
  if (diferenca === null) return TRACO
  if (Math.abs(diferenca) < 0.005) return 'igual'
  return diferenca > 0 ? `+ ${fmtMoeda(diferenca)}` : `− ${fmtMoeda(-diferenca)}`
}

/**
 * As duas tabelas de venda da mesma unidade, linha a linha.
 *
 * A pergunta que ela responde é a do atendimento: "o que muda se o cliente
 * aceitar a minha proposta em vez da tabela da construtora?". Por isso a
 * diferença é sempre B − A: positivo é a proposta pesando mais naquele bloco.
 *
 * Nada é recalculado aqui — cada lado passa por `detalharFluxo`, que é quem
 * sabe transformar percentual em reais e onde cada parte entra.
 */
export function compararFluxosDetalhado(
  a: FluxoPagamento,
  b: FluxoPagamento,
  valorImovel: number | null = null,
): ComparacaoDeFluxos {
  const ladoA = detalharFluxo(a, valorImovel)
  const ladoB = detalharFluxo(b, valorImovel)

  const parte = (detalhe: DetalheFluxo, chave: ParteDoFluxo['chave']) =>
    detalhe.partes.find((p) => p.chave === chave) ?? null

  /**
   * Um agregado só é informado quando ALGUMA das partes dele foi cadastrada.
   * Sem isso, o lado que nada declarou entraria como R$ 0 e a diferença viraria
   * o total inteiro do outro lado — uma economia que não existe.
   */
  const agregado = (detalhe: DetalheFluxo, chaves: ParteDoFluxo['chave'][], total: number) =>
    chaves.some((chave) => (parte(detalhe, chave)?.valor ?? null) !== null) ? total : null

  const DURANTE: ParteDoFluxo['chave'][] = ['entrada', 'parcelas', 'reforcos']
  const POS: ParteDoFluxo['chave'][] = ['pos_parcelas', 'pos_reforcos']
  const TUDO: ParteDoFluxo['chave'][] = [...DURANTE, 'chaves', 'financiamento', ...POS]

  const daParte = (chave: ParteDoFluxo['chave'], rotulo: string, saida: ChaveDaComparacao) => ({
    chave: saida,
    rotulo,
    a: parte(ladoA, chave)?.valor ?? null,
    b: parte(ladoB, chave)?.valor ?? null,
    detalheA: parte(ladoA, chave)?.detalhe ?? null,
    detalheB: parte(ladoB, chave)?.detalhe ?? null,
  })

  const cruas = [
    daParte('entrada', 'Entrada', 'entrada'),
    daParte('parcelas', 'Parcelas', 'parcelas'),
    daParte('reforcos', 'Reforços', 'reforcos'),
    // Os agregados não repetem detalhe nas duas colunas: a mesma frase escrita
    // dos dois lados só ocupa a linha sem dizer nada de cada tabela.
    {
      chave: 'durante' as const,
      rotulo: 'Total durante a obra',
      a: agregado(ladoA, DURANTE, ladoA.durante),
      b: agregado(ladoB, DURANTE, ladoB.durante),
      detalheA: null,
      detalheB: null,
    },
    daParte('chaves', 'Parcela na entrega (chaves)', 'chaves'),
    daParte('financiamento', 'Saldo na entrega (financiamento)', 'saldo'),
    {
      chave: 'pos_chaves' as const,
      rotulo: 'Pós-chaves (depois da entrega)',
      a: agregado(ladoA, POS, ladoA.posChaves),
      b: agregado(ladoB, POS, ladoB.posChaves),
      detalheA: null,
      detalheB: null,
    },
    {
      chave: 'total' as const,
      rotulo: 'Total do negócio',
      a: agregado(ladoA, TUDO, ladoA.alocado),
      b: agregado(ladoB, TUDO, ladoB.alocado),
      detalheA: null,
      detalheB: null,
    },
  ]

  const linhas: LinhaDaComparacao[] = cruas.map((linha) => {
    const diferenca = linha.a !== null && linha.b !== null ? linha.b - linha.a : null
    return {
      ...linha,
      diferenca,
      textoA: linha.a === null ? TRACO : fmtMoeda(linha.a),
      textoB: linha.b === null ? TRACO : fmtMoeda(linha.b),
      textoDiferenca: textoDaDiferenca(diferenca),
    }
  })

  return { linhas, baseA: ladoA.base, baseB: ladoB.base }
}

/**
 * Quais duas tabelas a comparação abre comparando.
 *
 * O caso do dia a dia é tabela da construtora × proposta do corretor, então é
 * ele que vem pronto. Sem os tipos gravados (base antiga), a leitura mais
 * provável são as duas ÚLTIMAS cadastradas — quem acabou de montar a segunda
 * quer justamente vê-la contra a primeira.
 */
export function ladosPadraoDaComparacao(fluxos: FluxoPagamento[]): { a: number; b: number } | null {
  if (fluxos.length < 2) return null

  const ordenados = [...fluxos].sort((x, y) => x.id - y.id)
  const ultimoDoTipo = (tipo: TipoFluxo) =>
    [...ordenados].reverse().find((fluxo) => fluxo.tipo === tipo) ?? null

  const construtora = ultimoDoTipo('construtora')
  const personalizado = ultimoDoTipo('personalizado')
  if (construtora && personalizado) return { a: construtora.id, b: personalizado.id }

  const [penultimo, ultimo] = ordenados.slice(-2)
  return { a: penultimo.id, b: ultimo.id }
}

/** Como a tabela se chama na tela quando ninguém deu nome a ela. */
export function nomeDoFluxo(fluxo: FluxoPagamento, indice: number): string {
  return fluxo.nome?.trim() || `Fluxo ${indice + 1}`
}

/** O nome sugerido para a proposta montada em cima de uma tabela existente. */
export function nomeDoPersonalizado(nomeDaOrigem: string): string {
  return `Personalizado — ${nomeDaOrigem}`
}

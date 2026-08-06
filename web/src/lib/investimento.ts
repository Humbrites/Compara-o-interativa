/**
 * Simulador de investimento imobiliario.
 *
 * Modulo independente: nao conhece empreendimento, unidade, fluxo de pagamento
 * nem a calculadora do CUB. Tudo que ele precisa vem dos campos preenchidos
 * pelo usuario, entao serve para qualquer imovel — inclusive um que nem esta
 * cadastrado aqui.
 *
 * A conta central e o CRONOGRAMA DA OBRA: mes a mes o saldo devedor e
 * corrigido pelo indice e abatido pelo que o comprador paga. Sao dois
 * cronogramas com a mesma amortizacao — um sem correcao e outro com o CUB —,
 * e e a comparacao entre eles que mostra quanto o indice custa.
 */

import { fmtMoeda, fmtNumero } from './format'

export type UnidadePrazo = 'meses' | 'anos'
export type UnidadeIndice = 'mes' | 'ano'

export interface EntradaInvestimento {
  /** Quanto o imovel custou na compra. */
  valorCompra: number
  /** Entrada paga na assinatura (opcional). */
  entrada?: number | null
  /**
   * Tudo que ja saiu do bolso ate HOJE: entrada, parcelas, reforcos, baloes.
   * O que ainda vai ser pago durante a obra entra pelo plano de pagamento.
   */
  valorPago?: number | null
  /** O que se deve HOJE. Imovel quitado = 0. */
  saldoDevedor?: number | null
  /** Tempo ate a entrega, na unidade escolhida. */
  prazo: number
  unidadePrazo: UnidadePrazo
  /** Valorizacao esperada, em % ao ano. */
  valorizacaoAnual: number
  /** Parcela mensal que ainda sera paga durante a obra (0/null = nenhuma). */
  parcelaMensal?: number | null
  /** Quantas parcelas ainda faltam; null = todas as do prazo. */
  parcelasRestantes?: number | null
  /** Reforcos/baloes previstos ate a entrega. */
  reforcosQtd?: number | null
  reforcoValor?: number | null
  /**
   * Correcao do saldo devedor pelo CUB/INCC. Guardado sempre em % ao MES —
   * quem digita ao ano converte antes com `mensalDoIndice`.
   * null/undefined = simular so com os valores do empreendimento.
   */
  cubMensal?: number | null
}

export interface PontoValorizacao {
  /** Meses desde hoje. */
  mes: number
  valor: number
}

/** Um mes de obra: quanto a divida subiu pelo indice e quanto foi abatido. */
export interface MesDaObra {
  mes: number
  saldoInicial: number
  /** Quanto o indice acrescentou a divida neste mes. */
  correcao: number
  /** Parcela do mes ja reajustada (0 quando as parcelas acabaram). */
  parcela: number
  /** Reforco/balao que cai neste mes, ja reajustado. */
  reforco: number
  /** parcela + reforco, limitado ao que ainda se deve. */
  pagamento: number
  saldoFinal: number
  pagoAcumulado: number
  correcaoAcumulada: number
}

/**
 * O fecho da conta. Sai duas vezes quando o CUB entra — uma so com os valores
 * do empreendimento e outra com o saldo devedor corrigido —, e por isso os
 * campos moram num tipo proprio: as duas conclusoes se comparam linha a linha.
 */
export interface Conclusao {
  /** O que ainda se deve QUANDO A OBRA ENTREGA. */
  saldoDevedor: number
  /** Parcelas e reforcos pagos entre hoje e a entrega. */
  pagoNoPeriodo: number
  /** Ja pago ate hoje + pago no periodo: a base da rentabilidade na entrega. */
  investidoTotal: number
  /** Quanto o indice acrescentou a divida no periodo inteiro. */
  correcao: number
  patrimonioLiquido: number
  lucroPotencial: number
  rentabilidade: number | null
  multiplicador: number | null
  /** A obra mes a mes — e o que a tela e o PDF mostram como evolucao. */
  evolucao: MesDaObra[]
}

export interface CenarioCub extends Conclusao {
  /** O percentual aplicado, em % ao mes. */
  cubMensal: number
  /** O mesmo percentual acumulado no prazo inteiro, em %. */
  cubAcumulado: number
  /** Quanto de patrimonio liquido a correcao consome (>= 0). */
  custoNoPatrimonio: number
  /** Quanto a mais sai do bolso ate a entrega por causa do reajuste. */
  custoNoDesembolso: number
}

export interface ResultadoInvestimento extends Conclusao {
  valorCompra: number
  entrada: number
  /** O que ja tinha saido do bolso quando a simulacao foi feita. */
  valorPago: number
  /** O que se deve HOJE (o da entrega esta em `saldoDevedor`). */
  saldoDevedorHoje: number
  meses: number
  /** O prazo em anos — e nele que a valorizacao composta roda. */
  anos: number
  valorizacaoAnual: number
  /** Valor de compra corrigido pela valorizacao ate a entrega. */
  valorEstimadoEntrega: number
  /** Quanto o imovel valorizou: entrega − compra. */
  ganhoPatrimonialBruto: number
  /** Valorizacao acumulada no periodo, em %. */
  valorizacaoTotal: number
  /** O plano de pagamento que alimentou o cronograma. */
  plano: PlanoDePagamento
  /** A curva do valor do imovel (a valorizacao, nao a divida). */
  evolucaoValor: PontoValorizacao[]
  /**
   * A segunda conclusao, com o CUB corrigindo o saldo devedor. null quando o
   * usuario nao marcou a opcao — ai a unica leitura e a do empreendimento.
   */
  cub: CenarioCub | null
}

/** O que ainda vai ser pago entre hoje e a entrega. */
export interface PlanoDePagamento {
  parcela: number
  /** Quantas parcelas cabem no prazo. */
  parcelas: number
  reforcoValor: number
  /** Em que meses os reforcos caem (distribuidos no prazo). */
  mesesDeReforco: number[]
  /** true quando nao ha nada a pagar ate a entrega. */
  vazio: boolean
}

/**
 * O saldo devedor que o proprio formulario consegue deduzir: o que falta pagar
 * do valor de compra. O "valor ja pago" ja inclui a entrada (e a soma de tudo
 * que saiu do bolso), entao a conta e compra − pago, com piso em zero — pagar
 * mais que o combinado nao vira divida negativa.
 *
 * Devolve null quando nao da para deduzir (sem valor de compra), e ai o campo
 * fica com o usuario.
 */
export function saldoDevedorSugerido(
  valorCompra: number | null | undefined,
  valorPago: number | null | undefined,
): number | null {
  if (valorCompra === null || valorCompra === undefined || !Number.isFinite(valorCompra) || valorCompra <= 0) {
    return null
  }
  return Math.max(0, valorCompra - ou(valorPago))
}

/** Numero valido e positivo, ou o padrao. */
function ou(valor: number | null | undefined, padrao = 0): number {
  return valor !== null && valor !== undefined && Number.isFinite(valor) ? valor : padrao
}

export function mesesDoPrazo(prazo: number, unidade: UnidadePrazo): number {
  const bruto = unidade === 'anos' ? prazo * 12 : prazo
  return Math.max(0, Math.round(bruto))
}

/**
 * O indice sempre roda ao mes. Quem digita "12% ao ano" quer 12% acumulados em
 * doze meses — 0,9489% ao mes —, e nao 12 vezes 1%: taxa se converte por raiz,
 * nao por divisao. Era daqui que saia a maior distorcao quando alguem digitava
 * o CUB anual num campo mensal.
 */
export function mensalDoIndice(percentual: number, unidade: UnidadeIndice): number {
  if (!Number.isFinite(percentual)) return 0
  if (unidade === 'mes') return percentual
  return (Math.pow(1 + percentual / 100, 1 / 12) - 1) * 100
}

/** O caminho de volta: o mensal acumulado em doze meses. */
export function anualDoIndice(percentualMensal: number): number {
  if (!Number.isFinite(percentualMensal)) return 0
  return (Math.pow(1 + percentualMensal / 100, 12) - 1) * 100
}

/**
 * Quantos meses faltam para uma entrega escrita como "2027-06", "06/2027" ou
 * "2027" (ano sozinho conta como dezembro). Entrega no passado vira 0, e
 * texto que nao da para ler vira null — quem chamou decide o que fazer.
 */
export function mesesAteAEntrega(entrega: string | null | undefined, hoje = new Date()): number | null {
  if (!entrega) return null
  const texto = entrega.trim()

  const iso = /^(\d{4})-(\d{1,2})/.exec(texto)
  const barra = /^(\d{1,2})[/-](\d{4})$/.exec(texto)
  const soAno = /^(\d{4})$/.exec(texto)

  let ano: number
  let mes: number
  if (iso) [, ano, mes] = [0, Number(iso[1]), Number(iso[2])]
  else if (barra) [, ano, mes] = [0, Number(barra[2]), Number(barra[1])]
  else if (soAno) [, ano, mes] = [0, Number(soAno[1]), 12]
  else return null

  const diferenca = (ano - hoje.getFullYear()) * 12 + (mes - (hoje.getMonth() + 1))
  return Math.max(0, diferenca)
}

/** O prazo por extenso: "3 anos e 6 meses". */
export function textoDoPrazo(meses: number): string {
  if (meses === 0) return 'entrega imediata'
  const anos = Math.floor(meses / 12)
  const resto = meses % 12
  const partes: string[] = []
  if (anos > 0) partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`)
  if (resto > 0) partes.push(`${resto} ${resto === 1 ? 'mês' : 'meses'}`)
  return partes.join(' e ')
}

/** Quantos pontos desenhar na curva sem virar uma nuvem de dados. */
function passoDaEvolucao(meses: number): number {
  if (meses <= 60) return 1
  if (meses <= 180) return 3
  return 12
}

/**
 * Onde os reforcos caem. Sem data cadastrada em lugar nenhum, o razoavel e
 * espalha-los pelo prazo — 3 reforcos em 36 meses viram os meses 12, 24 e 36,
 * que e como as tabelas anuais funcionam de verdade.
 */
function mesesDosReforcos(quantidade: number, meses: number): number[] {
  if (quantidade <= 0 || meses <= 0) return []
  const total = Math.min(quantidade, meses)
  const intervalo = meses / total
  const posicoes: number[] = []
  for (let i = 1; i <= total; i++) {
    const mes = Math.min(meses, Math.max(1, Math.round(intervalo * i)))
    // Dois reforcos no mesmo mes viram um so: empurra o segundo para o proximo.
    posicoes.push(posicoes.includes(mes) ? Math.min(meses, mes + 1) : mes)
  }
  return [...new Set(posicoes)]
}

export function montarPlano(dados: EntradaInvestimento, meses: number): PlanoDePagamento {
  const parcela = Math.max(0, ou(dados.parcelaMensal))
  const pedidas = ou(dados.parcelasRestantes, meses)
  // Parcela sem numero informado vale pelo prazo inteiro; alem da entrega nao
  // entra na conta (o que se paga depois nao muda o saldo NA entrega).
  const parcelas = parcela > 0 ? Math.min(meses, Math.max(0, Math.round(pedidas || meses))) : 0

  const reforcoValor = Math.max(0, ou(dados.reforcoValor))
  const reforcosQtd = reforcoValor > 0 ? Math.max(0, Math.round(ou(dados.reforcosQtd))) : 0
  const mesesDeReforco = mesesDosReforcos(reforcosQtd, meses)

  return {
    parcela,
    parcelas,
    reforcoValor,
    mesesDeReforco,
    vazio: parcelas === 0 && mesesDeReforco.length === 0,
  }
}

/**
 * A obra mes a mes. O saldo devedor sobe pelo indice e desce pelo que o
 * comprador paga, nessa ordem — e como a construtora fecha o boleto: corrige
 * primeiro, cobra depois. As parcelas e os reforcos tambem sao reajustados
 * pelo indice, porque e isso que o contrato diz.
 *
 * Com taxa 0 a funcao vira a amortizacao pura, e por isso serve aos DOIS
 * cenarios: a unica diferenca entre eles e o indice.
 */
export function cronogramaDaObra(
  saldoInicial: number,
  meses: number,
  percentualMensal: number,
  plano: PlanoDePagamento,
): MesDaObra[] {
  const taxa = percentualMensal / 100
  const linhas: MesDaObra[] = []

  let saldo = Math.max(0, saldoInicial)
  let pagoAcumulado = 0
  let correcaoAcumulada = 0

  for (let mes = 1; mes <= meses; mes++) {
    const saldoInicialDoMes = saldo
    const correcao = saldo * taxa
    saldo += correcao
    correcaoAcumulada += correcao

    // O reajuste da parcela acompanha o mesmo indice do saldo.
    const reajuste = Math.pow(1 + taxa, mes)
    const parcelaBruta = mes <= plano.parcelas ? plano.parcela * reajuste : 0
    const reforcoBruto = plano.mesesDeReforco.includes(mes) ? plano.reforcoValor * reajuste : 0

    // Ninguem paga mais do que deve: o excedente do mes simplesmente nao sai.
    const previsto = parcelaBruta + reforcoBruto
    const pagamento = Math.min(previsto, saldo)
    const proporcao = previsto > 0 ? pagamento / previsto : 0

    saldo -= pagamento
    pagoAcumulado += pagamento

    linhas.push({
      mes,
      saldoInicial: saldoInicialDoMes,
      correcao,
      parcela: parcelaBruta * proporcao,
      reforco: reforcoBruto * proporcao,
      pagamento,
      saldoFinal: saldo,
      pagoAcumulado,
      correcaoAcumulada,
    })
  }

  return linhas
}

/** Fecha um cenario a partir do cronograma dele. */
function concluir(
  evolucao: MesDaObra[],
  base: { saldoInicial: number; valorPago: number; valorEstimadoEntrega: number },
): Conclusao {
  const ultimo = evolucao[evolucao.length - 1]
  const saldoDevedor = ultimo ? ultimo.saldoFinal : Math.max(0, base.saldoInicial)
  const pagoNoPeriodo = ultimo ? ultimo.pagoAcumulado : 0
  const correcao = ultimo ? ultimo.correcaoAcumulada : 0

  const investidoTotal = base.valorPago + pagoNoPeriodo
  const patrimonioLiquido = base.valorEstimadoEntrega - saldoDevedor
  // O lucro potencial nao desconta a divida que sobra (esse numero e o
  // patrimonio liquido); desconta so o que saiu do bolso.
  const lucroPotencial = base.valorEstimadoEntrega - investidoTotal

  return {
    saldoDevedor,
    pagoNoPeriodo,
    investidoTotal,
    correcao,
    patrimonioLiquido,
    lucroPotencial,
    rentabilidade: investidoTotal > 0 ? (lucroPotencial / investidoTotal) * 100 : null,
    multiplicador: investidoTotal > 0 ? patrimonioLiquido / investidoTotal : null,
    evolucao,
  }
}

export function simularInvestimento(dados: EntradaInvestimento): ResultadoInvestimento {
  const valorCompra = ou(dados.valorCompra)
  const entrada = ou(dados.entrada)
  const valorPago = ou(dados.valorPago)
  const saldoDevedorHoje = Math.max(0, ou(dados.saldoDevedor))
  const valorizacaoAnual = ou(dados.valorizacaoAnual)

  const meses = mesesDoPrazo(dados.prazo, dados.unidadePrazo)
  const anos = meses / 12
  const fator = 1 + valorizacaoAnual / 100

  // Valorizacao composta: o prazo em anos pode ser fracionario (18 meses = 1,5).
  const valorEstimadoEntrega = valorCompra * Math.pow(fator, anos)
  const ganhoPatrimonialBruto = valorEstimadoEntrega - valorCompra

  const plano = montarPlano(dados, meses)
  const comum = { saldoInicial: saldoDevedorHoje, valorPago, valorEstimadoEntrega }

  // Cenario do empreendimento: mesma amortizacao, indice zero.
  const semIndice = concluir(cronogramaDaObra(saldoDevedorHoje, meses, 0, plano), comum)

  const evolucaoValor: PontoValorizacao[] = []
  const passo = passoDaEvolucao(meses)
  for (let mes = 0; mes <= meses; mes += passo) {
    evolucaoValor.push({ mes, valor: valorCompra * Math.pow(fator, mes / 12) })
  }
  // O ultimo ponto e sempre a entrega, mesmo que o passo nao caia certinho.
  if (evolucaoValor.length === 0 || evolucaoValor[evolucaoValor.length - 1].mes !== meses) {
    evolucaoValor.push({ mes: meses, valor: valorEstimadoEntrega })
  }

  return {
    ...semIndice,
    valorCompra,
    entrada,
    valorPago,
    saldoDevedorHoje,
    meses,
    anos,
    valorizacaoAnual,
    valorEstimadoEntrega,
    ganhoPatrimonialBruto,
    valorizacaoTotal: valorCompra > 0 ? (valorEstimadoEntrega / valorCompra - 1) * 100 : 0,
    plano,
    evolucaoValor,
    cub: cenarioComCub(dados.cubMensal, { ...comum, meses, plano, semIndice }),
  }
}

/**
 * A conclusao com o CUB. O que muda em relacao a primeira e UMA coisa: o
 * indice. O saldo devedor e corrigido todo mes antes de receber o pagamento, e
 * a propria parcela e reajustada pelo mesmo percentual — a amortizacao, o
 * prazo e a valorizacao do imovel sao identicos nos dois cenarios.
 *
 * O que ja foi pago ate hoje nao entra na correcao: aquele dinheiro ja saiu.
 */
function cenarioComCub(
  cubMensal: number | null | undefined,
  base: {
    saldoInicial: number
    valorPago: number
    valorEstimadoEntrega: number
    meses: number
    plano: PlanoDePagamento
    semIndice: Conclusao
  },
): CenarioCub | null {
  if (cubMensal === null || cubMensal === undefined || !Number.isFinite(cubMensal)) return null

  const evolucao = cronogramaDaObra(base.saldoInicial, base.meses, cubMensal, base.plano)
  const conclusao = concluir(evolucao, base)

  return {
    ...conclusao,
    cubMensal,
    cubAcumulado: (Math.pow(1 + cubMensal / 100, base.meses) - 1) * 100,
    custoNoPatrimonio: base.semIndice.patrimonioLiquido - conclusao.patrimonioLiquido,
    custoNoDesembolso: conclusao.pagoNoPeriodo - base.semIndice.pagoNoPeriodo,
  }
}

/**
 * A frase que fecha cada conclusao — a mesma na tela e no PDF. E o que o
 * corretor le em voz alta para o cliente, entao sai em dinheiro, nao em
 * indicador: quanto sobra de patrimonio e quantas vezes isso e o que saiu do
 * bolso ate a entrega.
 */
export function textoDaConclusao(resultado: ResultadoInvestimento, conclusao: Conclusao): string {
  const patrimonio = fmtMoeda(conclusao.patrimonioLiquido)
  const entrega = `Na entrega, o imóvel vale ${fmtMoeda(resultado.valorEstimadoEntrega)}`

  if (conclusao.investidoTotal <= 0) {
    return conclusao.saldoDevedor > 0
      ? `${entrega} e, quitados ${fmtMoeda(conclusao.saldoDevedor)} de saldo devedor, sobram ${patrimonio}.`
      : `${entrega} — sem dívida, o patrimônio é ${patrimonio}.`
  }

  // O multiplicador e razao, nao dinheiro: "1,99 vezes", nunca "R$ 1,99 vezes".
  const vezes = conclusao.multiplicador !== null ? fmtNumero(conclusao.multiplicador) : null
  const investido =
    conclusao.pagoNoPeriodo > 0
      ? `${fmtMoeda(conclusao.investidoTotal)} investidos até a entrega`
      : `${fmtMoeda(conclusao.investidoTotal)} já investidos`

  return (
    `${entrega}. Com ${investido}` +
    (conclusao.saldoDevedor > 0 ? ` e ${fmtMoeda(conclusao.saldoDevedor)} a quitar` : ' e nada a quitar') +
    `, sobram ${patrimonio}` +
    (vezes ? ` — ${vezes} vezes o que saiu do bolso.` : '.')
  )
}

/**
 * Simulador de investimento imobiliario.
 *
 * Modulo independente: nao conhece empreendimento, unidade, fluxo de pagamento
 * nem a calculadora do CUB. Tudo que ele precisa vem dos campos preenchidos
 * pelo usuario, entao serve para qualquer imovel — inclusive um que nem esta
 * cadastrado aqui.
 */

export type UnidadePrazo = 'meses' | 'anos'

export interface EntradaInvestimento {
  /** Quanto o imovel custou na compra. */
  valorCompra: number
  /** Entrada paga na assinatura (opcional). */
  entrada?: number | null
  /**
   * Tudo que ja saiu do bolso ate agora: entrada, parcelas, reforcos, baloes.
   * E a base da rentabilidade.
   */
  valorPago?: number | null
  /** O que ainda se deve. Imovel quitado = 0. */
  saldoDevedor?: number | null
  /** Tempo ate a entrega, na unidade escolhida. */
  prazo: number
  unidadePrazo: UnidadePrazo
  /** Valorizacao esperada, em % ao ano. */
  valorizacaoAnual: number
}

export interface PontoValorizacao {
  /** Meses desde hoje. */
  mes: number
  valor: number
}

export interface ResultadoInvestimento {
  valorCompra: number
  entrada: number
  valorInvestido: number
  saldoDevedor: number
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
  /** O que sobra de patrimonio depois de quitar a divida. */
  patrimonioLiquido: number
  /**
   * Valor na entrega menos o que foi investido. NAO desconta o saldo devedor —
   * quem quiser o numero "no bolso" olha o patrimonio liquido.
   */
  lucroPotencial: number
  /** lucro / investido — null quando nada foi investido ainda. */
  rentabilidade: number | null
  /** Patrimonio liquido por R$ 1,00 investido — null sem investimento. */
  multiplicador: number | null
  evolucao: PontoValorizacao[]
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

export function simularInvestimento(dados: EntradaInvestimento): ResultadoInvestimento {
  const valorCompra = ou(dados.valorCompra)
  const entrada = ou(dados.entrada)
  const valorInvestido = ou(dados.valorPago)
  const saldoDevedor = ou(dados.saldoDevedor)
  const valorizacaoAnual = ou(dados.valorizacaoAnual)

  const meses = mesesDoPrazo(dados.prazo, dados.unidadePrazo)
  const anos = meses / 12
  const fator = 1 + valorizacaoAnual / 100

  // Valorizacao composta: o prazo em anos pode ser fracionario (18 meses = 1,5).
  const valorEstimadoEntrega = valorCompra * Math.pow(fator, anos)

  const ganhoPatrimonialBruto = valorEstimadoEntrega - valorCompra
  const patrimonioLiquido = valorEstimadoEntrega - saldoDevedor
  const lucroPotencial = valorEstimadoEntrega - valorInvestido

  const evolucao: PontoValorizacao[] = []
  const passo = passoDaEvolucao(meses)
  for (let mes = 0; mes <= meses; mes += passo) {
    evolucao.push({ mes, valor: valorCompra * Math.pow(fator, mes / 12) })
  }
  // O ultimo ponto e sempre a entrega, mesmo que o passo nao caia certinho.
  if (evolucao.length === 0 || evolucao[evolucao.length - 1].mes !== meses) {
    evolucao.push({ mes: meses, valor: valorEstimadoEntrega })
  }

  return {
    valorCompra,
    entrada,
    valorInvestido,
    saldoDevedor,
    meses,
    anos,
    valorizacaoAnual,
    valorEstimadoEntrega,
    ganhoPatrimonialBruto,
    valorizacaoTotal: valorCompra > 0 ? (valorEstimadoEntrega / valorCompra - 1) * 100 : 0,
    patrimonioLiquido,
    lucroPotencial,
    rentabilidade: valorInvestido > 0 ? (lucroPotencial / valorInvestido) * 100 : null,
    multiplicador: valorInvestido > 0 ? patrimonioLiquido / valorInvestido : null,
    evolucao,
  }
}

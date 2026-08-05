/**
 * Simulacao de reajuste de parcela pelo CUB.
 *
 * O motor nao sabe DE ONDE vem o percentual de cada mes: ele pede a uma
 * "fonte de indice". Hoje a fonte e um percentual fixo informado pelo
 * usuario; quando existir a tabela oficial do CUB, basta passar
 * `indiceDaTabela(...)` no lugar — o calculo continua o mesmo.
 */

export interface FonteIndice {
  /** Como a fonte aparece no resumo e nos relatorios. */
  descricao: string
  /** Percentual (em % ao mes) aplicado no mes informado — 1 = primeiro mes. */
  percentualDoMes: (mes: number) => number
}

/** Percentual igual em todos os meses — o que o usuario digita hoje. */
export function indiceFixo(percentualMensal: number): FonteIndice {
  return {
    descricao: `${fmtPercentual(percentualMensal)} ao mês (fixo)`,
    percentualDoMes: () => percentualMensal,
  }
}

/**
 * Tabela oficial de indices, um percentual por mes de obra. Meses alem da
 * tabela caem no percentual de reserva (a media, o ultimo publicado, o que
 * o time definir) — assim uma tabela curta nao zera o resto da simulacao.
 */
export function indiceDaTabela(
  percentuais: number[],
  reserva = 0,
  descricao = 'Tabela oficial do CUB',
): FonteIndice {
  return {
    descricao,
    percentualDoMes: (mes) => percentuais[mes - 1] ?? reserva,
  }
}

export interface EntradaSimulacao {
  valorImovel: number | null
  parcelaInicial: number
  meses: number
  fonte: FonteIndice
  /**
   * Arredonda a parcela em centavos a cada mes antes de reajustar de novo —
   * e o que a construtora faz, porque o boleto do mes seguinte incide sobre o
   * valor efetivamente cobrado. Desligado, a conta roda em precisao total
   * (juros compostos puros) e a diferenca fica em centavos no fim.
   */
  arredondarPorMes?: boolean
}

/** Centavos: o dinheiro que existe de verdade. */
function emCentavos(valor: number): number {
  return Math.round(valor * 100) / 100
}

export interface LinhaSimulacao {
  mes: number
  /** Parcela antes do reajuste do mes (no mes 1, a parcela inicial). */
  parcelaAntes: number
  percentual: number
  reajuste: number
  parcelaAtual: number
  /** Quanto ja foi pago do mes 1 ate aqui. */
  acumuladoPago: number
}

export interface ResumoSimulacao {
  valorImovel: number | null
  meses: number
  parcelaInicial: number
  parcelaFinal: number
  fonte: string
  /** Soma das parcelas ja reajustadas. */
  totalPago: number
  /** Quanto se pagaria mantendo a parcela inicial o periodo inteiro. */
  totalSemReajuste: number
  /** A diferenca entre os dois — o custo do reajuste. */
  totalReajuste: number
  /** Quanto a PARCELA cresceu do primeiro ao ultimo mes, em %. */
  percentualAcumulado: number
  /** Quanto o total pago representa do valor do imovel (null sem valor). */
  percentualDoImovel: number | null
}

export interface Simulacao {
  linhas: LinhaSimulacao[]
  resumo: ResumoSimulacao
}

/** Teto de meses: 50 anos de obra ja e absurdo, e evita travar a tela. */
export const MAX_MESES = 600

/**
 * Juros compostos sobre a parcela: cada mes reajusta a parcela do mes
 * anterior. O valor do imovel nao entra na conta — ele fica fixo, so serve
 * de referencia no resumo.
 */
export function simular({
  valorImovel,
  parcelaInicial,
  meses,
  fonte,
  arredondarPorMes = true,
}: EntradaSimulacao): Simulacao {
  const total = Math.min(Math.max(Math.trunc(meses), 0), MAX_MESES)
  const ajustar = arredondarPorMes ? emCentavos : (valor: number) => valor

  const linhas: LinhaSimulacao[] = []
  let parcela = ajustar(parcelaInicial)
  let acumulado = 0

  for (let mes = 1; mes <= total; mes++) {
    const percentual = fonte.percentualDoMes(mes)
    const parcelaAtual = ajustar(parcela * (1 + percentual / 100))
    // O reajuste sai da diferenca para a tabela fechar na conta do usuario:
    // parcela antes + reajuste = parcela atual, sempre.
    const reajuste = parcelaAtual - parcela
    acumulado = ajustar(acumulado + parcelaAtual)

    linhas.push({
      mes,
      parcelaAntes: parcela,
      percentual,
      reajuste,
      parcelaAtual,
      acumuladoPago: acumulado,
    })

    parcela = parcelaAtual
  }

  const parcelaFinal = linhas.length > 0 ? linhas[linhas.length - 1].parcelaAtual : parcelaInicial
  const totalSemReajuste = parcelaInicial * total

  return {
    linhas,
    resumo: {
      valorImovel,
      meses: total,
      parcelaInicial,
      parcelaFinal,
      fonte: fonte.descricao,
      totalPago: acumulado,
      totalSemReajuste,
      totalReajuste: acumulado - totalSemReajuste,
      percentualAcumulado: parcelaInicial > 0 ? (parcelaFinal / parcelaInicial - 1) * 100 : 0,
      percentualDoImovel: valorImovel && valorImovel > 0 ? (acumulado / valorImovel) * 100 : null,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Entrada e saida em pt-BR                                            */
/* ------------------------------------------------------------------ */

/**
 * Aceita o que o usuario digita de verdade: "2.000,50", "2000.50", "R$ 2.000".
 * Devolve null quando nao da para ler um numero.
 */
export function lerNumero(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, '').trim()
  if (!limpo) return null

  // Com virgula, ela e o separador decimal e o ponto e milhar (pt-BR).
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo

  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : null
}

/**
 * Percentual em pt-BR. O padrao guarda ate 4 casas porque o CUB do mes vem
 * com casas quebradas (0,35%, 0,72%, 1,15%); em numero de resumo, peca 2 —
 * "28,55%" comunica, "28,547%" so polui.
 */
export function fmtPercentual(valor: number, casas = 4): string {
  const formato = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.max(2, casas),
  })
  return `${formato.format(valor)}%`
}

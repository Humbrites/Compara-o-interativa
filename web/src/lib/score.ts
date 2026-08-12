import type { AnaliseDaUnidade } from './analise'
import type { Unidade } from '../types'
import { precoDaUnidade } from './unidades'

/**
 * O score da oportunidade: uma nota de 0 a 100 para "vale a pena?".
 *
 * ⚠️ REGRA DE OURO: o numero NUNCA sai sozinho. Um "82/100" que o corretor nao
 * sabe justificar na frente do cliente vira desconfianca na primeira pergunta
 * ("por que 82?") — entao cada criterio devolve a propria nota, o proprio peso
 * e a frase que o explica, e a tela mostra os tres.
 *
 * Todos os criterios saem do que ESTA CADASTRADO. Localizacao, caracteristicas
 * e potencial de valorizacao ficaram de fora de proposito: nao ha dado no
 * sistema que os sustente, e nota inventada e pior que nota ausente.
 */

export type ChaveDoCriterio =
  | 'precoM2'
  | 'entrada'
  | 'ateAEntrega'
  | 'financiavel'
  | 'parcelamento'
  | 'metragem'

export interface PesosDoScore {
  precoM2: number
  entrada: number
  ateAEntrega: number
  financiavel: number
  parcelamento: number
  metragem: number
}

/**
 * Os pesos padrao. O preco por m² pesa o dobro do resto porque e o unico
 * criterio que compara a unidade com o MERCADO dela (as outras unidades do
 * mesmo predio); os demais descrevem o esforco de compra.
 */
export const PESOS_PADRAO: PesosDoScore = {
  precoM2: 30,
  entrada: 15,
  ateAEntrega: 15,
  financiavel: 15,
  parcelamento: 15,
  metragem: 10,
}

export interface CriterioAvaliado {
  chave: ChaveDoCriterio
  rotulo: string
  /** 0 a 100 — a nota do critério isolado. */
  nota: number | null
  peso: number
  /** nota × peso ÷ 100: o que ele efetivamente somou. */
  pontos: number
  /** A frase que justifica a nota, com o número que a gerou. */
  explicacao: string
}

export interface ScoreDaOportunidade {
  /** 0 a 100. null quando não há dado suficiente para nota nenhuma. */
  nota: number | null
  faixa: 'otima' | 'boa' | 'regular' | 'atencao' | 'sem-dados'
  rotulo: string
  criterios: CriterioAvaliado[]
  /** Soma dos pesos dos critérios que tinham dado — a base real da nota. */
  pesoConsiderado: number
}

/** Nota linear entre dois pontos, presa em 0..100. */
function entre(valor: number, pior: number, melhor: number): number {
  if (pior === melhor) return 50
  const bruta = ((valor - pior) / (melhor - pior)) * 100
  return Math.max(0, Math.min(100, bruta))
}

/**
 * Nota por PROXIMIDADE de uma faixa saudável: dentro dela é 100, e cai
 * conforme se afasta. Serve ao saldo financiável, onde os dois extremos são
 * ruins — pouco saldo exige capital que o comprador não tem, saldo demais vira
 * financiamento que o banco não aprova.
 */
function naFaixa(valor: number, min: number, max: number, tolerancia: number): number {
  if (valor >= min && valor <= max) return 100
  const distancia = valor < min ? min - valor : valor - max
  return Math.max(0, 100 - (distancia / tolerancia) * 100)
}

const arredondar = (valor: number) => Math.round(valor * 10) / 10
const pct = (valor: number) => `${valor.toFixed(1).replace('.', ',')}%`

export function faixaDoScore(nota: number): { faixa: ScoreDaOportunidade['faixa']; rotulo: string } {
  if (nota >= 80) return { faixa: 'otima', rotulo: 'Ótima oportunidade' }
  if (nota >= 65) return { faixa: 'boa', rotulo: 'Boa oportunidade' }
  if (nota >= 45) return { faixa: 'regular', rotulo: 'Oportunidade regular' }
  return { faixa: 'atencao', rotulo: 'Exige atenção' }
}

/**
 * Avalia uma unidade. `unidades` é o empreendimento inteiro — metade dos
 * critérios só existe por comparação com os vizinhos.
 */
export function calcularScore(
  analise: AnaliseDaUnidade,
  unidades: Unidade[],
  pesos: PesosDoScore = PESOS_PADRAO,
): ScoreDaOportunidade {
  const criterios: CriterioAvaliado[] = []

  const avaliar = (
    chave: ChaveDoCriterio,
    rotulo: string,
    nota: number | null,
    explicacao: string,
  ) => {
    const peso = pesos[chave]
    criterios.push({
      chave,
      rotulo,
      nota: nota === null ? null : arredondar(nota),
      peso,
      pontos: nota === null ? 0 : arredondar((nota * peso) / 100),
      explicacao,
    })
  }

  /* --- 1. Preço por m² contra as outras unidades -------------------- */
  if (analise.valorM2 !== null && analise.faixaM2.min !== null && analise.faixaM2.max !== null) {
    const { min, max } = analise.faixaM2
    // Mais barato que o vizinho = melhor. Prédio de preço uniforme dá 50 aos
    // dois lados (o `entre` devolve 50 quando min e max se encontram).
    const nota = entre(analise.valorM2, max, min)
    const diferenca = analise.diferencaParaMedia
    avaliar(
      'precoM2',
      'Preço por m²',
      nota,
      diferenca === null
        ? 'Único preço cadastrado no empreendimento.'
        : Math.abs(diferenca) < 0.05
          ? 'No mesmo preço por m² da média das outras unidades.'
          : diferenca < 0
            ? `${pct(Math.abs(diferenca))} mais barato por m² que a média das outras unidades.`
            : `${pct(diferenca)} mais caro por m² que a média das outras unidades.`,
    )
  } else {
    avaliar('precoM2', 'Preço por m²', null, 'Sem preço ou metragem para comparar.')
  }

  /* --- 2. Entrada: quanto o comprador precisa ter hoje -------------- */
  if (analise.pctEntrada !== null) {
    // 30% de entrada é o padrão de tabela apertada; 5% é o mais leve que se vê.
    const nota = entre(analise.pctEntrada, 30, 5)
    avaliar('entrada', 'Entrada', nota, `Entrada de ${pct(analise.pctEntrada)} do valor da unidade.`)
  } else {
    avaliar('entrada', 'Entrada', null, 'A tabela de venda não informa a entrada.')
  }

  /* --- 3. Capital até a entrega ------------------------------------- */
  if (analise.pctAteAEntrega !== null) {
    const nota = entre(analise.pctAteAEntrega, 60, 20)
    avaliar(
      'ateAEntrega',
      'Capital até a entrega',
      nota,
      `${pct(analise.pctAteAEntrega)} do valor sai do bolso antes das chaves.`,
    )
  } else {
    avaliar('ateAEntrega', 'Capital até a entrega', null, 'Sem tabela de venda para somar o desembolso.')
  }

  /* --- 4. Saldo financiável ----------------------------------------- */
  if (analise.pctFinanciavel !== null) {
    // 50% a 70% é a faixa em que o financiamento costuma caber no bolso e no
    // banco; 20 pontos percentuais de tolerância para cada lado.
    const nota = naFaixa(analise.pctFinanciavel, 50, 70, 20)
    avaliar(
      'financiavel',
      'Saldo financiável',
      nota,
      analise.pctFinanciavel > 70
        ? `${pct(analise.pctFinanciavel)} para financiar — acima do que o banco costuma aprovar sem esforço.`
        : analise.pctFinanciavel < 50
          ? `${pct(analise.pctFinanciavel)} para financiar — exige mais capital próprio antes das chaves.`
          : `${pct(analise.pctFinanciavel)} para financiar, dentro da faixa usual.`,
    )
  } else {
    avaliar('financiavel', 'Saldo financiável', null, 'Sem tabela de venda para saber o saldo.')
  }

  /* --- 5. Parcelamento durante a obra ------------------------------- */
  const parcelas = analise.fluxo?.parcelas ?? null
  if (parcelas !== null && parcelas > 0) {
    // 12 parcelas é curto; 60 é o mais diluído que as tabelas costumam ir.
    const nota = entre(parcelas, 12, 60)
    avaliar('parcelamento', 'Parcelamento', nota, `${parcelas} parcelas durante a obra.`)
  } else {
    avaliar('parcelamento', 'Parcelamento', null, 'A tabela não tem parcelamento informado.')
  }

  /* --- 6. Metragem contra as outras unidades ------------------------ */
  const metragens = unidades
    .map((u) => u.metragem ?? u.metragem_total)
    .filter((v): v is number => v !== null && Number.isFinite(v))

  if (analise.metragem !== null && metragens.length > 1) {
    const min = Math.min(...metragens)
    const max = Math.max(...metragens)
    const nota = entre(analise.metragem, min, max)
    avaliar(
      'metragem',
      'Metragem',
      nota,
      `${analise.metragem} m² dentro da faixa de ${min} a ${max} m² do empreendimento.`,
    )
  } else {
    avaliar('metragem', 'Metragem', null, 'Não há outras unidades para comparar a metragem.')
  }

  /* --- A nota final ------------------------------------------------- */
  const comDado = criterios.filter((c) => c.nota !== null)
  const pesoConsiderado = comDado.reduce((soma, c) => soma + c.peso, 0)

  if (pesoConsiderado === 0) {
    return {
      nota: null,
      faixa: 'sem-dados',
      rotulo: 'Sem dados para avaliar',
      criterios,
      pesoConsiderado: 0,
    }
  }

  // A nota é a média PONDERADA do que tinha dado — critério sem informação não
  // derruba o score, apenas sai da conta (e a tela diz que ele saiu).
  const nota = arredondar(
    comDado.reduce((soma, c) => soma + (c.nota as number) * c.peso, 0) / pesoConsiderado,
  )
  const { faixa, rotulo } = faixaDoScore(nota)

  return { nota, faixa, rotulo, criterios, pesoConsiderado }
}

/** Ordena unidades pela nota — o comparativo usa para dizer qual ganha. */
export function ordenarPorScore(
  itens: { unidade: Unidade; score: ScoreDaOportunidade }[],
): { unidade: Unidade; score: ScoreDaOportunidade }[] {
  return [...itens].sort((a, b) => {
    const notaA = a.score.nota ?? -1
    const notaB = b.score.nota ?? -1
    if (notaA !== notaB) return notaB - notaA
    // Empate técnico: a mais barata primeiro.
    return (precoDaUnidade(a.unidade) ?? Infinity) - (precoDaUnidade(b.unidade) ?? Infinity)
  })
}

import type { FluxoPagamento, Unidade } from '../types'
import { detalharFluxo } from './fluxos'
// O status gravado vem em formatos diferentes ("Disponível" do cadastro,
// "disponivel" da importação): quem conta unidade disponível precisa dos dois.
import { normalizarStatusUnidade } from './opcoes'
import { BASE_M2_PADRAO, metragemDoM2, precoDaUnidade, valorM2Da, type BaseM2 } from './unidades'

/**
 * A analise de uma oportunidade — o que o corretor responde ao cliente.
 *
 * Modulo PURO: entra unidade (e o empreendimento dela), sai numero. Nenhuma
 * conta daqui e feita em componente, porque as tres camadas de analise
 * (unidade, empreendimento e comparativo) tem de dizer o MESMO numero — e a
 * primeira que refizesse a conta por conta propria seria a que divergiria.
 *
 * A pergunta que ela responde nao e "quanto custa", e sim **quanto sai do
 * bolso, quando, e como isso se compara com o resto**.
 */

/** Onde a unidade fica em relacao ao empreendimento dela. */
export type PosicaoNaFaixa = 'abaixo' | 'na-media' | 'acima' | 'unica' | 'sem-base'

export interface AnaliseDaUnidade {
  /** O preco da unidade (dela ou o valor total gravado na tabela de venda). */
  valor: number | null
  /** Preco por m² — a mesma regra do cadastro (total, privativa na falta). */
  valorM2: number | null
  metragem: number | null

  /** A tabela de venda usada na analise (a primeira da unidade). */
  fluxo: FluxoPagamento | null
  /** Entrada da tabela: o capital necessario para ASSINAR. */
  entrada: number | null
  /**
   * Parcelas + reforcos, SEM a entrada: o que o comprador desembolsa ao longo
   * da obra. Separado da entrada de proposito — sao dois esforcos financeiros
   * diferentes: um a vista, na assinatura, e outro diluido no tempo.
   */
  durante: number | null
  /** Entrada + durante: todo o capital necessario ate receber as chaves. */
  ateAEntrega: number | null
  /** Chaves + financiamento: o que ainda se deve na entrega. */
  saldo: number | null

  /** Quanto do preco sai do bolso DURANTE a obra (sem a entrada), em %. */
  pctDurante: number | null
  /** Quanto do preco ja foi pago quando as chaves saem, em %. */
  pctAteAEntrega: number | null
  /** Quanto do preco vai para o banco, em %. */
  pctFinanciavel: number | null
  /** Quanto da entrada representa do preco, em %. */
  pctEntrada: number | null

  /** Onde o m² desta unidade cai dentro do empreendimento. */
  posicao: PosicaoNaFaixa
  /** A faixa de m² do empreendimento, para a frase da comparacao. */
  faixaM2: { min: number | null; max: number | null; media: number | null }
  /** Diferenca do m² desta unidade para a media do empreendimento, em %. */
  diferencaParaMedia: number | null
}

const numero = (valor: number | null | undefined): number | null =>
  valor !== null && valor !== undefined && Number.isFinite(valor) ? valor : null

const pct = (parte: number | null, total: number | null): number | null =>
  parte === null || total === null || total <= 0 ? null : (parte / total) * 100

/**
 * A tabela de venda que representa a unidade. A PRIMEIRA, de proposito: a
 * ordem e a de cadastro, e a primeira e a "tabela padrao" — as seguintes
 * costumam ser propostas de um cliente especifico.
 */
export function fluxoDaAnalise(unidade: Unidade): FluxoPagamento | null {
  return unidade.fluxos.length > 0 ? unidade.fluxos[0] : null
}

/** O m² medio do empreendimento e a faixa entre as unidades. */
export function faixaDeM2(
  unidades: Unidade[],
  baseM2: BaseM2 = BASE_M2_PADRAO,
): { min: number | null; max: number | null; media: number | null } {
  const valores = unidades.map((u) => valorM2Da(u, baseM2)).filter((v): v is number => v !== null)
  if (valores.length === 0) return { min: null, max: null, media: null }

  return {
    min: Math.min(...valores),
    max: Math.max(...valores),
    // Media SIMPLES aqui, e nao ponderada: a pergunta desta linha e "o m² desta
    // unidade esta acima ou abaixo do das OUTRAS", e cada unidade e uma opcao
    // de compra — nao um pedaco de um mesmo predio.
    media: valores.reduce((soma, v) => soma + v, 0) / valores.length,
  }
}

/**
 * Quanto o m² da unidade se afasta da media para ela deixar de ser "na media".
 *
 * 3% e o que separa diferenca de preco de arredondamento: abaixo disso, duas
 * unidades do mesmo predio praticamente custam o mesmo por metro.
 */
const TOLERANCIA_DA_MEDIA = 3

export function analisarUnidade(
  unidade: Unidade,
  unidadesDoEmpreendimento: Unidade[],
  baseM2: BaseM2 = BASE_M2_PADRAO,
): AnaliseDaUnidade {
  const valor = precoDaUnidade(unidade)
  const valorM2 = valorM2Da(unidade, baseM2)
  // A metragem que a analise mostra e a MESMA que dividiu o preco no m² —
  // exibir a total ao lado de um m² calculado pela privativa nao fecharia conta.
  const metragem = metragemDoM2(unidade.metragem_total, unidade.metragem, baseM2)

  const fluxo = fluxoDaAnalise(unidade)
  const detalhe = fluxo ? detalharFluxo(fluxo, valor) : null

  // A base da conta e o preco da unidade; sem tabela de venda nao ha o que
  // decompor, e os indicadores de pagamento ficam null em vez de virar zero
  // (zero diria "nao ha entrada", e o certo e "nao se sabe").
  const entrada = detalhe ? (detalhe.partes.find((p) => p.chave === 'entrada')?.valor ?? null) : null
  // `detalhe.durante` inclui a entrada; aqui ela sai, porque "durante a obra" é
  // o que o comprador paga MÊS A MÊS depois de assinar.
  const ateAEntrega = detalhe ? detalhe.durante : null
  const durante = ateAEntrega === null ? null : ateAEntrega - (entrada ?? 0)
  const saldo = detalhe ? detalhe.naEntrega : null
  const base = detalhe?.base ?? valor

  const faixaM2 = faixaDeM2(unidadesDoEmpreendimento, baseM2)
  const diferencaParaMedia =
    valorM2 !== null && faixaM2.media !== null && faixaM2.media > 0
      ? ((valorM2 - faixaM2.media) / faixaM2.media) * 100
      : null

  let posicao: PosicaoNaFaixa = 'sem-base'
  if (valorM2 === null || faixaM2.media === null) posicao = 'sem-base'
  else if (unidadesDoEmpreendimento.filter((u) => valorM2Da(u, baseM2) !== null).length < 2) posicao = 'unica'
  else if (diferencaParaMedia === null) posicao = 'sem-base'
  else if (diferencaParaMedia < -TOLERANCIA_DA_MEDIA) posicao = 'abaixo'
  else if (diferencaParaMedia > TOLERANCIA_DA_MEDIA) posicao = 'acima'
  else posicao = 'na-media'

  return {
    valor,
    valorM2,
    metragem,
    fluxo,
    entrada,
    durante,
    ateAEntrega,
    saldo,
    pctDurante: pct(durante, base),
    pctAteAEntrega: pct(ateAEntrega, base),
    pctFinanciavel: pct(saldo, base),
    pctEntrada: pct(entrada, base),
    posicao,
    faixaM2,
    diferencaParaMedia,
  }
}

/** "6,6" — pt-BR usa vírgula, e `toFixed` devolve ponto. */
const umaCasa = (valor: number) => valor.toFixed(1).replace('.', ',')

/**
 * Como o "durante a obra" e pago: "36 × R$ 2.500 · 3 reforcos de R$ 20.000".
 *
 * O TOTAL sozinho esconde o numero que o cliente pergunta primeiro — "quanto
 * fica por mes?" —, e duas tabelas com o mesmo total podem ter parcelas
 * completamente diferentes.
 */
export function textoDoParcelamento(
  analise: AnaliseDaUnidade,
  moeda: (valor: number) => string,
): string | null {
  const fluxo = analise.fluxo
  if (!fluxo) return null

  const partes: string[] = []

  const parcelas = numero(fluxo.parcelas)
  const parcela = numero(fluxo.parcela_valor)
  if (parcelas !== null && parcelas > 0 && parcela !== null && parcela > 0) {
    partes.push(`${parcelas} × ${moeda(parcela)}`)
  } else if (parcelas !== null && parcelas > 0) {
    partes.push(`${parcelas} parcelas`)
  }

  const reforcos = numero(fluxo.reforcos_qtd)
  const reforco = numero(fluxo.reforco_valor)
  if (reforcos !== null && reforcos > 0 && reforco !== null && reforco > 0) {
    partes.push(`${reforcos} ${reforcos === 1 ? 'reforço' : 'reforços'} de ${moeda(reforco)}`)
  }

  return partes.length > 0 ? partes.join(' · ') : null
}

/** A frase da posição, do jeito que se fala com o cliente. */
export function textoDaPosicao(analise: AnaliseDaUnidade): string {
  switch (analise.posicao) {
    case 'abaixo':
      return `Abaixo da média do empreendimento — ${umaCasa(Math.abs(analise.diferencaParaMedia as number))}% mais barato por m² que a média das outras unidades.`
    case 'acima':
      return `Acima da média do empreendimento — ${umaCasa(analise.diferencaParaMedia as number)}% mais caro por m² que a média das outras unidades.`
    case 'na-media':
      return 'Na média do empreendimento: o preço por m² acompanha o das outras unidades.'
    case 'unica':
      return 'Única unidade com preço cadastrada — não há com o que comparar dentro do empreendimento.'
    default:
      return 'Sem preço por m² para comparar. Informe o valor e a metragem da unidade.'
  }
}

/* ------------------------------------------------------------------ */
/* Nivel 2: o empreendimento                                           */
/* ------------------------------------------------------------------ */

/** Uma faixa de preco com quantas unidades caem nela. */
export interface FatiaDePreco {
  /** Limite inferior da faixa, em R$. */
  de: number
  ate: number
  unidades: number
}

export interface AnaliseDoEmpreendimento {
  unidades: number
  /** Quantas tem preco — as outras nao entram em media nenhuma. */
  comPreco: number
  disponiveis: number

  valorMin: number | null
  valorMax: number | null
  /** A media dos precos: o ticket do empreendimento. */
  ticketMedio: number | null
  /** O preco do meio — imune a uma cobertura que puxa a media sozinha. */
  medianaDeValor: number | null

  metragemMin: number | null
  metragemMax: number | null

  /** m² ponderado (soma dos precos ÷ soma das metragens). */
  m2Ponderado: number | null
  faixaM2: { min: number | null; max: number | null; media: number | null }

  /** A distribuicao de precos em faixas, para o histograma. */
  distribuicao: FatiaDePreco[]
  /**
   * Quanto o ticket medio se afasta da mediana, em %. Positivo alto = ha
   * unidade cara puxando a media (o "cuidado" que o corretor precisa saber
   * antes de dizer "aqui o ticket e X").
   */
  assimetria: number | null
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 === 0 ? (ordenados[meio - 1] + ordenados[meio]) / 2 : ordenados[meio]
}

/**
 * Divide os precos em ate 5 faixas de largura igual.
 *
 * Faixas iguais, e nao quantis: o que a barra tem de mostrar e ONDE os precos
 * se concentram — com quantis toda barra teria a mesma altura e o desenho nao
 * diria nada.
 */
export function distribuirPrecos(precos: number[], faixas = 5): FatiaDePreco[] {
  if (precos.length === 0) return []

  const min = Math.min(...precos)
  const max = Math.max(...precos)
  if (min === max) return [{ de: min, ate: max, unidades: precos.length }]

  const largura = (max - min) / faixas
  const fatias: FatiaDePreco[] = Array.from({ length: faixas }, (_, i) => ({
    de: min + largura * i,
    ate: min + largura * (i + 1),
    unidades: 0,
  }))

  for (const preco of precos) {
    // O ultimo intervalo e fechado dos dois lados; senao o mais caro ficaria de fora.
    const indice = Math.min(faixas - 1, Math.floor((preco - min) / largura))
    fatias[indice].unidades += 1
  }

  return fatias
}

export function analisarEmpreendimento(
  unidades: Unidade[],
  baseM2: BaseM2 = BASE_M2_PADRAO,
): AnaliseDoEmpreendimento {
  const precos = unidades.map(precoDaUnidade).filter((v): v is number => v !== null)
  const metragens = unidades
    .map((u) => numero(u.metragem) ?? numero(u.metragem_total))
    .filter((v): v is number => v !== null)

  let somaPreco = 0
  let somaMetragem = 0
  for (const unidade of unidades) {
    const preco = precoDaUnidade(unidade)
    const metragem = metragemDoM2(unidade.metragem_total, unidade.metragem, baseM2)
    if (preco !== null && metragem !== null && metragem > 0) {
      somaPreco += preco
      somaMetragem += metragem
    }
  }

  const ticketMedio = precos.length > 0 ? precos.reduce((s, v) => s + v, 0) / precos.length : null
  const medianaDeValor = mediana(precos)

  return {
    unidades: unidades.length,
    comPreco: precos.length,
    disponiveis: unidades.filter((u) => normalizarStatusUnidade(u.status) === 'disponivel').length,
    valorMin: precos.length > 0 ? Math.min(...precos) : null,
    valorMax: precos.length > 0 ? Math.max(...precos) : null,
    ticketMedio,
    medianaDeValor,
    metragemMin: metragens.length > 0 ? Math.min(...metragens) : null,
    metragemMax: metragens.length > 0 ? Math.max(...metragens) : null,
    m2Ponderado: somaMetragem > 0 ? somaPreco / somaMetragem : null,
    faixaM2: faixaDeM2(unidades, baseM2),
    distribuicao: distribuirPrecos(precos),
    assimetria:
      ticketMedio !== null && medianaDeValor !== null && medianaDeValor > 0
        ? ((ticketMedio - medianaDeValor) / medianaDeValor) * 100
        : null,
  }
}

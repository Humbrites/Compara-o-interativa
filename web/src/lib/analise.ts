import type { FluxoPagamento, Unidade } from '../types'
import { detalharFluxo } from './fluxos'
import { precoDaUnidade, valorM2Da } from './unidades'

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
export function faixaDeM2(unidades: Unidade[]): { min: number | null; max: number | null; media: number | null } {
  const valores = unidades.map(valorM2Da).filter((v): v is number => v !== null)
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

export function analisarUnidade(unidade: Unidade, unidadesDoEmpreendimento: Unidade[]): AnaliseDaUnidade {
  const valor = precoDaUnidade(unidade)
  const valorM2 = valorM2Da(unidade)
  const metragem = numero(unidade.metragem_total) ?? numero(unidade.metragem)

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

  const faixaM2 = faixaDeM2(unidadesDoEmpreendimento)
  const diferencaParaMedia =
    valorM2 !== null && faixaM2.media !== null && faixaM2.media > 0
      ? ((valorM2 - faixaM2.media) / faixaM2.media) * 100
      : null

  let posicao: PosicaoNaFaixa = 'sem-base'
  if (valorM2 === null || faixaM2.media === null) posicao = 'sem-base'
  else if (unidadesDoEmpreendimento.filter((u) => valorM2Da(u) !== null).length < 2) posicao = 'unica'
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

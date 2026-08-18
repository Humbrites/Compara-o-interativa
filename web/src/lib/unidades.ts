import type { FluxoPagamento, Unidade } from '../types'
import { normalizarStatusUnidade } from './opcoes'

/**
 * Como a unidade e chamada na tela. Cai para o numero, depois para a torre e,
 * em ultimo caso, para "Unidade" — nenhum campo dela e obrigatorio.
 */
export function rotuloUnidade(unidade: Unidade, indice?: number): string {
  const identificacao = unidade.identificacao?.trim()
  if (identificacao) return identificacao

  const numero = unidade.numero?.trim()
  if (numero) return `Unidade ${numero}`

  const torre = unidade.torre?.trim()
  if (torre) return torre

  return indice === undefined ? 'Unidade' : `Unidade ${indice + 1}`
}

/** Onde ela fica: "Torre 2 · 12º andar · nº 1204". */
export function localizacaoUnidade(unidade: Unidade): string {
  const partes: string[] = []
  if (unidade.torre?.trim()) partes.push(unidade.torre.trim())
  if (unidade.andar !== null && Number.isFinite(unidade.andar)) partes.push(`${unidade.andar}º andar`)
  if (unidade.numero?.trim()) partes.push(`nº ${unidade.numero.trim()}`)
  return partes.join(' · ')
}

/** Para onde ela esta voltada: "Norte · Frente". */
export function posicaoUnidade(unidade: Unidade): string {
  return [unidade.posicao_solar, unidade.face].filter((p) => p && p.trim()).join(' · ')
}

/**
 * Qual metragem divide o preco para dar o valor do m².
 *
 * 'privativa' = a area que o comprador usa (o padrao); 'total' = a area
 * total/global anunciada. A escolha e da CONTA (`contas.base_m2`) — as duas
 * leituras existem no mercado, e misturar as duas na mesma base faria um
 * predio parecer mais barato que o outro so pela metodologia.
 *
 * A area COMUM nao entra em nenhuma das duas: ela nao e area da unidade.
 */
export type BaseM2 = 'privativa' | 'total'

export const BASE_M2_PADRAO: BaseM2 = 'privativa'

/** Como a base aparece na tela, quando vale explicar de onde saiu o numero. */
export const ROTULO_BASE_M2: Record<BaseM2, string> = {
  privativa: 'área privativa',
  total: 'área total',
}

/**
 * Valor do m²: preco dividido pela metragem da base escolhida — com a outra
 * metragem como reserva, porque unidade com uma so nao pode ficar sem m².
 *
 * A mesma regra vale no formulario (que preenche o campo enquanto se digita) e
 * aqui, para uma unidade gravada antes disso mostrar o mesmo numero.
 */
export function calcularValorM2(
  valor: number | null,
  metragemTotal: number | null,
  metragemPrivativa: number | null = null,
  base: BaseM2 = BASE_M2_PADRAO,
): number | null {
  if (valor === null || !Number.isFinite(valor) || valor <= 0) return null

  const ordem = base === 'total' ? [metragemTotal, metragemPrivativa] : [metragemPrivativa, metragemTotal]
  const metragem = ordem.find((m): m is number => m !== null && Number.isFinite(m) && m > 0)
  return metragem === undefined ? null : valor / metragem
}

/** A metragem que a conta do m² usou — a mesma ordem de `calcularValorM2`. */
export function metragemDoM2(
  metragemTotal: number | null,
  metragemPrivativa: number | null,
  base: BaseM2 = BASE_M2_PADRAO,
): number | null {
  const ordem = base === 'total' ? [metragemTotal, metragemPrivativa] : [metragemPrivativa, metragemTotal]
  return ordem.find((m): m is number => m !== null && Number.isFinite(m) && m > 0) ?? null
}

/**
 * O valor do imovel que ficou gravado na tabela de pagamento da unidade — e o
 * que a calculadora do CUB guarda ao gerar o fluxo. Serve de preco quando a
 * unidade em si nao tem valor digitado.
 */
export function valorNoFluxo(fluxos: FluxoPagamento[] | undefined): number | null {
  const comValor = (fluxos ?? []).find(
    (f) => f.cub_valor_imovel !== null && Number.isFinite(f.cub_valor_imovel) && f.cub_valor_imovel > 0,
  )
  return comValor?.cub_valor_imovel ?? null
}

/**
 * O preco que vale para a unidade: o valor dela e, na falta, o valor do imovel
 * guardado na tabela de pagamento. Uma unidade cadastrada so com a tabela tem
 * preco — quem le nao precisa saber de onde ele saiu.
 */
export function precoDaUnidade(unidade: Unidade): number | null {
  return unidade.valor ?? valorNoFluxo(unidade.fluxos)
}

/**
 * Valor do m² da unidade: o informado a mao vence; sem ele, deriva do preco
 * (o da unidade ou o da tabela de pagamento) pela metragem.
 */
export function valorM2Da(unidade: Unidade, base: BaseM2 = BASE_M2_PADRAO): number | null {
  if (unidade.valor_m2 !== null && Number.isFinite(unidade.valor_m2)) return unidade.valor_m2

  return calcularValorM2(precoDaUnidade(unidade), unidade.metragem_total, unidade.metragem, base)
}

interface Faixa {
  min: number | null
  max: number | null
}

function faixa(valores: (number | null)[]): Faixa {
  const numeros = valores.filter((v): v is number => v !== null && Number.isFinite(v))
  if (numeros.length === 0) return { min: null, max: null }
  return { min: Math.min(...numeros), max: Math.max(...numeros) }
}

/** Uma faixa tirada das unidades, com o aviso de QUAIS unidades entraram nela. */
export interface FaixaDeUnidades extends Faixa {
  /** true = so as unidades DISPONIVEIS; false = todas (ou nenhuma tinha o dado). */
  soDisponiveis: boolean
}

/**
 * A faixa de um numero entre as unidades, preferindo as que estao A VENDA.
 *
 * Quem pergunta "a partir de quanto" quer o que ainda da para comprar: a
 * unidade mais barata do predio pode ter sido vendida no lancamento, e anunciar
 * o preco dela como piso e prometer o que nao existe.
 *
 * Sem nenhuma disponivel com o dado (base sem status preenchido, predio
 * esgotado), a faixa sai de TODAS as unidades e marca isso — a tela precisa
 * dizer a diferenca em vez de fingir que o numero e o mesmo.
 */
export function faixaEntreUnidades(
  unidades: Unidade[],
  valorDe: (unidade: Unidade) => number | null,
): FaixaDeUnidades {
  const aVenda = unidades.filter((u) => normalizarStatusUnidade(u.status) === 'disponivel')
  const daVenda = faixa(aVenda.map(valorDe))
  if (daVenda.min !== null) return { ...daVenda, soDisponiveis: true }

  return { ...faixa(unidades.map(valorDe)), soDisponiveis: false }
}

/**
 * A faixa de valor do m² do conjunto: de quanto sai o metro mais barato ao mais
 * caro, calculado unidade a unidade pela base da conta.
 *
 * E o numero que o comparativo mostra no lugar de uma media unica: a media
 * esconde que o mesmo predio tem studio a R$ 12 mil/m² e cobertura a R$ 9 mil/m².
 */
export function faixaM2(unidades: Unidade[], base: BaseM2 = BASE_M2_PADRAO): FaixaDeUnidades {
  return faixaEntreUnidades(unidades, (u) => valorM2Da(u, base))
}

/**
 * Resumo do conjunto de unidades — e o que o painel mostra no lugar dos
 * campos gerais quando o empreendimento ja tem unidades cadastradas.
 */
export function resumoUnidades(unidades: Unidade[], base: BaseM2 = BASE_M2_PADRAO) {
  return {
    total: unidades.length,
    // A base tem os dois formatos de status (o digitado no cadastro e o que a
    // importacao grava): quem conta passa pela normalizacao, nunca pelo texto cru.
    disponiveis: unidades.filter((u) => normalizarStatusUnidade(u.status) === 'disponivel').length,
    metragem: faixa(unidades.map((u) => u.metragem)),
    valor: faixa(unidades.map(precoDaUnidade)),
    valorM2: faixa(unidades.map((u) => valorM2Da(u, base))),
    dormitorios: faixa(unidades.map((u) => u.dormitorios)),
    vagas: faixa(unidades.map((u) => u.vagas)),
  }
}


/**
 * O valor medio do m² do empreendimento: soma dos precos ÷ soma das metragens.
 *
 * ⚠️ Ponderado, e nao a media dos m² de cada unidade: um studio de 30 m² nao
 * pode pesar o mesmo que uma cobertura de 200 m² na hora de dizer quanto custa
 * o metro ali. E a MESMA conta que o servidor grava em `empreendimentos.valor_m2`
 * (`api/src/resumo.js`) — duas contas diferentes dariam dois numeros para o
 * mesmo predio.
 */
export function valorM2MedioDe(unidades: Unidade[], base: BaseM2 = BASE_M2_PADRAO): number | null {
  let somaPreco = 0
  let somaMetragem = 0

  for (const unidade of unidades) {
    const preco = precoDaUnidade(unidade)
    const metragem = metragemDoM2(unidade.metragem_total, unidade.metragem, base)
    if (preco !== null && metragem !== null && metragem > 0) {
      somaPreco += preco
      somaMetragem += metragem
    }
  }

  return somaMetragem > 0 ? somaPreco / somaMetragem : null
}

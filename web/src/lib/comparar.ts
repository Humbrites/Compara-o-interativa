import type { Empreendimento, FluxoPagamento, Unidade } from '../types'
import { fmtArea, fmtEntrega, fmtInteiro, fmtMoeda, fmtPct, fmtTexto, TRACO } from './format'
import { normalizarStatusUnidade, ordemDaEntrega, pesoDoStatus } from './opcoes'
import {
  BASE_M2_PADRAO,
  faixaEntreUnidades,
  faixaM2,
  localizacaoUnidade,
  precoDaUnidade,
  ROTULO_BASE_M2,
  valorM2Da,
  type BaseM2,
  type FaixaDeUnidades,
} from './unidades'

/** Em qual direcao esta o "melhor" de um indicador. */
export type Direcao = 'maior' | 'menor'

export type Vencedor = 'a' | 'b' | 'empate' | null

export interface LinhaComparativo {
  chave: string
  rotulo: string
  textoA: string
  textoB: string
  vencedor: Vencedor
  /** Explica por que um lado ganhou — vira o title/tooltip da linha. */
  criterio: string
}

interface Definicao<T> {
  chave: string
  rotulo: string
  direcao: Direcao
  /** Valor numerico usado na disputa (null = nao da para comparar). */
  valor: (item: T) => number | null
  /** Como o valor aparece na tela. */
  texto: (item: T) => string
  criterio: string
  /**
   * Complemento do criterio que so existe conforme os dados — e o que explica
   * as marcas que aparecem coladas no valor ("todas as unidades", "dados
   * gerais"). Sem ela, a marca seria um enfeite sem significado na tela.
   */
  nota?: (a: T, b: T) => string | null
}

/**
 * Decide o vencedor de uma linha. So ha disputa quando os DOIS lados tem
 * numero: se um esta em branco, ninguem "ganha" — destacar seria mentir.
 */
function decidir(a: number | null, b: number | null, direcao: Direcao): Vencedor {
  if (a === null || b === null) return null
  if (a === b) return 'empate'
  const aVence = direcao === 'maior' ? a > b : a < b
  return aVence ? 'a' : 'b'
}

function montar<T>(defs: Definicao<T>[], a: T, b: T): LinhaComparativo[] {
  return defs.map((def) => {
    const nota = def.nota?.(a, b) ?? null
    return {
      chave: def.chave,
      rotulo: def.rotulo,
      textoA: def.texto(a),
      textoB: def.texto(b),
      vencedor: decidir(def.valor(a), def.valor(b), def.direcao),
      criterio: nota ? `${def.criterio} · ${nota}` : def.criterio,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Empreendimento x Empreendimento                                     */
/* ------------------------------------------------------------------ */

/** Linha informativa: mostra o texto dos dois lados sem eleger vencedor. */
const SEM_DISPUTA = () => null

/**
 * Um lado do comparativo geral: o cadastro do empreendimento e as unidades
 * dele.
 *
 * As unidades entram por parametro em vez de sairem de `empreendimento.unidades`
 * porque este modulo e puro e nao decide de onde vem o dado — quem chama e que
 * sabe se ja tem a base inteira em memoria ou se acabou de buscar o detalhe.
 */
export interface LadoDoEmpreendimento {
  empreendimento: Empreendimento
  unidades: Unidade[]
}

/**
 * De onde saiu o numero de uma linha — e o que a marca ao lado do valor diz.
 *
 * 'disponiveis' e o caso normal (o que esta a venda). Os outros dois avisam que
 * a leitura mudou: sem eles, o mesmo rotulo mostraria coisas diferentes nos
 * dois lados sem ninguem perceber.
 */
type Origem = 'disponiveis' | 'todas' | 'cadastro'

const MARCA_DA_ORIGEM: Record<Origem, string> = {
  disponiveis: '',
  todas: ' · todas as unidades',
  cadastro: ' · dados gerais',
}

/** Um numero (ou faixa) do empreendimento junto com a origem dele. */
interface Indicador {
  min: number | null
  max: number | null
  origem: Origem
}

/** O que as linhas do comparativo geral consultam de cada lado. */
interface IndicadoresDoEmpreendimento {
  e: Empreendimento
  /** Valor do m², unidade a unidade, na base da conta. */
  m2: Indicador
  /** Area PRIVATIVA — a total nao entra: uma cobertura de 300 m² distorceria o predio inteiro. */
  metragem: Indicador
  /** O ticket: do apartamento mais barato ao mais caro. */
  preco: Indicador
  /** Quantas unidades estao a venda; null quando nenhuma informa o status. */
  disponiveis: number | null
}

/**
 * A faixa das unidades quando ela tem numero; senao, o campo geral gravado no
 * cadastro — marcado, porque um numero digitado a mao no cadastro nao e a mesma
 * coisa que a leitura das unidades.
 */
function comOrigem(faixa: FaixaDeUnidades, doCadastro: { min: number | null; max: number | null }): Indicador {
  if (faixa.min !== null || faixa.max !== null) {
    return { min: faixa.min, max: faixa.max, origem: faixa.soDisponiveis ? 'disponiveis' : 'todas' }
  }
  return { ...doCadastro, origem: 'cadastro' }
}

function indicadoresDe(lado: LadoDoEmpreendimento, base: BaseM2 = BASE_M2_PADRAO): IndicadoresDoEmpreendimento {
  const { empreendimento: e, unidades } = lado

  // Sem NENHUM status reconhecivel na base, contar "0 disponiveis" seria dizer
  // que o predio esgotou — quando o que houve foi ninguem preencher o campo.
  const comStatus = unidades.filter((u) => normalizarStatusUnidade(u.status) !== null)
  const disponiveis =
    comStatus.length === 0
      ? null
      : unidades.filter((u) => normalizarStatusUnidade(u.status) === 'disponivel').length

  return {
    e,
    m2: comOrigem(faixaM2(unidades, base), { min: e.valor_m2, max: e.valor_m2 }),
    // A privativa vem do campo `metragem`, sem cair para a total: comparar a
    // area util de um predio com a area global do outro daria vantagem a quem
    // anuncia pelo numero maior.
    metragem: comOrigem(faixaEntreUnidades(unidades, (u) => u.metragem), {
      min: e.metragem_min,
      max: e.metragem_max,
    }),
    // Preco nao tem campo geral: sem unidade cadastrada nao ha ticket nenhum.
    preco: comOrigem(faixaEntreUnidades(unidades, precoDaUnidade), { min: null, max: null }),
    disponiveis,
  }
}

/** O valor com a marca da origem; sem valor, so o traco (marca em branco nao informa nada). */
function comMarca(texto: string, valor: number | null, origem: Origem): string {
  return valor === null ? texto : `${texto}${MARCA_DA_ORIGEM[origem]}`
}

/** Explica as marcas que estao na tela — e so as que estao. */
function notaDaOrigem(
  quem: (item: IndicadoresDoEmpreendimento) => Indicador,
  ehMinimo: boolean,
): (a: IndicadoresDoEmpreendimento, b: IndicadoresDoEmpreendimento) => string | null {
  return (a, b) => {
    const origens = [a, b]
      .map(quem)
      .filter((indicador) => (ehMinimo ? indicador.min : indicador.max) !== null)
      .map((indicador) => indicador.origem)

    const partes: string[] = []
    if (origens.includes('todas')) {
      partes.push('"todas as unidades": nenhuma unidade disponível tinha esse dado')
    }
    if (origens.includes('cadastro')) {
      partes.push('"dados gerais": o empreendimento não tem unidades cadastradas, vale o que está no cadastro')
    }
    return partes.length > 0 ? partes.join(' · ') : null
  }
}

/**
 * Os indicadores do empreendimento — todos lidos das UNIDADES, no mesmo nivel
 * dos dois lados.
 *
 * O comparativo mostrava uma media unica de m² e a metragem MAXIMA do predio:
 * a media escondia que o studio custa 30% mais por metro que a cobertura, e a
 * metragem maxima elegia vencedor pela unidade mais cara do predio, que nem
 * sempre esta a venda. No lugar delas vem a FAIXA do que da para comprar.
 */
function defsDoEmpreendimento(base: BaseM2): Definicao<IndicadoresDoEmpreendimento>[] {
  const daBase = `calculado pela ${ROTULO_BASE_M2[base]}, unidade a unidade, entre as disponíveis`

  return [
    {
      chave: 'valor_m2_min',
      rotulo: 'Valor do m² a partir de',
      direcao: 'menor',
      valor: (i) => i.m2.min,
      texto: (i) => comMarca(fmtMoeda(i.m2.min, true), i.m2.min, i.m2.origem),
      criterio: `Menor valor por m² é melhor — ${daBase}`,
      nota: notaDaOrigem((i) => i.m2, true),
    },
    {
      chave: 'valor_m2_max',
      rotulo: 'Valor do m² máximo',
      direcao: 'menor',
      valor: (i) => i.m2.max,
      texto: (i) => comMarca(fmtMoeda(i.m2.max, true), i.m2.max, i.m2.origem),
      criterio: `Teto do metro quadrado: menor é melhor — ${daBase}`,
      nota: notaDaOrigem((i) => i.m2, false),
    },
    {
      chave: 'preco_min',
      rotulo: 'Preço a partir de',
      direcao: 'menor',
      valor: (i) => i.preco.min,
      texto: (i) => comMarca(fmtMoeda(i.preco.min), i.preco.min, i.preco.origem),
      criterio: 'Ticket de entrada: a unidade disponível mais barata',
      nota: notaDaOrigem((i) => i.preco, true),
    },
    {
      chave: 'preco_max',
      rotulo: 'Preço máximo',
      direcao: 'maior',
      // Sem disputa: preco maximo alto nao e vantagem nem defeito — diz o
      // alcance do produto, e o que decide isso e o cliente que se tem na mao.
      valor: SEM_DISPUTA,
      texto: (i) => comMarca(fmtMoeda(i.preco.max), i.preco.max, i.preco.origem),
      criterio: 'A unidade disponível mais cara — informativo, não entra na disputa',
      nota: notaDaOrigem((i) => i.preco, false),
    },
    {
      chave: 'metragem_min',
      rotulo: 'Metragem privativa mínima',
      direcao: 'maior',
      valor: (i) => i.metragem.min,
      texto: (i) => comMarca(fmtArea(i.metragem.min), i.metragem.min, i.metragem.origem),
      criterio: 'Maior área privativa é melhor — a menor planta disponível de cada lado',
      nota: notaDaOrigem((i) => i.metragem, true),
    },
    {
      chave: 'metragem_max',
      rotulo: 'Metragem privativa máxima',
      direcao: 'maior',
      valor: (i) => i.metragem.max,
      texto: (i) => comMarca(fmtArea(i.metragem.max), i.metragem.max, i.metragem.origem),
      criterio: 'Maior área privativa é melhor — a maior planta disponível de cada lado',
      nota: notaDaOrigem((i) => i.metragem, false),
    },
    {
      chave: 'disponiveis',
      rotulo: 'Unidades disponíveis',
      direcao: 'maior',
      valor: (i) => i.disponiveis,
      texto: (i) => fmtInteiro(i.disponiveis),
      criterio: 'Mais unidades à venda = mais opção de escolha e de negociação',
    },
    {
      chave: 'torres',
      rotulo: 'Torres',
      direcao: 'maior',
      valor: SEM_DISPUTA,
      texto: (i) => fmtInteiro(i.e.torres),
      criterio: 'Porte do empreendimento — informativo, não entra na disputa',
    },
    {
      chave: 'dormitorios',
      rotulo: 'Dormitórios',
      direcao: 'maior',
      valor: (i) => i.e.dormitorios,
      texto: (i) => fmtInteiro(i.e.dormitorios),
      criterio: 'Mais dormitórios é melhor',
    },
    {
      chave: 'suites',
      rotulo: 'Suítes',
      direcao: 'maior',
      valor: (i) => i.e.suites,
      texto: (i) => fmtInteiro(i.e.suites),
      criterio: 'Mais suítes é melhor',
    },
    {
      chave: 'banheiros',
      rotulo: 'Banheiros',
      direcao: 'maior',
      valor: (i) => i.e.banheiros,
      texto: (i) => fmtInteiro(i.e.banheiros),
      criterio: 'Mais banheiros é melhor',
    },
    {
      chave: 'vagas',
      rotulo: 'Vagas',
      direcao: 'maior',
      valor: (i) => i.e.vagas,
      texto: (i) => fmtInteiro(i.e.vagas),
      criterio: 'Mais vagas é melhor',
    },
    {
      chave: 'status_obra',
      rotulo: 'Status da obra',
      direcao: 'maior',
      valor: (i) => pesoDoStatus(i.e.status_obra),
      texto: (i) => fmtTexto(i.e.status_obra),
      criterio: 'Obra mais avançada é melhor',
    },
    {
      chave: 'entrega',
      rotulo: 'Entrega prevista',
      direcao: 'menor',
      valor: (i) => ordemDaEntrega(i.e.entrega),
      texto: (i) => fmtEntrega(i.e.entrega),
      criterio: 'Entrega mais próxima é melhor',
    },
  ]
}

export function compararEmpreendimentos(
  a: LadoDoEmpreendimento,
  b: LadoDoEmpreendimento,
  base: BaseM2 = BASE_M2_PADRAO,
): LinhaComparativo[] {
  return montar(defsDoEmpreendimento(base), indicadoresDe(a, base), indicadoresDe(b, base))
}

/* ------------------------------------------------------------------ */
/* Unidade x Unidade                                                   */
/* ------------------------------------------------------------------ */

/**
 * Unidade contra unidade: cada numero sai DA PROPRIA unidade, nunca da media do
 * predio dela — comparar um apartamento especifico com a media de outro
 * empreendimento faria o vencedor depender de quem tem a cobertura mais cara.
 */
function defsDaUnidade(base: BaseM2): Definicao<Unidade | null>[] {
  return [
    {
      chave: 'u_valor',
      rotulo: 'Valor da unidade',
      direcao: 'menor',
      // O preco pode estar na unidade ou na tabela de venda dela — quem le nao
      // precisa saber de onde saiu, mas as duas telas tem de dizer o mesmo numero.
      valor: (u) => (u ? precoDaUnidade(u) : null),
      texto: (u) => fmtMoeda(u ? precoDaUnidade(u) : null),
      criterio: 'Menor preço é melhor',
    },
    {
      chave: 'u_valor_m2',
      rotulo: 'Valor do m²',
      direcao: 'menor',
      valor: (u) => (u ? valorM2Da(u, base) : null),
      texto: (u) => fmtMoeda(u ? valorM2Da(u, base) : null, true),
      criterio: `Menor valor por m² é melhor — calculado pela ${ROTULO_BASE_M2[base]} de cada unidade`,
    },
    {
      chave: 'u_metragem',
      rotulo: 'Metragem privativa',
      direcao: 'maior',
      valor: (u) => u?.metragem ?? null,
      texto: (u) => fmtArea(u?.metragem ?? null),
      criterio: 'Maior área privativa é melhor',
    },
    {
      chave: 'u_metragem_total',
      rotulo: 'Metragem total',
      direcao: 'maior',
      valor: (u) => u?.metragem_total ?? null,
      texto: (u) => fmtArea(u?.metragem_total ?? null),
      criterio: 'Maior área total é melhor',
    },
    {
      chave: 'u_dormitorios',
      rotulo: 'Dormitórios',
      direcao: 'maior',
      valor: (u) => u?.dormitorios ?? null,
      texto: (u) => fmtInteiro(u?.dormitorios ?? null),
      criterio: 'Mais dormitórios é melhor',
    },
    {
      chave: 'u_suites',
      rotulo: 'Suítes',
      direcao: 'maior',
      valor: (u) => u?.suites ?? null,
      texto: (u) => fmtInteiro(u?.suites ?? null),
      criterio: 'Mais suítes é melhor',
    },
    {
      chave: 'u_banheiros',
      rotulo: 'Banheiros',
      direcao: 'maior',
      valor: (u) => u?.banheiros ?? null,
      texto: (u) => fmtInteiro(u?.banheiros ?? null),
      criterio: 'Mais banheiros é melhor',
    },
    {
      chave: 'u_vagas',
      rotulo: 'Vagas',
      direcao: 'maior',
      valor: (u) => u?.vagas ?? null,
      texto: (u) => fmtInteiro(u?.vagas ?? null),
      criterio: 'Mais vagas é melhor',
    },
    {
      chave: 'u_andar',
      rotulo: 'Andar',
      direcao: 'maior',
      valor: (u) => u?.andar ?? null,
      texto: (u) => fmtInteiro(u?.andar ?? null),
      criterio: 'Andar mais alto costuma valorizar',
    },
    // Posicao, face e status sao gosto do cliente, nao "melhor" — sem destaque.
    {
      chave: 'u_posicao',
      rotulo: 'Posição solar',
      direcao: 'maior',
      valor: SEM_DISPUTA,
      texto: (u) => fmtTexto(u?.posicao_solar ?? null),
      criterio: 'Depende da preferência do cliente',
    },
    {
      chave: 'u_face',
      rotulo: 'Face',
      direcao: 'maior',
      valor: SEM_DISPUTA,
      texto: (u) => fmtTexto(u?.face ?? null),
      criterio: 'Depende da preferência do cliente',
    },
    {
      chave: 'u_torre',
      rotulo: 'Torre / andar / nº',
      direcao: 'maior',
      valor: SEM_DISPUTA,
      texto: (u) => (u ? localizacaoUnidade(u) || TRACO : TRACO),
      criterio: 'Localização da unidade no empreendimento',
    },
    {
      chave: 'u_status',
      rotulo: 'Situação',
      direcao: 'maior',
      valor: SEM_DISPUTA,
      texto: (u) => fmtTexto(u?.status ?? null),
      criterio: 'Disponível, reservada ou vendida',
    },
  ]
}

export function compararUnidades(
  a: Unidade | null,
  b: Unidade | null,
  base: BaseM2 = BASE_M2_PADRAO,
): LinhaComparativo[] {
  return montar(defsDaUnidade(base), a, b)
}

/* ------------------------------------------------------------------ */
/* Fluxo de pagamento x Fluxo de pagamento                             */
/* ------------------------------------------------------------------ */

/** Entrada e parcelamento aceitam % e R$ juntos: "20% (R$ 60.000)". */
function pctComValor(pct: number | null, valor: number | null): string {
  const temPct = pct !== null && Number.isFinite(pct)
  const temValor = valor !== null && Number.isFinite(valor)
  if (temPct && temValor) return `${fmtPct(pct)} (${fmtMoeda(valor)})`
  if (temPct) return fmtPct(pct)
  if (temValor) return fmtMoeda(valor)
  return TRACO
}

const DEFS_FLUXO: Definicao<FluxoPagamento | null>[] = [
  {
    chave: 'entrada',
    rotulo: 'Entrada',
    direcao: 'menor',
    valor: (f) => f?.entrada_pct ?? null,
    texto: (f) => (f ? pctComValor(f.entrada_pct, f.entrada_valor) : TRACO),
    criterio: 'Entrada menor exige menos caixa',
  },
  {
    chave: 'parcelamento',
    rotulo: 'Parcelamento',
    direcao: 'maior',
    valor: (f) => f?.parcelas ?? null,
    texto: (f) => {
      if (!f) return TRACO
      const qtd = f.parcelas !== null && Number.isFinite(f.parcelas) ? `${f.parcelas}x` : null
      const valor = f.parcela_valor !== null && Number.isFinite(f.parcela_valor) ? fmtMoeda(f.parcela_valor) : null
      if (qtd && valor) return `${qtd} de ${valor}`
      return qtd ?? valor ?? TRACO
    },
    criterio: 'Mais parcelas dilui o desembolso',
  },
  {
    chave: 'reforcos',
    rotulo: 'Reforços',
    direcao: 'menor',
    valor: (f) => f?.reforcos_qtd ?? null,
    texto: (f) => {
      if (!f) return TRACO
      const qtd = f.reforcos_qtd !== null && Number.isFinite(f.reforcos_qtd) ? String(f.reforcos_qtd) : null
      const valor = f.reforco_valor !== null && Number.isFinite(f.reforco_valor) ? fmtMoeda(f.reforco_valor) : null
      if (qtd && valor) return `${qtd} de ${valor}`
      return qtd ?? valor ?? TRACO
    },
    criterio: 'Menos reforços é melhor para o comprador',
  },
  {
    chave: 'chaves',
    rotulo: 'Chaves',
    direcao: 'menor',
    valor: (f) => f?.chaves_pct ?? null,
    texto: (f) => (f ? fmtPct(f.chaves_pct) : TRACO),
    criterio: 'Parcela nas chaves menor é melhor',
  },
  {
    chave: 'financiamento',
    rotulo: 'Financiamento',
    direcao: 'maior',
    valor: (f) => f?.financiamento_pct ?? null,
    texto: (f) => (f ? fmtPct(f.financiamento_pct) : TRACO),
    criterio: 'Mais financiamento reduz o desembolso direto',
  },
]

export function compararFluxos(a: FluxoPagamento | null, b: FluxoPagamento | null): LinhaComparativo[] {
  return montar(DEFS_FLUXO, a, b)
}

/** Descricao livre e observacoes viram um bloco de texto abaixo da tabela. */
export function textosDoFluxo(fluxo: FluxoPagamento | null) {
  return {
    descricao: fluxo?.descricao?.trim() || '',
    observacoes: fluxo?.observacoes?.trim() || '',
  }
}

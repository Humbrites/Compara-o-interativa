export interface FluxoPagamento {
  id: number
  empreendimento_id: number
  /** null = tabela geral do empreendimento; preenchido = fluxo daquela unidade. */
  unidade_id: number | null
  nome: string | null
  entrada_pct: number | null
  entrada_valor: number | null
  parcelas: number | null
  parcela_valor: number | null
  reforcos_qtd: number | null
  reforco_valor: number | null
  chaves_pct: number | null
  financiamento_pct: number | null
  descricao: string | null
  observacoes: string | null
  /** Parametros da simulacao do CUB que gerou o fluxo (null se veio da mao). */
  cub_percentual: number | null
  cub_meses: number | null
  cub_valor_imovel: number | null
  cub_parcela_inicial: number | null
  cub_entrada: number | null
  criado_em: string
  atualizado_em: string
}

/**
 * Unidade de um empreendimento: a planta/apartamento que o corretor vende.
 * O que muda de uma para outra (metragem, dormitorios, vagas, posicao e
 * preco) mora aqui; o empreendimento guarda os dados gerais.
 */
export interface Unidade {
  id: number
  empreendimento_id: number
  identificacao: string | null
  torre: string | null
  andar: number | null
  numero: string | null
  metragem: number | null
  metragem_total: number | null
  dormitorios: number | null
  suites: number | null
  banheiros: number | null
  vagas: number | null
  posicao_solar: string | null
  face: string | null
  valor: number | null
  valor_m2: number | null
  status: string | null
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  fluxos: FluxoPagamento[]
}

export type UnidadeInput = Partial<
  Record<keyof Omit<Unidade, 'id' | 'criado_em' | 'atualizado_em' | 'fluxos'>, string | number | null>
>

/** Foto enviada pelo usuario; o arquivo mora na API e chega aqui como URL. */
export interface ImagemEmpreendimento {
  id: number
  empreendimento_id: number
  arquivo: string
  nome_original: string | null
  tamanho: number | null
  /** Posicao na galeria — a de ordem 0 e a capa. */
  ordem: number
  criado_em: string
  url: string
}

export interface Empreendimento {
  id: number
  nome: string
  construtora: string | null
  cidade: string | null
  bairro: string | null
  endereco: string | null
  latitude: number | null
  longitude: number | null
  valor_m2: number | null
  metragem_min: number | null
  metragem_max: number | null
  dormitorios: number | null
  suites: number | null
  banheiros: number | null
  vagas: number | null
  status_obra: string | null
  entrega: string | null
  tipo: string | null
  imagem_url: string | null
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  /** Fluxos gerais: os que valem para o empreendimento todo, sem unidade. */
  fluxos: FluxoPagamento[]
  unidades: Unidade[]
  imagens: ImagemEmpreendimento[]
}

/** Payload de escrita: tudo opcional menos o nome, e numeros aceitam string vinda do input. */
export type EmpreendimentoInput = Partial<Record<keyof Omit<Empreendimento, 'id' | 'criado_em' | 'atualizado_em' | 'fluxos' | 'unidades' | 'imagens'>, string | number | null>> & {
  nome: string
}

export type FluxoInput = Partial<Record<keyof Omit<FluxoPagamento, 'id' | 'criado_em' | 'atualizado_em'>, string | number | null>>

export interface Filtros {
  busca: string
  cidade: string
  construtora: string
  tipo: string
  status: string
  dormitorios: string
  metragemMin: string
  metragemMax: string
  valorMin: string
  valorMax: string
}

export const FILTROS_VAZIOS: Filtros = {
  busca: '',
  cidade: '',
  construtora: '',
  tipo: '',
  status: '',
  dormitorios: '',
  metragemMin: '',
  metragemMax: '',
  valorMin: '',
  valorMax: '',
}

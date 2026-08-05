export interface FluxoPagamento {
  id: number
  empreendimento_id: number
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
  criado_em: string
  atualizado_em: string
}

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
  fluxos: FluxoPagamento[]
  imagens: ImagemEmpreendimento[]
}

/** Payload de escrita: tudo opcional menos o nome, e numeros aceitam string vinda do input. */
export type EmpreendimentoInput = Partial<Record<keyof Omit<Empreendimento, 'id' | 'criado_em' | 'atualizado_em' | 'fluxos' | 'imagens'>, string | number | null>> & {
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

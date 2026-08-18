/**
 * A tabela que a construtora entregou × a proposta que o corretor montou em
 * cima dela. Fluxo cadastrado antes desta separacao fica sem tipo — ele pode
 * ser um ou outro, e classificar no chute mentiria no comparativo.
 */
export type TipoFluxo = 'construtora' | 'personalizado'

export interface FluxoPagamento {
  id: number
  empreendimento_id: number
  /** null = tabela geral do empreendimento; preenchido = fluxo daquela unidade. */
  unidade_id: number | null
  /** null = fluxo antigo, sem classificacao. */
  tipo: TipoFluxo | null
  /** A tabela de onde a proposta personalizada saiu (null = nao veio de outra). */
  fluxo_base_id: number | null
  nome: string | null
  entrada_pct: number | null
  entrada_valor: number | null
  /** Entrada em N vezes (null = à vista, e nunca 0). */
  entrada_parcelas: number | null
  parcelas: number | null
  parcela_valor: number | null
  reforcos_qtd: number | null
  reforco_valor: number | null
  chaves_pct: number | null
  financiamento_pct: number | null
  /** Saldo do banco em R$: o que sobra depois de entrada, parcelas, reforços e chaves. */
  financiamento_valor: number | null
  /** Mensais DEPOIS das chaves — financiamento direto com a construtora. */
  pos_parcelas: number | null
  pos_parcela_valor: number | null
  /** Semestrais/balões depois das chaves. */
  pos_reforcos_qtd: number | null
  pos_reforco_valor: number | null
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
  /** O que a planta e: studio, 2 dormitorios, cobertura, garden. */
  tipologia: string | null
  torre: string | null
  andar: number | null
  numero: string | null
  metragem: number | null
  metragem_total: number | null
  /** Fracao de area comum que cabe a unidade — NUNCA somada a privativa. */
  area_comum: number | null
  area_terraco: number | null
  /** Hobby box, deposito, adega: o que a tabela chamou de espaco complementar. */
  espaco_complementar: string | null
  dormitorios: number | null
  suites: number | null
  banheiros: number | null
  vagas: number | null
  /** O que a coluna de vagas dizia: "Vagas 84 e 27 (simples)". */
  vagas_detalhe: string | null
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

/* ------------------------------------------------------------------ */
/* Importacao de tabela de unidades (leitura por IA)                   */
/* ------------------------------------------------------------------ */

/** Os quatro estados de disponibilidade que a importacao grava. */
export type StatusUnidade = 'disponivel' | 'reservada' | 'vendida' | 'indisponivel'

/** Os campos que a IA sabe extrair de uma linha da tabela. */
export interface CamposImportados {
  identificacao: string | null
  torre: string | null
  andar: number | null
  numero: string | null
  tipologia: string | null
  metragem: number | null
  metragem_total: number | null
  area_comum: number | null
  area_terraco: number | null
  espaco_complementar: string | null
  dormitorios: number | null
  suites: number | null
  banheiros: number | null
  vagas: number | null
  vagas_detalhe: string | null
  valor: number | null
  status: StatusUnidade | null
  observacoes: string | null
}

export type CampoImportado = keyof CamposImportados

export interface UnidadeNova {
  chave: string | null
  campos: CamposImportados
  /** Condicao de pagamento SO daquela unidade; sem ela vale a geral da tabela. */
  fluxo?: FluxoDaConstrutora | null
}

export interface UnidadeAlterada {
  id: number
  identificacao: string
  antes: Partial<CamposImportados>
  depois: Partial<CamposImportados>
  campos: CampoImportado[]
  fluxo?: FluxoDaConstrutora | null
}

export interface UnidadeAusente {
  id: number
  identificacao: string
  status_atual: string | null
}

/** O que a IA nao teve certeza de ler — ela deixa null e avisa aqui. */
export interface DuvidaImportacao {
  unidade?: string | null
  campo?: string | null
  texto: string
}

/**
 * A condicao de pagamento que veio na tabela, quando houver.
 *
 * A tabela da construtora quase nunca tem TODOS os blocos: uma traz entrada
 * parcelada + mensais + semestrais + pos-chaves, outra so entrada + mensais +
 * balao + financiamento. O que nao existe vem null — nunca 0, e nunca
 * inventado.
 */
export interface FluxoDaConstrutora {
  nome?: string | null
  entrada_pct?: number | null
  entrada_valor?: number | null
  /** Entrada em N vezes ("sinal + 3 parcelas" = 4). */
  entrada_parcelas?: number | null
  parcelas?: number | null
  parcela_valor?: number | null
  reforcos_qtd?: number | null
  reforco_valor?: number | null
  /** 'semestral' | 'anual' — so quando a tabela DIZ; balao sem periodo assume semestral. */
  reforcos_periodicidade?: string | null
  chaves_pct?: number | null
  /** Chaves em R$, quando a tabela nao da o percentual. */
  chaves_valor?: number | null
  financiamento_pct?: number | null
  financiamento_valor?: number | null
  pos_parcelas?: number | null
  pos_parcela_valor?: number | null
  pos_reforcos_qtd?: number | null
  pos_reforco_valor?: number | null
  descricao?: string | null
}

/**
 * O corpo que a tela manda para a PREVIA — exatamente o que
 * `validarPayloadDaPrevia` (api/src/importacao.js) espera, e exatamente o que
 * `validarRespostaDaIa` devolve. Os dois lados falam do mesmo objeto de
 * proposito: qualquer campo a mais aqui e recusado la com "campo desconhecido".
 */
export interface EntradaImportacao {
  unidades: (CamposImportados & { fluxo?: FluxoDaConstrutora | null })[]
  duvidas: DuvidaImportacao[]
  fluxo_construtora: FluxoDaConstrutora | null
  /** Quantas torres a tabela deixou concluir; null quando ela nao diz. */
  torres: number | null
}

/** A previa: o que aconteceria se a importacao fosse confirmada. */
export interface PreviaImportacao {
  novas: UnidadeNova[]
  alteradas: UnidadeAlterada[]
  /**
   * Casaram e nao mudaram nada. Nao viram linha de mudanca na tela — mas sao
   * elas que tambem recebem a condicao de pagamento quando a tabela traz uma.
   */
  inalteradas: { id: number; identificacao: string }[]
  ausentes: UnidadeAusente[]
  duvidas: DuvidaImportacao[]
  fluxo_construtora: FluxoDaConstrutora | null
  /** Nome do empreendimento, para o cabeçalho-resumo da prévia. */
  empreendimento: string
  /** Torres lidas da tabela (proposta) e as que ja estao gravadas. */
  torres: number | null
  torresAtual: number | null
  totalRecebidas: number
}

export interface ConfirmacaoImportacao {
  criar: (Partial<CamposImportados> & { fluxo?: FluxoDaConstrutora | null })[]
  atualizar: { id: number; campos: Partial<CamposImportados>; fluxo?: FluxoDaConstrutora | null }[]
  marcarIndisponiveis: number[]
  fluxo_construtora?: FluxoDaConstrutora | null
  /** Grava `empreendimentos.torres`; ausente ou null nao mexe no que esta la. */
  torres?: number | null
  /**
   * Gravar a condicao de pagamento como fluxo NAS UNIDADES importadas. Vem
   * marcado quando ha fluxo, mas e escolha de quem confirma: quem so quer
   * atualizar precos desmarca.
   */
  gravarFluxo?: boolean
}

export interface ResultadoImportacao {
  importacaoId: number
  criadas: number
  atualizadas: number
  indisponiveis: number
  /** Fluxos de pagamento criados e atualizados nas unidades desta importacao. */
  fluxosCriados: number
  fluxosAtualizados: number
  /** Torres gravadas no empreendimento; null quando ninguem informou. */
  torres: number | null
  unidades: Unidade[]
  fluxo_construtora: FluxoDaConstrutora | null
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
  /** Quantas torres/blocos o empreendimento tem. */
  torres: number | null
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

/**
 * Indicador economico do cabecalho. Vem pronto da API — o navegador nao fala
 * com o Banco Central direto.
 */
export interface IndicadorMercado {
  chave: string
  nome: string
  descricao: string
  valor: number
  /** Como exibir o numero. */
  formato: 'percentual' | 'moeda'
  /** O periodo/base do numero: "a.a.", "no mês", "USD/BRL". */
  unidade: string
  /** Data da leitura, em dd/mm/aaaa. */
  referencia: string
  /** Diferenca para a leitura anterior; null quando nao ha com o que comparar. */
  variacao: number | null
  /** 'pontos' = diferenca em p.p.; 'percentual' = variacao relativa. */
  variacaoEm: 'pontos' | 'percentual'
  comparadoCom: string | null
  tendencia: 'alta' | 'baixa' | 'estavel'
  /** Acumulado de 12 meses, para os indices mensais. */
  acumulado12: number | null
  /** Codigo da serie no SGS do Banco Central. */
  serie: number
  /** false = a serie existe para quem consulta (o simulador), mas nao vira cartao no topo. */
  noCabecalho?: boolean
  /** true = a serie nao respondeu agora e este e o ultimo valor conhecido. */
  defasado?: boolean
}

export interface RespostaIndicadores {
  atualizadoEm: string | null
  fonte?: string
  indicadores: IndicadorMercado[]
  /** Series que nao responderam nesta consulta. */
  falhas?: { chave: string; motivo: string }[]
  /** Chaves que estao na tela com o ultimo valor conhecido. */
  defasados?: string[]
  /** true = a consulta falhou e isto e o ultimo dado bom guardado. */
  stale?: boolean
  doCache?: boolean
  erro?: string
}

/** Um endereço encontrado pela busca no mapa (Nominatim/OpenStreetMap). */
export interface EnderecoEncontrado {
  /** A linha completa, para a lista de resultados. */
  rotulo: string
  endereco: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  latitude: number
  longitude: number
}

export interface RespostaEnderecos {
  resultados: EnderecoEncontrado[]
  termo: string
  doCache?: boolean
}

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

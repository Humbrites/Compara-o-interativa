import type {
  Empreendimento,
  EmpreendimentoInput,
  FluxoPagamento,
  FluxoInput,
  ImagemEmpreendimento,
  RespostaIndicadores,
  Unidade,
  UnidadeInput,
} from '../types'

/** Resposta dos endpoints de imagem: a galeria inteira, ja na ordem. */
export interface RespostaImagens {
  imagens: ImagemEmpreendimento[]
  salvas?: ImagemEmpreendimento[]
  recusadas?: { nome: string; motivo: string }[]
}

/** Quantos arquivos a API aceita por requisicao (limite `files` do multipart). */
const IMAGENS_POR_ENVIO = 20

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // Upload vai como FormData — deixar o navegador montar o Content-Type com o
  // boundary; se sobrescrevermos com JSON o multipart nao e reconhecido.
  const ehFormData = init?.body instanceof FormData

  let resposta: Response
  try {
    resposta = await fetch(url, {
      ...init,
      headers: init?.body && !ehFormData ? { 'Content-Type': 'application/json' } : undefined,
    })
  } catch {
    // O fetch so rejeita quando a requisicao nem chegou a completar: conexao
    // caida (o tunel SSH morre por ociosidade e a aba aberta nao percebe),
    // API fora do ar, rede fora. A mensagem nativa do navegador ("Failed to
    // fetch") nao diz nada a quem esta no meio de um cadastro — e o que foi
    // digitado continua aqui, entao basta refazer a conexao e salvar de novo.
    throw new Error('Conexão perdida com o servidor — o que você digitou está aqui. Refaça a conexão e salve de novo')
  }

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null)
    // `erro` e o nosso formato; `message` e o do proprio Fastify (413, 500…).
    throw new Error(corpo?.erro || corpo?.message || `Falha na requisição (${resposta.status})`)
  }

  if (resposta.status === 204) return undefined as T
  return resposta.json() as Promise<T>
}

export const api = {
  listar: () => request<Empreendimento[]>('/api/empreendimentos'),

  criar: (dados: EmpreendimentoInput) =>
    request<Empreendimento>('/api/empreendimentos', { method: 'POST', body: JSON.stringify(dados) }),

  editar: (id: number, dados: EmpreendimentoInput) =>
    request<Empreendimento>(`/api/empreendimentos/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),

  excluir: (id: number) => request<void>(`/api/empreendimentos/${id}`, { method: 'DELETE' }),

  criarFluxo: (dados: FluxoInput) =>
    request<FluxoPagamento>('/api/fluxos', { method: 'POST', body: JSON.stringify(dados) }),

  editarFluxo: (id: number, dados: FluxoInput) =>
    request<FluxoPagamento>(`/api/fluxos/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),

  excluirFluxo: (id: number) => request<void>(`/api/fluxos/${id}`, { method: 'DELETE' }),

  criarUnidade: (dados: UnidadeInput) =>
    request<Unidade>('/api/unidades', { method: 'POST', body: JSON.stringify(dados) }),

  editarUnidade: (id: number, dados: UnidadeInput) =>
    request<Unidade>(`/api/unidades/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),

  excluirUnidade: (id: number) => request<void>(`/api/unidades/${id}`, { method: 'DELETE' }),

  /**
   * Manda em lotes de 20 porque e o teto do multipart da API — passar disso
   * fazia o servidor cortar a requisicao no meio (413 seco). Quem chamou nao
   * precisa saber: a resposta devolvida junta tudo, e a galeria final e a da
   * ultima leva.
   */
  enviarImagens: async (empreendimentoId: number, arquivos: File[]) => {
    const resultado: RespostaImagens = { imagens: [], salvas: [], recusadas: [] }

    for (let inicio = 0; inicio < arquivos.length; inicio += IMAGENS_POR_ENVIO) {
      const corpo = new FormData()
      for (const arquivo of arquivos.slice(inicio, inicio + IMAGENS_POR_ENVIO)) corpo.append('arquivo', arquivo)

      const resposta = await request<RespostaImagens>(`/api/empreendimentos/${empreendimentoId}/imagens`, {
        method: 'POST',
        body: corpo,
      })

      resultado.imagens = resposta.imagens
      resultado.salvas = [...(resultado.salvas ?? []), ...(resposta.salvas ?? [])]
      resultado.recusadas = [...(resultado.recusadas ?? []), ...(resposta.recusadas ?? [])]
    }

    return resultado
  },

  excluirImagem: (id: number) => request<RespostaImagens>(`/api/imagens/${id}`, { method: 'DELETE' }),

  /**
   * Indicadores de mercado. O cache mora na API (uma consulta ao Banco Central
   * serve todas as abas); `forcar` e o botao de atualizar da tela.
   */
  indicadores: (forcar = false) =>
    request<RespostaIndicadores>(`/api/indicadores${forcar ? '?forcar=1' : ''}`),

  /** Os ids na ordem desejada; o primeiro vira a capa. */
  reordenarImagens: (empreendimentoId: number, ids: number[]) =>
    request<RespostaImagens>(`/api/empreendimentos/${empreendimentoId}/imagens/ordem`, {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
}

import type {
  Empreendimento,
  EmpreendimentoInput,
  FluxoPagamento,
  FluxoInput,
  ImagemEmpreendimento,
} from '../types'

/** Resposta dos endpoints de imagem: a galeria inteira, ja na ordem. */
export interface RespostaImagens {
  imagens: ImagemEmpreendimento[]
  salvas?: ImagemEmpreendimento[]
  recusadas?: { nome: string; motivo: string }[]
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // Upload vai como FormData — deixar o navegador montar o Content-Type com o
  // boundary; se sobrescrevermos com JSON o multipart nao e reconhecido.
  const ehFormData = init?.body instanceof FormData

  const resposta = await fetch(url, {
    ...init,
    headers: init?.body && !ehFormData ? { 'Content-Type': 'application/json' } : undefined,
  })

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null)
    throw new Error(corpo?.erro || `Falha na requisicao (${resposta.status})`)
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

  enviarImagens: (empreendimentoId: number, arquivos: File[]) => {
    const corpo = new FormData()
    for (const arquivo of arquivos) corpo.append('arquivo', arquivo)
    return request<RespostaImagens>(`/api/empreendimentos/${empreendimentoId}/imagens`, {
      method: 'POST',
      body: corpo,
    })
  },

  excluirImagem: (id: number) => request<RespostaImagens>(`/api/imagens/${id}`, { method: 'DELETE' }),

  /** Os ids na ordem desejada; o primeiro vira a capa. */
  reordenarImagens: (empreendimentoId: number, ids: number[]) =>
    request<RespostaImagens>(`/api/empreendimentos/${empreendimentoId}/imagens/ordem`, {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
}

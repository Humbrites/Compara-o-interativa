import type { Empreendimento, EmpreendimentoInput, FluxoPagamento, FluxoInput } from '../types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
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
}

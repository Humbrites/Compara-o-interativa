// O `request` mora em `lib/http.ts` desde que passou a existir sessao: ele e o
// mesmo para os dados e para o acesso, e e quem avisa o portao no 401.
import { request } from './http'
import type {
  Empreendimento,
  EmpreendimentoInput,
  EnderecoEncontrado,
  FluxoPagamento,
  FluxoInput,
  ImagemEmpreendimento,
  RespostaEnderecos,
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
   *
   * `no-store` de proposito: o cache do NAVEGADOR aqui so atrapalha — ele
   * chegou a servir uma leitura antiga (sem a Selic) por meia hora, sem nem
   * perguntar ao servidor que ja tinha o dado certo.
   */
  indicadores: (forcar = false) =>
    request<RespostaIndicadores>(`/api/indicadores${forcar ? '?forcar=1' : ''}`, { cache: 'no-store' }),

  /**
   * Busca o endereço no mapa. Quem fala com o OpenStreetMap é a nossa API —
   * ela guarda o resultado e respeita o limite de uma consulta por segundo.
   */
  buscarEndereco: (termo: string) =>
    request<RespostaEnderecos>(`/api/enderecos?q=${encodeURIComponent(termo)}`, { cache: 'no-store' }),

  /** O caminho inverso: que endereço é este ponto (o pino foi arrastado). */
  enderecoDoPonto: (latitude: number, longitude: number) =>
    request<{ endereco: EnderecoEncontrado | null }>(
      `/api/enderecos/ponto?lat=${latitude}&lon=${longitude}`,
      { cache: 'no-store' },
    ),

  /** Os ids na ordem desejada; o primeiro vira a capa. */
  reordenarImagens: (empreendimentoId: number, ids: number[]) =>
    request<RespostaImagens>(`/api/empreendimentos/${empreendimentoId}/imagens/ordem`, {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
}

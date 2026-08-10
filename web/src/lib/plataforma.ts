import { request } from './http'
import type { AssentosResumo, Papel, PlanoResumo, StatusConta } from './acesso'
import type { Empreendimento } from '../types'

/** A visao de quem vende. Existe so para quem tem a marca de operador. */

export type FaixaRenovacao =
  | 'vencida'
  | 'vence-em-7'
  | 'suspensa'
  | 'vence-em-30'
  | 'em-dia'
  | 'sem-vencimento'
  | 'encerrada'

export interface UsuarioDaPlataforma {
  id: number
  nome: string
  email: string
  usuario: string | null
  papel: Papel
  ativo: boolean
  totpAtivo: boolean
  operador: boolean
  senhaDefinida: boolean
  ultimoAcesso: string | null
  criadoEm: string
}

export interface ContaDaPlataforma {
  id: number
  nome: string
  plano: PlanoResumo
  status: StatusConta
  statusGravado: StatusConta
  expiraEm: string | null
  /** Negativo quando já passou; `null` quando a conta não tem vencimento. */
  diasParaVencer: number | null
  faixa: FaixaRenovacao
  exigir2fa: boolean
  observacoes: string | null
  criadoEm: string
  ultimoAcesso: string | null
  assentos: AssentosResumo
  usuarios: UsuarioDaPlataforma[]
}

export interface ResumoPlataforma {
  contas: number
  contasAtivas: number
  usuarios: number
  usuariosAtivos: number
  com2fa: number
  assentosOcupados: number
  vencidas: number
  venceEm7: number
  venceEm30: number
  suspensas: number
  encerradas: number
  porPlano: Record<string, { contas: number; usuarios: number }>
}

export interface Panorama {
  contas: ContaDaPlataforma[]
  resumo: ResumoPlataforma
}

export interface AlteracaoDeConta {
  nome?: string
  plano?: string
  limiteUsuarios?: number | null
  status?: StatusConta
  /** `YYYY-MM-DD`; string vazia limpa o vencimento. */
  expiraEm?: string | null
  observacoes?: string
}

/** A base de um cliente, para o suporte olhar (nunca editar). */
export interface BaseDoClienteResposta {
  conta: { id: number; nome: string }
  empreendimentos: Empreendimento[]
  resumo: {
    empreendimentos: number
    unidades: number
    fluxos: number
    fotos: number
    semCoordenada: number
  }
}

export const plataforma = {
  panorama: () => request<Panorama>('/api/plataforma'),

  salvarConta: (id: number, dados: AlteracaoDeConta) =>
    request<Panorama>(`/api/plataforma/contas/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),

  renovar: (id: number, meses: number) =>
    request<Panorama>(`/api/plataforma/contas/${id}/renovar`, { method: 'POST', body: JSON.stringify({ meses }) }),

  criarConta: (dados: {
    nome: string
    plano: string
    limiteUsuarios?: number | null
    responsavel: string
    email: string
    usuario?: string | null
    diasTeste?: number | null
  }) =>
    request<Panorama & { link: string }>('/api/plataforma/contas', {
      method: 'POST',
      body: JSON.stringify(dados),
    }),

  /** Acrescenta alguém a um cliente que já existe (respeita o teto do plano). */
  criarUsuario: (contaId: number, dados: { nome: string; email: string; papel: Papel; usuario?: string | null }) =>
    request<Panorama & { link: string }>(`/api/plataforma/contas/${contaId}/usuarios`, {
      method: 'POST',
      body: JSON.stringify(dados),
    }),

  baseDoCliente: (contaId: number) => request<BaseDoClienteResposta>(`/api/plataforma/contas/${contaId}/base`),

  linkDeSenha: (usuarioId: number) =>
    request<{ link: string; expiraEmHoras: number }>(`/api/plataforma/usuarios/${usuarioId}/link-senha`, {
      method: 'POST',
    }),
}

/** Cada plano tem a sua cor — é o que deixa a lista legível de relance. */
export const COR_DO_PLANO: Record<string, string> = {
  individual: 'cinza',
  equipe: 'azul',
  profissional: 'roxo',
  personalizado: 'ciano',
}

interface DescricaoDaFaixa {
  cor: string
  rotulo: string
}

export const FAIXAS: Record<FaixaRenovacao, DescricaoDaFaixa> = {
  vencida: { cor: 'vermelho', rotulo: 'Vencida' },
  'vence-em-7': { cor: 'ambar', rotulo: 'Vence esta semana' },
  suspensa: { cor: 'ambar', rotulo: 'Suspensa' },
  'vence-em-30': { cor: 'azul', rotulo: 'Vence no mês' },
  'em-dia': { cor: 'verde', rotulo: 'Em dia' },
  'sem-vencimento': { cor: 'cinza', rotulo: 'Sem vencimento' },
  encerrada: { cor: 'contorno', rotulo: 'Encerrada' },
}

/**
 * "vence em 4 dias", "venceu há 11 dias", "vence hoje". O número cru de dias
 * obriga o leitor a decidir o sinal — e é justo a informação que ele quer.
 */
export function textoDoVencimento(dias: number | null) {
  if (dias === null) return 'sem vencimento'
  if (dias === 0) return 'vence hoje'
  if (dias === 1) return 'vence amanhã'
  if (dias > 0) return `vence em ${dias} dias`
  if (dias === -1) return 'venceu ontem'
  return `venceu há ${Math.abs(dias)} dias`
}

/** Data do SQLite (UTC) para o formato brasileiro. */
export function formatarData(iso: string | null) {
  if (!iso) return '—'
  const data = new Date(`${iso.replace(' ', 'T')}Z`)
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleDateString('pt-BR')
}

/** `YYYY-MM-DD` para preencher o `<input type="date">`. */
export function paraCampoDeData(iso: string | null) {
  return iso ? iso.slice(0, 10) : ''
}

export function textoDoUltimoAcesso(iso: string | null) {
  if (!iso) return 'nunca entrou'

  const dias = Math.floor((Date.now() - new Date(`${iso.replace(' ', 'T')}Z`).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 30) return `há ${dias} dias`
  if (dias < 60) return 'há mais de um mês'
  return `há ${Math.floor(dias / 30)} meses`
}

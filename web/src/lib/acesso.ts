import { request } from './http'
import type { BaseM2 } from './unidades'

export type Papel = 'dono' | 'admin' | 'membro'
export type StatusConta = 'trial' | 'ativa' | 'suspensa' | 'cancelada'

export interface UsuarioSessao {
  id: number
  nome: string
  email: string
  usuario: string | null
  papel: Papel
  totpAtivo: boolean
  /** Operador da plataforma (quem vende): enxerga TODAS as contas. */
  operador: boolean
}

export interface PlanoResumo {
  slug: string
  nome: string
  /** `null` = sem teto de usuarios. */
  limite: number | null
  personalizado: boolean
}

export interface AssentosResumo {
  usuarios: number
  convitesPendentes: number
  ocupados: number
  limite: number | null
  disponiveis: number | null
}

export interface ContaSessao {
  id: number
  nome: string
  /** O ciclo de cobrança contratado (mensal, trimestral, semestral, anual). */
  cobranca: { slug: string; nome: string; meses: number; abreviado: string }
  status: StatusConta
  somenteLeitura: boolean
  expiraEm: string | null
  exigir2fa: boolean
  /** Metragem que divide o preço no valor do m²: privativa (padrão) ou total. */
  base_m2: BaseM2
  plano: PlanoResumo
  assentos: AssentosResumo
}

/**
 * O master vendo o sistema como usuario de uma conta.
 *
 * Serve para apresentar o produto — mapa, painel, comparativo, simulador —
 * sem pedir emprestado o login de um cliente real.
 */
export interface VisaoComoUsuario {
  contaId: number
  conta: string
  /** Base de apresentacao: a unica em que o que ele clicar grava. */
  demonstracao: boolean
  podeGravar: boolean
}

export interface Sessao {
  usuario: UsuarioSessao
  /**
   * `null` quando o login e o MASTER da plataforma: ele administra os
   * clientes e nao pertence a nenhum, entao nao tem plano, assento nem base
   * de empreendimentos. Preenchida na visualizacao como usuario — e ai e a
   * conta VISITADA.
   */
  conta: ContaSessao | null
  master: boolean
  /** Conta que exige 2FA e usuario que ainda nao configurou. */
  precisaConfigurar2fa: boolean
  verComo?: VisaoComoUsuario | null
  aviso?: string | null
}

/** Sessao de quem pertence a um cliente. */
export interface SessaoCliente extends Sessao {
  conta: ContaSessao
  master: false
}

export function ehSessaoDeCliente(sessao: Sessao): sessao is SessaoCliente {
  return !sessao.master && sessao.conta !== null
}

/**
 * Qualquer sessao que abre o dashboard: o cliente na base dele, ou o master
 * visitando uma conta. Ter conta e a unica condicao — quem decide o que a tela
 * deixa fazer e `conta.somenteLeitura`, nao quem esta logado.
 */
export interface SessaoDoDashboard extends Sessao {
  conta: ContaSessao
}

export function abreDashboard(sessao: Sessao): sessao is SessaoDoDashboard {
  return sessao.conta !== null
}

/** O login pode terminar em sessao ou em "agora digite o código". */
export type RespostaLogin = Sessao | { precisa2fa: true; desafio: string }

export function pediu2fa(resposta: RespostaLogin): resposta is { precisa2fa: true; desafio: string } {
  return 'precisa2fa' in resposta && resposta.precisa2fa
}

export interface UsuarioDaEquipe {
  id: number
  nome: string
  email: string
  usuario: string | null
  papel: Papel
  ativo: boolean
  totpAtivo: boolean
  senhaDefinida: boolean
  ultimoAcesso: string | null
}

export interface ConvitePendente {
  id: number
  email: string
  nome: string | null
  papel: Papel
  criado_em: string
  expira_em: string
}

export interface DadosDaConta extends ContaSessao {
  podeGerirEquipe: boolean
  usuarios: UsuarioDaEquipe[]
  convites: ConvitePendente[]
}

export interface SessaoAberta {
  agente: string | null
  ip: string | null
  criadaEm: string
  ultimoUso: string
  atual: boolean
}

export const acesso = {
  /** A sessao atual, ou `null` quando ninguem entrou. */
  atual: () =>
    request<Sessao>('/api/sessao', { ignorarSemSessao: true }).catch(() => null),

  entrar: (identificador: string, senha: string) =>
    request<RespostaLogin>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identificador, senha }),
      ignorarSemSessao: true,
    }),

  /** Segundo passo do login: o codigo do aplicativo ou um de recuperacao. */
  confirmar2fa: (desafio: string, valor: { codigo?: string; recuperacao?: string }) =>
    request<Sessao>('/api/auth/2fa', {
      method: 'POST',
      body: JSON.stringify({ desafio, ...valor }),
      ignorarSemSessao: true,
    }),

  sair: () => request<{ ok: true }>('/api/auth/sair', { method: 'POST' }),

  definirSenha: (token: string, senha: string) =>
    request<{ ok: true }>('/api/auth/definir-senha', {
      method: 'POST',
      body: JSON.stringify({ token, senha }),
      ignorarSemSessao: true,
    }),

  verConvite: (token: string) =>
    request<{ email: string; nome: string | null; papel: Papel; conta: string }>(`/api/auth/convite/${token}`, {
      ignorarSemSessao: true,
    }),

  aceitarConvite: (token: string, dados: { nome: string; senha: string; usuario?: string | null }) =>
    request<Sessao>(`/api/auth/convite/${token}`, {
      method: 'POST',
      body: JSON.stringify(dados),
      ignorarSemSessao: true,
    }),

  /* --- Conta e equipe --------------------------------------------------- */

  conta: () => request<DadosDaConta>('/api/conta'),

  salvarConta: (dados: { nome?: string; exigir2fa?: boolean; base_m2?: BaseM2 }) =>
    request<ContaSessao>('/api/conta', { method: 'PUT', body: JSON.stringify(dados) }),

  convidar: (dados: { email: string; nome?: string; papel: Papel }) =>
    request<{ convite: { id: number; email: string }; link: string; assentos: AssentosResumo }>('/api/conta/convites', {
      method: 'POST',
      body: JSON.stringify(dados),
    }),

  cancelarConvite: (id: number) =>
    request<{ ok: true; assentos: AssentosResumo }>(`/api/conta/convites/${id}`, { method: 'DELETE' }),

  salvarUsuario: (id: number, dados: { papel?: Papel; ativo?: boolean }) =>
    request<{ ok: true; assentos: AssentosResumo }>(`/api/conta/usuarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    }),

  linkDeSenha: (id: number) =>
    request<{ link: string; expiraEmHoras: number }>(`/api/conta/usuarios/${id}/link-senha`, { method: 'POST' }),

  /* --- Seguranca do proprio usuario ------------------------------------- */

  trocarSenha: (senhaAtual: string, novaSenha: string) =>
    request<{ ok: true; aviso: string }>('/api/seguranca/senha', {
      method: 'POST',
      body: JSON.stringify({ senhaAtual, novaSenha }),
      ignorarSemSessao: true,
    }),

  iniciar2fa: () =>
    request<{ segredo: string; url: string; qr: string }>('/api/seguranca/2fa/iniciar', { method: 'POST' }),

  ativar2fa: (codigo: string) =>
    request<{ ok: true; codigos: string[] }>('/api/seguranca/2fa/ativar', {
      method: 'POST',
      body: JSON.stringify({ codigo }),
    }),

  desativar2fa: (senha: string) =>
    request<{ ok: true }>('/api/seguranca/2fa/desativar', {
      method: 'POST',
      body: JSON.stringify({ senha }),
      ignorarSemSessao: true,
    }),

  novosCodigos: (senha: string) =>
    request<{ codigos: string[] }>('/api/seguranca/2fa/codigos', {
      method: 'POST',
      body: JSON.stringify({ senha }),
      ignorarSemSessao: true,
    }),

  sessoes: () =>
    request<{ codigosRecuperacao: number; sessoes: SessaoAberta[] }>('/api/seguranca/sessoes'),

  encerrarOutrasSessoes: () =>
    request<{ ok: true }>('/api/seguranca/sessoes/encerrar-outras', { method: 'POST' }),
}

/** Rotulo curto do papel, para a lista da equipe. */
export const NOME_DO_PAPEL: Record<Papel, string> = {
  dono: 'Dono',
  admin: 'Administrador',
  membro: 'Membro',
}

export const DESCRICAO_DO_PAPEL: Record<Papel, string> = {
  dono: 'Administra a equipe e responde pelo contrato.',
  admin: 'Convida, remove e edita os usuários da conta.',
  membro: 'Usa o sistema; não mexe na equipe.',
}

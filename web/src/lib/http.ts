/**
 * O cliente HTTP do projeto inteiro.
 *
 * Estava dentro de `api.ts` enquanto so existia uma familia de rotas. Saiu
 * daqui porque agora TODA chamada divide duas responsabilidades novas: mandar
 * o cookie de sessao junto e avisar a aplicacao quando a sessao acabou.
 */

/**
 * Disparado quando a API responde 401 numa rota que exigia sessao — o cookie
 * venceu, o usuario foi desativado ou a conta foi encerrada. Quem escuta e o
 * portao, que devolve a tela de login sem recarregar a pagina (e sem perder o
 * que estiver na tela).
 */
export const EVENTO_SEM_SESSAO = 'compara:sem-sessao'

interface Opcoes extends RequestInit {
  /**
   * Para as rotas em que 401 e resposta ESPERADA (login com senha errada,
   * codigo de 2FA invalido): sem isso, errar a senha derrubaria a tela para o
   * mesmo lugar onde ela ja esta.
   */
  ignorarSemSessao?: boolean
}

export async function request<T>(url: string, init?: Opcoes): Promise<T> {
  // Upload vai como FormData — deixar o navegador montar o Content-Type com o
  // boundary; se sobrescrevermos com JSON o multipart nao e reconhecido.
  const ehFormData = init?.body instanceof FormData

  let resposta: Response
  try {
    resposta = await fetch(url, {
      ...init,
      // O cookie de sessao e httpOnly: quem o manda e o navegador, e para isso
      // ele precisa saber que a requisicao aceita credenciais.
      credentials: 'same-origin',
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

    if (resposta.status === 401 && !init?.ignorarSemSessao) {
      window.dispatchEvent(new CustomEvent(EVENTO_SEM_SESSAO))
    }

    // `erro` e o nosso formato; `message` e o do proprio Fastify (413, 500…).
    const erro = new Error(corpo?.erro || corpo?.message || `Falha na requisição (${resposta.status})`)
    // O status e o corpo seguem junto: as telas de acesso precisam distinguir
    // "senha errada" (401) de "sem vaga no plano" (409) e de "conta suspensa"
    // (402), e cada um pede uma saida diferente para o usuario.
    Object.assign(erro, { status: resposta.status, corpo })
    throw erro
  }

  if (resposta.status === 204) return undefined as T
  return resposta.json() as Promise<T>
}

/** O status HTTP de um erro vindo do `request`, quando houver. */
export function statusDoErro(erro: unknown): number | null {
  return erro && typeof erro === 'object' && 'status' in erro ? ((erro as { status: number }).status ?? null) : null
}

export function mensagemDoErro(erro: unknown, padrao = 'Não foi possível concluir') {
  return erro instanceof Error ? erro.message : padrao
}

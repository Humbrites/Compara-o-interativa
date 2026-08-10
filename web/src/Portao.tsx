import { useCallback, useEffect, useState } from 'react'

import App from './App'
import { TelaMaster } from './TelaMaster'
import { TelaConvite, TelaDefinirSenha, TelaLogin } from './components/TelaAcesso'
import { Icone } from './components/Icones'
import { acesso, ehSessaoDeCliente, type Sessao } from './lib/acesso'
import { EVENTO_SEM_SESSAO } from './lib/http'

/**
 * O portao: decide entre a tela de login e a aplicacao, e atende os dois links
 * que chegam de fora (definir senha e convite).
 *
 * Roteamento pelo `pathname` mesmo, sem biblioteca — sao dois caminhos, e
 * qualquer roteador aqui seria mais codigo do que o problema.
 */

type Rota = { tipo: 'app' } | { tipo: 'definir-senha'; token: string } | { tipo: 'convite'; token: string }

function lerRota(): Rota {
  const caminho = window.location.pathname

  const senha = caminho.match(/^\/definir-senha\/([\w-]+)\/?$/)
  if (senha) return { tipo: 'definir-senha', token: senha[1] }

  const convite = caminho.match(/^\/convite\/([\w-]+)\/?$/)
  if (convite) return { tipo: 'convite', token: convite[1] }

  return { tipo: 'app' }
}

export function Portao() {
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [rota, setRota] = useState<Rota>(lerRota)

  /** Volta para a raiz sem recarregar (o token some da barra de endereços). */
  const irParaRaiz = useCallback(() => {
    window.history.replaceState({}, '', '/')
    setRota({ tipo: 'app' })
  }, [])

  useEffect(() => {
    let vivo = true

    acesso
      .atual()
      .then((atual) => vivo && setSessao(atual))
      .finally(() => vivo && setCarregando(false))

    return () => {
      vivo = false
    }
  }, [])

  // Qualquer chamada que volte 401 derruba a tela para o login. Sem isso, a
  // aba aberta desde ontem ficaria mostrando dados velhos e falhando em
  // silêncio a cada clique.
  useEffect(() => {
    const aoPerderSessao = () => setSessao(null)
    window.addEventListener(EVENTO_SEM_SESSAO, aoPerderSessao)
    return () => window.removeEventListener(EVENTO_SEM_SESSAO, aoPerderSessao)
  }, [])

  const entrar = useCallback(
    (nova: Sessao) => {
      setSessao(nova)
      irParaRaiz()
    },
    [irParaRaiz],
  )

  const sair = useCallback(async () => {
    try {
      await acesso.sair()
    } finally {
      setSessao(null)
    }
  }, [])

  if (rota.tipo === 'definir-senha') {
    return <TelaDefinirSenha token={rota.token} onPronto={irParaRaiz} />
  }

  if (rota.tipo === 'convite') {
    // Quem já está logado numa conta não pode aceitar convite por cima da
    // sessão atual: o convite cria um usuário NOVO, de outra conta.
    if (sessao) {
      return (
        <div className="acesso">
          <div className="acesso__cartao">
            <h1 className="acesso__titulo">Você já está conectado</h1>
            <p className="acesso__sub">
              Este convite cria um acesso novo, de outra conta. Saia de{' '}
              <strong>{sessao.conta?.nome ?? 'sua conta atual'}</strong> antes de aceitá-lo.
            </p>
            <button type="button" className="btn btn--primario btn--bloco" onClick={() => void sair()}>
              Sair desta conta
            </button>
            <button type="button" className="btn btn--fantasma btn--bloco" onClick={irParaRaiz}>
              Continuar onde estou
            </button>
          </div>
        </div>
      )
    }
    return <TelaConvite token={rota.token} onEntrou={entrar} />
  }

  if (carregando) {
    return (
      <div className="acesso">
        <div className="acesso__carregando acesso__carregando--tela">
          <Icone nome="spinner" tamanho={22} className="girando" />
          Carregando…
        </div>
      </div>
    )
  }

  if (!sessao) return <TelaLogin onEntrou={entrar} />

  // O master nao tem conta: para ele o sistema E a administracao dos clientes.
  if (!ehSessaoDeCliente(sessao)) {
    return <TelaMaster sessao={sessao} aoMudarSessao={setSessao} aoSair={sair} />
  }

  return <App sessao={sessao} aoMudarSessao={setSessao} aoSair={sair} />
}

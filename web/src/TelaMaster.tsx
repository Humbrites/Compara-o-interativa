import { useCallback, useRef, useState } from 'react'

import { PainelConta } from './components/PainelConta'
import { PainelPlataforma } from './components/PainelPlataforma'
import { Icone } from './components/Icones'
import { Toasts, type Aviso } from './components/ui'
import { mensagemDoErro } from './lib/http'
import { plataforma } from './lib/plataforma'
import type { Sessao } from './lib/acesso'

/**
 * O sistema visto pelo usuario MASTER.
 *
 * Ele nao e cliente: nao tem plano, assento nem base de empreendimentos. Por
 * isso nao existe dashboard aqui — a administracao dos clientes E a tela, e
 * nao um modal por cima de um mapa que ele nao usa.
 */

interface Props {
  sessao: Sessao
  aoMudarSessao: (sessao: Sessao) => void
  aoSair: () => Promise<void>
}

export function TelaMaster({ sessao, aoMudarSessao, aoSair }: Props) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [seguranca, setSeguranca] = useState(false)
  const [entrando, setEntrando] = useState(false)
  const proximoAviso = useRef(1)

  const avisar = useCallback((texto: string, tipo: 'sucesso' | 'erro' = 'sucesso') => {
    const id = proximoAviso.current++
    setAvisos((atual) => [...atual, { id, texto, tipo }])
    window.setTimeout(() => setAvisos((atual) => atual.filter((a) => a.id !== id)), 3600)
  }, [])

  /**
   * Troca a administração pelo dashboard, visto como usuário. Sem dizer a
   * conta, a API abre a de demonstração — e responde explicando quando não há
   * nenhuma marcada, que é o único jeito de o botão do topo errar.
   */
  const verComoUsuario = useCallback(
    async (contaId?: number) => {
      setEntrando(true)
      try {
        aoMudarSessao(await plataforma.verComo(contaId))
      } catch (erro) {
        avisar(mensagemDoErro(erro, 'Não foi possível abrir o dashboard'), 'erro')
      } finally {
        setEntrando(false)
      }
    },
    [aoMudarSessao, avisar],
  )

  const { usuario } = sessao

  return (
    <div className="master">
      <header className="master__topo">
        <div className="master__marca">
          <div className="master__logo">
            <Icone nome="camadas" tamanho={19} espessura={2} />
          </div>
          <div>
            <div className="master__titulo">Compara Interativa</div>
            <div className="master__sub">Administração · clientes, planos e licenças</div>
          </div>
        </div>

        <div className="master__acoes">
          <div className="master__quem">
            <span className="master__nome">{usuario.nome}</span>
            <span className="master__papel">
              <Icone nome="escudo" tamanho={11} />
              Master da plataforma
            </span>
          </div>

          {/* O caminho de um clique para a apresentação: o mesmo dashboard que
              o cliente usa, sem entrar no login de ninguém. */}
          <button
            type="button"
            className="btn btn--primario btn--pequeno"
            onClick={() => void verComoUsuario()}
            disabled={entrando}
            title="Abrir o dashboard (mapa, empreendimentos e simulador) como se fosse um usuário"
          >
            <Icone nome={entrando ? 'spinner' : 'camadas'} tamanho={14} className={entrando ? 'girando' : undefined} />
            {entrando ? 'Abrindo…' : 'Ver como usuário'}
          </button>

          <button type="button" className="btn btn--secundario btn--pequeno" onClick={() => setSeguranca(true)}>
            <Icone nome="escudo" tamanho={14} />
            Minha segurança
          </button>

          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => void aoSair()}>
            <Icone nome="sair" tamanho={14} />
            Sair
          </button>
        </div>
      </header>

      {/* Sem `onFechar`, o painel se comporta como página, não como modal. */}
      <PainelPlataforma avisar={avisar} onVerComoUsuario={verComoUsuario} />

      {seguranca && (
        <PainelConta
          sessao={sessao}
          abaInicial="seguranca"
          aoMudarSessao={aoMudarSessao}
          avisar={avisar}
          onFechar={() => setSeguranca(false)}
        />
      )}

      <Toasts avisos={avisos} />
    </div>
  )
}

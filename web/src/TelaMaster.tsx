import { useCallback, useRef, useState } from 'react'

import { PainelConta } from './components/PainelConta'
import { PainelPlataforma } from './components/PainelPlataforma'
import { Icone } from './components/Icones'
import { Toasts, type Aviso } from './components/ui'
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
  const proximoAviso = useRef(1)

  const avisar = useCallback((texto: string, tipo: 'sucesso' | 'erro' = 'sucesso') => {
    const id = proximoAviso.current++
    setAvisos((atual) => [...atual, { id, texto, tipo }])
    window.setTimeout(() => setAvisos((atual) => atual.filter((a) => a.id !== id)), 3600)
  }, [])

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
      <PainelPlataforma avisar={avisar} />

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

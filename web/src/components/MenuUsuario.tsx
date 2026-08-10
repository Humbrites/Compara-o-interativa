import { useEffect, useRef, useState } from 'react'

import { NOME_DO_PAPEL, type Sessao } from '../lib/acesso'
import { Icone } from './Icones'

/**
 * O canto de quem esta logado: quem e voce, de qual conta, e as saidas
 * (conta/equipe, seguranca, sair).
 */

interface Props {
  sessao: Sessao
  onAbrirConta: () => void
  onAbrirSeguranca: () => void
  onSair: () => Promise<void>
}

/** Iniciais do nome — duas no máximo, que é o que cabe no círculo. */
function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/)
  const primeira = partes[0]?.[0] ?? '?'
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

export function MenuUsuario({ sessao, onAbrirConta, onAbrirSeguranca, onSair }: Props) {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora e no Esc — um menu que só fecha no próprio botão
  // deixa o usuário preso quando ele já mudou de ideia.
  useEffect(() => {
    if (!aberto) return

    const aoClicar = (evento: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) setAberto(false)
    }
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberto(false)
    }

    document.addEventListener('mousedown', aoClicar)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', aoClicar)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  const { usuario, conta } = sessao

  return (
    <div className="usuario" ref={raiz}>
      <button
        type="button"
        className={`usuario__botao${aberto ? ' usuario__botao--aberto' : ''}`}
        onClick={() => setAberto((atual) => !atual)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        title={`${usuario.nome} · ${conta.nome}`}
      >
        <span className="usuario__avatar">{iniciais(usuario.nome)}</span>
        <span className="usuario__texto">
          <span className="usuario__nome">{usuario.nome.split(/\s+/)[0]}</span>
          <span className="usuario__conta">{conta.nome}</span>
        </span>
        <Icone nome="filtro" tamanho={12} />
      </button>

      {aberto && (
        <div className="usuario__menu" role="menu">
          <div className="usuario__cabecalho">
            <div className="usuario__nome-completo">{usuario.nome}</div>
            <div className="usuario__email">{usuario.email}</div>
            <div className="usuario__papel">
              {NOME_DO_PAPEL[usuario.papel]} em {conta.nome}
              {usuario.totpAtivo && (
                <span className="usuario__2fa">
                  <Icone nome="escudo" tamanho={11} />
                  2FA
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            role="menuitem"
            className="usuario__item"
            onClick={() => {
              setAberto(false)
              onAbrirConta()
            }}
          >
            <Icone nome="equipe" tamanho={15} />
            <span>
              Conta e equipe
              <span className="usuario__item-dica">
                {conta.plano.nome}
                {conta.assentos.limite !== null && ` · ${conta.assentos.ocupados}/${conta.assentos.limite}`}
              </span>
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="usuario__item"
            onClick={() => {
              setAberto(false)
              onAbrirSeguranca()
            }}
          >
            <Icone nome="escudo" tamanho={15} />
            <span>
              Minha segurança
              <span className="usuario__item-dica">
                {usuario.totpAtivo ? 'Verificação em duas etapas ativa' : 'Ativar verificação em duas etapas'}
              </span>
            </span>
          </button>

          <div className="usuario__separador" />

          <button type="button" role="menuitem" className="usuario__item usuario__item--sair" onClick={() => void onSair()}>
            <Icone nome="sair" tamanho={15} />
            Sair
          </button>
        </div>
      )}
    </div>
  )
}

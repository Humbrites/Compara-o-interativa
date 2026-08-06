import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icone, type NomeIcone } from './Icones'

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

interface ModalProps {
  titulo: string
  subtitulo?: string
  largo?: boolean
  onFechar: () => void
  children: ReactNode
  rodape?: ReactNode
  cabecalhoExtra?: ReactNode
}

export function Modal({ titulo, subtitulo, largo, onFechar, children, rodape, cabecalhoExtra }: ModalProps) {
  // Esc fecha e o fundo nao rola enquanto o modal esta aberto.
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [onFechar])

  // ⚠️ Sempre no <body>, via portal. `position: fixed` se ancora no ancestral
  // que tiver `transform` — e o painel lateral tem (animação de entrada com
  // `fill-mode: both`, que MANTÉM o transform depois de terminar). Um modal
  // aberto de dentro do painel ficava preso no rodapé dele.
  return createPortal(
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className={`modal${largo ? ' modal--largo' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal__topo">
          <div>
            <h2 className="modal__titulo">{titulo}</h2>
            {subtitulo && <p className="modal__sub">{subtitulo}</p>}
          </div>
          <button type="button" className="modal__fechar" onClick={onFechar} aria-label="Fechar">
            <Icone nome="fechar" tamanho={18} />
          </button>
        </div>
        {cabecalhoExtra}
        <div className="modal__corpo">{children}</div>
        {rodape && <div className="modal__rodape">{rodape}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* Campo de formulario                                                 */
/* ------------------------------------------------------------------ */

interface CampoProps {
  rotulo: string
  obrigatorio?: boolean
  dica?: string
  erro?: string
  className?: string
  children: ReactNode
}

export function Campo({ rotulo, obrigatorio, dica, erro, className, children }: CampoProps) {
  return (
    <label className={`campo${className ? ` ${className}` : ''}`}>
      <span className="campo__rotulo">
        {rotulo}
        {obrigatorio && <span className="campo__obrigatorio">*</span>}
        {dica && <span className="campo__dica">({dica})</span>}
      </span>
      {children}
      {erro && (
        <span className="campo__erro">
          <Icone nome="alerta" tamanho={12} />
          {erro}
        </span>
      )}
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Estados: vazio, carregando, erro                                    */
/* ------------------------------------------------------------------ */

interface EstadoProps {
  icone: NomeIcone
  titulo: string
  texto?: string
  variante?: 'vazio' | 'erro'
  acao?: ReactNode
}

export function Estado({ icone, titulo, texto, variante = 'vazio', acao }: EstadoProps) {
  return (
    <div className={`estado${variante === 'erro' ? ' estado--erro' : ''}`}>
      <div className="estado__icone">
        <Icone nome={icone} tamanho={24} />
      </div>
      <div className="estado__titulo">{titulo}</div>
      {texto && <p className="estado__texto">{texto}</p>}
      {acao}
    </div>
  )
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="estado">
      <div className="estado__icone">
        <Icone nome="spinner" tamanho={24} className="girando" />
      </div>
      <div className="estado__titulo">{texto}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

export interface Aviso {
  id: number
  texto: string
  tipo: 'sucesso' | 'erro'
}

export function Toasts({ avisos }: { avisos: Aviso[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {avisos.map((aviso) => (
        <div key={aviso.id} className={`toast toast--${aviso.tipo}`}>
          <Icone nome={aviso.tipo === 'sucesso' ? 'check' : 'alerta'} tamanho={16} />
          <span>{aviso.texto}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Selo de status                                                      */
/* ------------------------------------------------------------------ */

export function Selo({ cor, children, icone }: { cor: string; children: ReactNode; icone?: NomeIcone }) {
  return (
    <span className={`selo selo--${cor}`}>
      {icone && <Icone nome={icone} tamanho={12} />}
      {children}
    </span>
  )
}

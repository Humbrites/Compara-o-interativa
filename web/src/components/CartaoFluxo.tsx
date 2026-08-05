import type { FluxoPagamento } from '../types'
import { fmtMoeda, fmtPct, TRACO } from '../lib/format'
import { Icone } from './Icones'

/**
 * Cada celula tem um valor principal e, quando existe, um complemento em
 * R$ na linha de baixo — lado a lado o texto era truncado no painel estreito.
 */
interface Celula {
  principal: string
  complemento: string | null
}

const num = (valor: number | null): boolean => valor !== null && Number.isFinite(valor)

function celulaEntrada(f: FluxoPagamento): Celula {
  if (num(f.entrada_pct)) return { principal: fmtPct(f.entrada_pct), complemento: num(f.entrada_valor) ? fmtMoeda(f.entrada_valor) : null }
  if (num(f.entrada_valor)) return { principal: fmtMoeda(f.entrada_valor), complemento: null }
  return { principal: TRACO, complemento: null }
}

function celulaParcelas(f: FluxoPagamento): Celula {
  if (num(f.parcelas)) return { principal: `${f.parcelas}x`, complemento: num(f.parcela_valor) ? fmtMoeda(f.parcela_valor) : null }
  if (num(f.parcela_valor)) return { principal: fmtMoeda(f.parcela_valor), complemento: null }
  return { principal: TRACO, complemento: null }
}

function celulaReforcos(f: FluxoPagamento): Celula {
  if (num(f.reforcos_qtd)) return { principal: String(f.reforcos_qtd), complemento: num(f.reforco_valor) ? fmtMoeda(f.reforco_valor) : null }
  if (num(f.reforco_valor)) return { principal: fmtMoeda(f.reforco_valor), complemento: null }
  return { principal: TRACO, complemento: null }
}

function CelulaFluxo({ rotulo, celula }: { rotulo: string; celula: Celula }) {
  return (
    <div className="fluxo__celula">
      <span className="fluxo__rotulo">{rotulo}</span>
      <span className="fluxo__valor">{celula.principal}</span>
      {celula.complemento && <span className="fluxo__complemento">{celula.complemento}</span>}
    </div>
  )
}

interface Props {
  fluxo: FluxoPagamento
  indice: number
  onEditar?: () => void
  onExcluir?: () => void
}

export function CartaoFluxo({ fluxo, indice, onEditar, onExcluir }: Props) {
  return (
    <article className="fluxo">
      <header className="fluxo__topo">
        <Icone nome="cartao" tamanho={14} />
        <span className="fluxo__nome">{fluxo.nome?.trim() || `Fluxo ${indice + 1}`}</span>
        {/* Sinaliza que as parcelas saíram da calculadora do CUB. */}
        {fluxo.cub_percentual !== null && <span className="fluxo__selo-cub">CUB</span>}
        {(onEditar || onExcluir) && (
          <div className="fluxo__acoes">
            {onEditar && (
              <button type="button" className="btn btn--fantasma btn--icone" onClick={onEditar} title="Editar fluxo">
                <Icone nome="lapis" tamanho={14} />
              </button>
            )}
            {onExcluir && (
              <button type="button" className="btn btn--perigo btn--icone" onClick={onExcluir} title="Excluir fluxo">
                <Icone nome="lixeira" tamanho={14} />
              </button>
            )}
          </div>
        )}
      </header>

      <div className="fluxo__grade">
        <CelulaFluxo rotulo="Entrada" celula={celulaEntrada(fluxo)} />
        <CelulaFluxo rotulo="Parcelas" celula={celulaParcelas(fluxo)} />
        <CelulaFluxo rotulo="Reforços" celula={celulaReforcos(fluxo)} />
        <CelulaFluxo rotulo="Chaves" celula={{ principal: fmtPct(fluxo.chaves_pct), complemento: null }} />
        <CelulaFluxo rotulo="Financ." celula={{ principal: fmtPct(fluxo.financiamento_pct), complemento: null }} />
      </div>

      {fluxo.descricao?.trim() && <div className="fluxo__texto">{fluxo.descricao}</div>}
      {fluxo.observacoes?.trim() && (
        <div className="fluxo__texto" style={{ color: 'var(--texto-3)' }}>
          {fluxo.observacoes}
        </div>
      )}
    </article>
  )
}

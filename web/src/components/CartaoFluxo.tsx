import { useState } from 'react'
import type { FluxoPagamento } from '../types'
import { fmtMoeda, fmtPct, TRACO } from '../lib/format'
import { Icone } from './Icones'
import { DetalheFluxo } from './DetalheFluxo'

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

/** O saldo do banco: a % manda e o R$ dela vem embaixo, como na entrada. */
function celulaFinanciamento(f: FluxoPagamento): Celula {
  if (num(f.financiamento_pct)) {
    return {
      principal: fmtPct(f.financiamento_pct),
      complemento: num(f.financiamento_valor) ? fmtMoeda(f.financiamento_valor) : null,
    }
  }
  if (num(f.financiamento_valor)) return { principal: fmtMoeda(f.financiamento_valor), complemento: null }
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
  /** Preço da unidade — entra nas contas quando a tabela não tem valor próprio. */
  valorDaUnidade?: number | null
  /** Nome do imóvel/unidade, para o cabeçalho do detalhe e os arquivos. */
  titulo?: string
}

export function CartaoFluxo({ fluxo, indice, onEditar, onExcluir, valorDaUnidade = null, titulo }: Props) {
  // O cartão inteiro abre as condições calculadas — é o que o corretor quer
  // ver ao clicar numa tabela de venda, não só o que foi digitado.
  const [abertoNoDetalhe, setAbertoNoDetalhe] = useState(false)

  return (
    <article className="fluxo fluxo--clicavel">
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

      {/* O botão cobre a grade inteira: clicar em qualquer número abre as
          contas daquela tabela. Os botões de editar/excluir ficam fora dele,
          no cabeçalho, para não virarem clique aninhado. */}
      <button
        type="button"
        className="fluxo__abrir"
        onClick={() => setAbertoNoDetalhe(true)}
        title="Ver as condições calculadas"
      >
        <div className="fluxo__grade">
          {num(fluxo.cub_valor_imovel) && (
            <CelulaFluxo
              rotulo="Valor do imóvel"
              celula={{ principal: fmtMoeda(fluxo.cub_valor_imovel), complemento: null }}
            />
          )}
          <CelulaFluxo rotulo="Entrada" celula={celulaEntrada(fluxo)} />
          <CelulaFluxo rotulo="Parcelas" celula={celulaParcelas(fluxo)} />
          <CelulaFluxo rotulo="Reforços" celula={celulaReforcos(fluxo)} />
          <CelulaFluxo rotulo="Chaves" celula={{ principal: fmtPct(fluxo.chaves_pct), complemento: null }} />
          <CelulaFluxo rotulo="Financ." celula={celulaFinanciamento(fluxo)} />
        </div>

        <span className="fluxo__chamada">
          <Icone nome="grafico" tamanho={13} />
          Ver as condições calculadas
          <Icone nome="seta_direita" tamanho={13} />
        </span>
      </button>

      {fluxo.descricao?.trim() && <div className="fluxo__texto">{fluxo.descricao}</div>}
      {fluxo.observacoes?.trim() && (
        <div className="fluxo__texto" style={{ color: 'var(--texto-3)' }}>
          {fluxo.observacoes}
        </div>
      )}

      {abertoNoDetalhe && (
        <DetalheFluxo
          fluxo={fluxo}
          indice={indice}
          valorDaUnidade={valorDaUnidade}
          titulo={titulo}
          onFechar={() => setAbertoNoDetalhe(false)}
        />
      )}
    </article>
  )
}

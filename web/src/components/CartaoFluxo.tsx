import { useMemo, useState } from 'react'
import type { FluxoPagamento } from '../types'
import { detalharFluxo, nomeDoFluxo, ROTULO_TIPO_FLUXO } from '../lib/fluxos'
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

/** "10% · R$ 80.000 em 4x" — a entrada parcelada e a pergunta do cliente. */
function celulaEntrada(f: FluxoPagamento): Celula {
  const vezes = num(f.entrada_parcelas) && (f.entrada_parcelas as number) > 1 ? ` em ${f.entrada_parcelas}x` : ''
  if (num(f.entrada_pct)) {
    return {
      principal: fmtPct(f.entrada_pct),
      complemento: num(f.entrada_valor) ? `${fmtMoeda(f.entrada_valor)}${vezes}` : vezes.trim() || null,
    }
  }
  if (num(f.entrada_valor)) return { principal: fmtMoeda(f.entrada_valor), complemento: vezes.trim() || null }
  return { principal: TRACO, complemento: null }
}

/** Uma serie "N × R$ X" — mensais e semestrais, na obra ou depois das chaves. */
function celulaSerie(qtd: number | null, valor: number | null): Celula {
  if (num(qtd)) return { principal: `${qtd}x`, complemento: num(valor) ? fmtMoeda(valor) : null }
  if (num(valor)) return { principal: fmtMoeda(valor), complemento: null }
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
  /** Abre uma PROPOSTA copiada desta tabela (escrita — some no modo leitura). */
  onPersonalizar?: () => void
  /** Preço da unidade — entra nas contas quando a tabela não tem valor próprio. */
  valorDaUnidade?: number | null
  /** Nome do imóvel/unidade, para o cabeçalho do detalhe e os arquivos. */
  titulo?: string
}

/** "40% do valor" — o peso de cada parte, quando há valor de imóvel. */
function fmtPercentualDaBase(valor: number, base: number | null): string {
  if (base === null || base <= 0) return ''
  return `${fmtPct((valor / base) * 100)} do valor`
}

export function CartaoFluxo({
  fluxo,
  indice,
  onEditar,
  onExcluir,
  onPersonalizar,
  valorDaUnidade = null,
  titulo,
}: Props) {
  // A mesma conta do detalhe — aqui só para o resumo de três números.
  const resumo = useMemo(() => detalharFluxo(fluxo, valorDaUnidade), [fluxo, valorDaUnidade])
  // O cartão inteiro abre as condições calculadas — é o que o corretor quer
  // ver ao clicar numa tabela de venda, não só o que foi digitado.
  const [abertoNoDetalhe, setAbertoNoDetalhe] = useState(false)

  return (
    <article className="fluxo fluxo--clicavel">
      <header className="fluxo__topo">
        <Icone nome="cartao" tamanho={14} />
        <span className="fluxo__nome">{nomeDoFluxo(fluxo, indice)}</span>
        {/* Tabela da construtora × proposta do corretor. Fluxo antigo não tem
            tipo gravado e continua sem selo — nenhum dos dois é chute. */}
        {fluxo.tipo !== null && (
          <span className={`fluxo__selo-tipo fluxo__selo-tipo--${fluxo.tipo}`}>{ROTULO_TIPO_FLUXO[fluxo.tipo]}</span>
        )}
        {/* Sinaliza que as parcelas saíram da calculadora do CUB. */}
        {fluxo.cub_percentual !== null && <span className="fluxo__selo-cub">CUB</span>}
        {(onEditar || onExcluir || onPersonalizar) && (
          <div className="fluxo__acoes">
            {onPersonalizar && (
              <button
                type="button"
                className="btn btn--fantasma btn--icone"
                onClick={onPersonalizar}
                title="Criar fluxo personalizado a partir desta tabela"
              >
                <Icone nome="copiar" tamanho={14} />
              </button>
            )}
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
          {/* As duas ultimas so aparecem quando a tabela tem pos-chaves —
              numa tabela sem elas, celulas vazias so poluiriam a grade. */}
          {(num(fluxo.pos_parcelas) || num(fluxo.pos_parcela_valor)) && (
            <CelulaFluxo
              rotulo="Mensais pós"
              celula={celulaSerie(fluxo.pos_parcelas, fluxo.pos_parcela_valor)}
            />
          )}
          {(num(fluxo.pos_reforcos_qtd) || num(fluxo.pos_reforco_valor)) && (
            <CelulaFluxo
              rotulo="Semestrais pós"
              celula={celulaSerie(fluxo.pos_reforcos_qtd, fluxo.pos_reforco_valor)}
            />
          )}
        </div>

        {/* Preço NOMINAL × custo EFETIVO. "R$ 500.000" não diz nada a quem vai
            pagar 200 mil até as chaves e financiar os outros 300 mil — e é
            essa leitura que o corretor precisa ter na ponta da língua. */}
        {resumo.base !== null && resumo.alocado > 0 && (
          <div className="custo">
            <div className="custo__parte">
              <span className="custo__rotulo">Valor da unidade</span>
              <span className="custo__valor">{fmtMoeda(resumo.base)}</span>
            </div>
            <span className="custo__sinal" aria-hidden="true">
              =
            </span>
            <div className="custo__parte custo__parte--obra">
              <span className="custo__rotulo">Pago até as chaves</span>
              <span className="custo__valor">{fmtMoeda(resumo.durante)}</span>
              <span className="custo__dica">{fmtPercentualDaBase(resumo.durante, resumo.base)}</span>
            </div>
            <span className="custo__sinal" aria-hidden="true">
              +
            </span>
            <div className="custo__parte custo__parte--entrega">
              <span className="custo__rotulo">Saldo na entrega</span>
              <span className="custo__valor">{fmtMoeda(resumo.naEntrega)}</span>
              <span className="custo__dica">{fmtPercentualDaBase(resumo.naEntrega, resumo.base)}</span>
            </div>
            {/* Só aparece quando a tabela tem financiamento direto: sem esta
                terceira parcela a equação não fecharia e o corretor leria um
                "saldo na entrega" que a construtora já parcelou. */}
            {resumo.posChaves > 0 && (
              <>
                <span className="custo__sinal" aria-hidden="true">
                  +
                </span>
                <div className="custo__parte custo__parte--entrega">
                  <span className="custo__rotulo">Depois das chaves</span>
                  <span className="custo__valor">{fmtMoeda(resumo.posChaves)}</span>
                  <span className="custo__dica">{fmtPercentualDaBase(resumo.posChaves, resumo.base)}</span>
                </div>
              </>
            )}
          </div>
        )}

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
          // Fecha o detalhe antes de abrir o formulário: a proposta é editada
          // na unidade, atrás deste modal.
          onPersonalizar={
            onPersonalizar
              ? () => {
                  setAbertoNoDetalhe(false)
                  onPersonalizar()
                }
              : undefined
          }
          onFechar={() => setAbertoNoDetalhe(false)}
        />
      )}
    </article>
  )
}

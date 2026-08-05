import type { ReactNode } from 'react'
import type { Unidade } from '../types'
import { fmtArea, fmtInteiro, fmtMoeda, TRACO } from '../lib/format'
import { corDoStatusUnidade } from '../lib/opcoes'
import { localizacaoUnidade, posicaoUnidade, rotuloUnidade, valorM2Da } from '../lib/unidades'
import { Icone, type NomeIcone } from './Icones'
import { Selo } from './ui'

function Dado({ icone, rotulo, valor }: { icone: NomeIcone; rotulo: string; valor: string }) {
  return (
    <div className="unidade__dado">
      <span className="unidade__rotulo">
        <Icone nome={icone} tamanho={11} />
        {rotulo}
      </span>
      <span className={`unidade__valor${valor === TRACO ? ' unidade__valor--fraco' : ''}`}>{valor}</span>
    </div>
  )
}

interface Props {
  unidade: Unidade
  indice: number
  onEditar?: () => void
  onExcluir?: () => void
  /** Botoes extras no rodape (ex.: abrir os fluxos da unidade). */
  rodape?: ReactNode
}

export function CartaoUnidade({ unidade, indice, onEditar, onExcluir, rodape }: Props) {
  const local = localizacaoUnidade(unidade)
  const posicao = posicaoUnidade(unidade)
  const valorM2 = valorM2Da(unidade)

  return (
    <article className="unidade">
      <header className="unidade__topo">
        <div className="unidade__identidade">
          <span className="unidade__nome">{rotuloUnidade(unidade, indice)}</span>
          {local && <span className="unidade__local">{local}</span>}
        </div>

        <div className="unidade__selos">
          {unidade.status && <Selo cor={corDoStatusUnidade(unidade.status)}>{unidade.status}</Selo>}
          {posicao && (
            <Selo cor="cinza" icone="alvo">
              {posicao}
            </Selo>
          )}
        </div>

        {(onEditar || onExcluir) && (
          <div className="unidade__acoes">
            {onEditar && (
              <button type="button" className="btn btn--fantasma btn--icone" onClick={onEditar} title="Editar unidade">
                <Icone nome="lapis" tamanho={14} />
              </button>
            )}
            {onExcluir && (
              <button type="button" className="btn btn--perigo btn--icone" onClick={onExcluir} title="Excluir unidade">
                <Icone nome="lixeira" tamanho={14} />
              </button>
            )}
          </div>
        )}
      </header>

      <div className="unidade__grade">
        <Dado icone="regua" rotulo="Privativa" valor={fmtArea(unidade.metragem)} />
        <Dado icone="grafico" rotulo="Total" valor={fmtArea(unidade.metragem_total)} />
        <Dado icone="cama" rotulo="Dorm." valor={fmtInteiro(unidade.dormitorios)} />
        <Dado icone="predio" rotulo="Suítes" valor={fmtInteiro(unidade.suites)} />
        <Dado icone="banheira" rotulo="Banh." valor={fmtInteiro(unidade.banheiros)} />
        <Dado icone="carro" rotulo="Vagas" valor={fmtInteiro(unidade.vagas)} />
      </div>

      {(unidade.valor !== null || valorM2 !== null) && (
        <div className="unidade__preco">
          <span className="unidade__preco-valor">{fmtMoeda(unidade.valor)}</span>
          {valorM2 !== null && <span className="unidade__preco-m2">{fmtMoeda(valorM2)}/m²</span>}
        </div>
      )}

      {unidade.observacoes?.trim() && <div className="unidade__texto">{unidade.observacoes}</div>}

      {rodape && <div className="unidade__rodape">{rodape}</div>}
    </article>
  )
}

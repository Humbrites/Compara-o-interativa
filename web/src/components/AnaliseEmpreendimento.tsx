import { useMemo } from 'react'

import { analisarEmpreendimento } from '../lib/analise'
import { fmtArea, fmtMoeda, fmtMoedaCurta, TRACO } from '../lib/format'
import { fmtPercentual } from '../lib/cub'
import type { Unidade } from '../types'
import { Icone } from './Icones'

/**
 * Nivel 2 da analise: "este empreendimento e interessante?".
 *
 * Consolida o que as unidades dizem — faixa de preco, ticket, metragens, m² —
 * e mostra a DISTRIBUICAO, que e a parte que muda a conversa: cinco unidades
 * parecidas e uma cobertura do dobro do preco tem o mesmo "ticket medio" de um
 * predio homogeneo mais caro, e sao coisas completamente diferentes de vender.
 */

interface Props {
  unidades: Unidade[]
}

/** Acima disto, a media esta sendo puxada por poucas unidades caras. */
const ASSIMETRIA_QUE_IMPORTA = 15

export function AnaliseEmpreendimento({ unidades }: Props) {
  const a = useMemo(() => analisarEmpreendimento(unidades), [unidades])

  if (a.comPreco === 0) {
    return (
      <div className="observacao">
        Nenhuma unidade com preço cadastrado ainda. A análise do empreendimento sai das unidades: assim que a primeira
        tiver valor, a faixa de preço, o ticket médio e a distribuição aparecem aqui.
      </div>
    )
  }

  const faixa = (min: number | null, max: number | null, formatar: (v: number) => string) => {
    if (min === null) return TRACO
    return max !== null && max !== min ? `${formatar(min)} — ${formatar(max)}` : formatar(min)
  }

  const maiorFatia = Math.max(...a.distribuicao.map((f) => f.unidades), 1)

  return (
    <div className="analise-emp">
      <div className="analise-numeros">
        <div className="analise-numero">
          <span className="analise-numero__rotulo">
            <Icone nome="dinheiro" tamanho={12} />
            Faixa de preço
          </span>
          <span className="analise-numero__valor">{faixa(a.valorMin, a.valorMax, (v) => fmtMoedaCurta(v))}</span>
          <span className="analise-numero__dica">
            {a.comPreco} de {a.unidades} unidade(s) com preço
          </span>
        </div>

        <div className="analise-numero analise-numero--entrada">
          <span className="analise-numero__rotulo">
            <Icone nome="alvo" tamanho={12} />
            Ticket médio
          </span>
          <span className="analise-numero__valor">{a.ticketMedio === null ? TRACO : fmtMoeda(a.ticketMedio)}</span>
          <span className="analise-numero__dica">
            mediana de {a.medianaDeValor === null ? TRACO : fmtMoeda(a.medianaDeValor)}
          </span>
        </div>

        <div className="analise-numero">
          <span className="analise-numero__rotulo">
            <Icone nome="regua" tamanho={12} />
            Metragem
          </span>
          <span className="analise-numero__valor">{faixa(a.metragemMin, a.metragemMax, (v) => fmtArea(v))}</span>
          <span className="analise-numero__dica">privativa</span>
        </div>

        <div className="analise-numero analise-numero--saldo">
          <span className="analise-numero__rotulo">
            <Icone nome="grafico" tamanho={12} />
            Valor médio do m²
          </span>
          <span className="analise-numero__valor">{a.m2Ponderado === null ? TRACO : fmtMoeda(a.m2Ponderado)}</span>
          <span className="analise-numero__dica">
            {a.faixaM2.min === null
              ? 'sem base'
              : `de ${fmtMoeda(a.faixaM2.min)} a ${fmtMoeda(a.faixaM2.max as number)}`}
          </span>
        </div>
      </div>

      {a.distribuicao.length > 1 && (
        <div className="analise-dist">
          <span className="analise-numero__rotulo">
            <Icone nome="grafico" tamanho={12} />
            Distribuição de preços
          </span>

          <div className="analise-dist__colunas">
            {a.distribuicao.map((fatia) => (
              <div key={fatia.de} className="analise-dist__coluna">
                <span className="analise-dist__quantidade">{fatia.unidades > 0 ? fatia.unidades : ''}</span>
                <div
                  className={`analise-dist__barra${fatia.unidades === 0 ? ' analise-dist__barra--vazia' : ''}`}
                  style={{ height: `${Math.max(4, (fatia.unidades / maiorFatia) * 100)}%` }}
                  title={`${fatia.unidades} unidade(s) entre ${fmtMoeda(fatia.de)} e ${fmtMoeda(fatia.ate)}`}
                />
                <span className="analise-dist__rotulo">{fmtMoedaCurta(fatia.de)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* A média sozinha mente quando há uma cobertura no meio do prédio — e é
          justamente essa a informação que muda o discurso de venda. */}
      {a.assimetria !== null && a.assimetria > ASSIMETRIA_QUE_IMPORTA && (
        <p className="campo__dica linha-calculo linha-calculo--alerta">
          <Icone nome="alerta" tamanho={12} /> O ticket médio está {fmtPercentual(a.assimetria, 1)} acima da mediana:
          há unidade(s) bem mais cara(s) puxando a média. Para descrever o empreendimento, a{' '}
          <strong>mediana de {a.medianaDeValor === null ? TRACO : fmtMoeda(a.medianaDeValor)}</strong> representa
          melhor o que se vende aqui.
        </p>
      )}
    </div>
  )
}

import type { Indicadores } from '../lib/dashboard'
import { fmtArea, fmtMoeda, TRACO } from '../lib/format'
import { Icone, type NomeIcone } from './Icones'

interface CartaoProps {
  icone: NomeIcone
  rotulo: string
  valor: string
  detalhe?: string
  variante?: 'barato' | 'caro'
  onClick?: () => void
}

function Cartao({ icone, rotulo, valor, detalhe, variante, onClick }: CartaoProps) {
  const classes = ['kpi']
  if (variante) classes.push(`kpi--${variante}`)

  const conteudo = (
    <>
      <div className="kpi__topo">
        <Icone nome={icone} tamanho={13} />
        <span className="kpi__rotulo">{rotulo}</span>
      </div>
      <div className="kpi__valor">{valor}</div>
      {detalhe && (
        <div className="kpi__detalhe" title={detalhe}>
          {detalhe}
        </div>
      )}
    </>
  )

  // Os cartoes de mais barato/mais caro levam ao empreendimento no mapa.
  if (onClick) {
    return (
      <button type="button" className={classes.join(' ')} onClick={onClick} style={{ textAlign: 'left' }}>
        {conteudo}
      </button>
    )
  }

  return <div className={classes.join(' ')}>{conteudo}</div>
}

interface Props {
  indicadores: Indicadores
  onIrPara: (id: number) => void
}

export function Kpis({ indicadores, onIrPara }: Props) {
  const { total, precoMedioM2, maiorMetragem, menorMetragem, maisBarato, maisCaro } = indicadores

  return (
    <div className="kpis">
      <Cartao icone="predio" rotulo="Empreendimentos" valor={String(total)} detalhe="no filtro atual" />

      <Cartao
        icone="dinheiro"
        rotulo="Preço médio do m²"
        valor={fmtMoeda(precoMedioM2)}
        detalhe={precoMedioM2 === null ? 'sem valor cadastrado' : 'média dos cadastrados'}
      />

      <Cartao
        icone="seta_cima"
        rotulo="Maior metragem"
        valor={fmtArea(maiorMetragem)}
        detalhe={maiorMetragem === null ? 'sem metragem' : 'entre todas as plantas'}
      />

      <Cartao
        icone="seta_baixo"
        rotulo="Menor metragem"
        valor={fmtArea(menorMetragem)}
        detalhe={menorMetragem === null ? 'sem metragem' : 'entre todas as plantas'}
      />

      <Cartao
        icone="check"
        rotulo="Mais barato (m²)"
        valor={maisBarato ? fmtMoeda(maisBarato.valor_m2) : TRACO}
        detalhe={maisBarato?.nome ?? 'sem valor cadastrado'}
        variante="barato"
        onClick={maisBarato ? () => onIrPara(maisBarato.id) : undefined}
      />

      <Cartao
        icone="alerta"
        rotulo="Mais caro (m²)"
        valor={maisCaro ? fmtMoeda(maisCaro.valor_m2) : TRACO}
        detalhe={maisCaro?.nome ?? 'sem valor cadastrado'}
        variante="caro"
        onClick={maisCaro ? () => onIrPara(maisCaro.id) : undefined}
      />
    </div>
  )
}

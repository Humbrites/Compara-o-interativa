import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Graficos em SVG desenhados aqui mesmo — o projeto nao carrega biblioteca
 * de grafico nem CDN. Uma serie por grafico, na cor da marca: o titulo diz
 * o que e, entao nao ha legenda; a tabela de evolucao e a leitura exata.
 */

export interface PontoGrafico {
  /** Eixo x — o mes da obra. */
  rotulo: string
  valor: number
  /** Linha extra do tooltip. */
  detalhe?: string
}

interface Props {
  titulo: string
  descricao?: string
  pontos: PontoGrafico[]
  /** Como o valor aparece no tooltip e no rotulo do ultimo ponto. */
  formatar: (valor: number) => string
  /** Versao curta para o eixo y (R$ 2,5 mil). */
  formatarEixo?: (valor: number) => string
  altura?: number
  /** Linha com area preenchida embaixo — usada no acumulado. */
  comArea?: boolean
}

const MARGEM = { topo: 14, direita: 16, baixo: 26, esquerda: 62 }

/** Largura real do container, para desenhar sem distorcer texto. */
function useLargura() {
  const ref = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(560)

  useLayoutEffect(() => {
    const alvo = ref.current
    if (!alvo) return

    const medir = () => setLargura(Math.max(alvo.clientWidth, 260))
    medir()

    const observador = new ResizeObserver(medir)
    observador.observe(alvo)
    return () => observador.disconnect()
  }, [])

  return { ref, largura }
}

/** Escala com "números redondos": o topo do eixo nunca é um valor quebrado. */
function arredondarParaCima(valor: number): number {
  if (valor <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(valor))
  return Math.ceil(valor / (magnitude / 2)) * (magnitude / 2)
}

function ticks(min: number, max: number, quantidade = 4): number[] {
  const passo = (max - min) / quantidade
  return Array.from({ length: quantidade + 1 }, (_, i) => min + passo * i)
}

interface Geometria {
  largura: number
  altura: number
  x: (indice: number) => number
  y: (valor: number) => number
  minY: number
  maxY: number
  base: number
}

/**
 * `banda` distribui os pontos em faixas (o centro da barra fica no meio da
 * faixa); sem ela, o primeiro e o ultimo ponto encostam nas bordas do plot —
 * certo para linha, errado para barra (metade da primeira barra ficaria em
 * cima dos rotulos do eixo y).
 */
function geometria(
  pontos: PontoGrafico[],
  largura: number,
  altura: number,
  doZero: boolean,
  banda = false,
): Geometria {
  const valores = pontos.map((p) => p.valor)
  const maiorValor = Math.max(...valores, 0)
  const menorValor = Math.min(...valores, 0)

  // Barras e area sempre do zero; a linha pode aproximar o eixo do dado, senao
  // uma variacao de 30% vira uma reta.
  const maxY = arredondarParaCima(maiorValor || 1)
  const minY = doZero
    ? Math.min(menorValor, 0)
    : Math.max(0, Math.min(...valores) - (maiorValor - Math.min(...valores)) * 0.35)

  const larguraPlot = largura - MARGEM.esquerda - MARGEM.direita
  const alturaPlot = altura - MARGEM.topo - MARGEM.baixo
  const passo = banda
    ? larguraPlot / Math.max(pontos.length, 1)
    : pontos.length > 1
      ? larguraPlot / (pontos.length - 1)
      : 0

  return {
    largura,
    altura,
    x: (indice) =>
      banda
        ? MARGEM.esquerda + (indice + 0.5) * passo
        : MARGEM.esquerda + (pontos.length > 1 ? indice * passo : larguraPlot / 2),
    y: (valor) => MARGEM.topo + alturaPlot - ((valor - minY) / (maxY - minY || 1)) * alturaPlot,
    minY,
    maxY,
    base: MARGEM.topo + alturaPlot,
  }
}

/** Quais meses cabem no eixo x sem os rótulos se atropelarem. */
function rotulosVisiveis(total: number, largura: number): number[] {
  const cabem = Math.max(2, Math.floor((largura - MARGEM.esquerda - MARGEM.direita) / 60))
  const passo = Math.max(1, Math.ceil(total / cabem))

  const indices: number[] = []
  for (let i = 0; i < total; i += passo) indices.push(i)

  // O ultimo mes sempre aparece; se ficou colado no anterior, o anterior sai.
  const ultimo = total - 1
  if (indices[indices.length - 1] !== ultimo) {
    if (ultimo - indices[indices.length - 1] < passo * 0.9) indices.pop()
    indices.push(ultimo)
  }
  return indices
}

function Moldura({
  geo,
  pontos,
  formatarEixo,
}: {
  geo: Geometria
  pontos: PontoGrafico[]
  formatarEixo: (valor: number) => string
}) {
  return (
    <g>
      {ticks(geo.minY, geo.maxY).map((valor) => (
        <g key={valor}>
          <line
            className="grafico__grade"
            x1={MARGEM.esquerda}
            x2={geo.largura - MARGEM.direita}
            y1={geo.y(valor)}
            y2={geo.y(valor)}
          />
          <text className="grafico__tick" x={MARGEM.esquerda - 8} y={geo.y(valor) + 4} textAnchor="end">
            {formatarEixo(valor)}
          </text>
        </g>
      ))}

      {rotulosVisiveis(pontos.length, geo.largura).map((indice) => (
        <text
          key={indice}
          className="grafico__tick"
          x={geo.x(indice)}
          y={geo.altura - 8}
          textAnchor={indice === 0 ? 'start' : indice === pontos.length - 1 ? 'end' : 'middle'}
        >
          {pontos[indice].rotulo}
        </text>
      ))}
    </g>
  )
}

/** Caixa que segue o ponto sob o cursor. */
function Tooltip({
  ponto,
  formatar,
  esquerda,
  topo,
}: {
  ponto: PontoGrafico
  formatar: (valor: number) => string
  esquerda: number
  topo: number
}) {
  return (
    <div className="grafico__tooltip" style={{ left: esquerda, top: topo }}>
      <span className="grafico__tooltip-rotulo">{ponto.rotulo}</span>
      <span className="grafico__tooltip-valor">{formatar(ponto.valor)}</span>
      {ponto.detalhe && <span className="grafico__tooltip-detalhe">{ponto.detalhe}</span>}
    </div>
  )
}

/** Estado compartilhado do hover: qual índice está sob o cursor. */
function useHover(pontos: PontoGrafico[], geo: Geometria) {
  const [ativo, setAtivo] = useState<number | null>(null)

  useEffect(() => {
    if (ativo !== null && ativo > pontos.length - 1) setAtivo(null)
  }, [ativo, pontos.length])

  function aoMover(evento: React.MouseEvent<SVGSVGElement>) {
    const caixa = evento.currentTarget.getBoundingClientRect()
    const x = evento.clientX - caixa.left
    // Ponto mais proximo: o alvo e a faixa inteira, nao o marcador.
    let maisProximo = 0
    let menorDistancia = Infinity
    for (let i = 0; i < pontos.length; i++) {
      const distancia = Math.abs(geo.x(i) - x)
      if (distancia < menorDistancia) {
        menorDistancia = distancia
        maisProximo = i
      }
    }
    setAtivo(maisProximo)
  }

  return { ativo, aoMover, sair: () => setAtivo(null) }
}

/* ------------------------------------------------------------------ */
/* Linha (e area)                                                      */
/* ------------------------------------------------------------------ */

export function GraficoLinha({
  titulo,
  descricao,
  pontos,
  formatar,
  formatarEixo = formatar,
  altura = 230,
  comArea = false,
}: Props) {
  const { ref, largura } = useLargura()
  const geo = geometria(pontos, largura, altura, comArea)
  const { ativo, aoMover, sair } = useHover(pontos, geo)

  if (pontos.length === 0) return null

  const caminho = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${geo.x(i)} ${geo.y(p.valor)}`).join(' ')
  const area = `${caminho} L ${geo.x(pontos.length - 1)} ${geo.base} L ${geo.x(0)} ${geo.base} Z`
  const ultimo = pontos.length - 1

  return (
    <figure className="grafico" ref={ref}>
      <figcaption className="grafico__titulo">
        {titulo}
        {descricao && <span className="grafico__descricao">{descricao}</span>}
      </figcaption>

      <div className="grafico__area">
        <svg
          width={largura}
          height={altura}
          role="img"
          aria-label={`${titulo}. Valores exatos na tabela de evolução.`}
          onMouseMove={aoMover}
          onMouseLeave={sair}
        >
          <Moldura geo={geo} pontos={pontos} formatarEixo={formatarEixo} />

          {comArea && <path className="grafico__preenchimento" d={area} />}
          <path className="grafico__linha" d={caminho} />

          {/* Rotulo direto so no ultimo ponto — o valor que interessa. */}
          <circle className="grafico__ponto" cx={geo.x(ultimo)} cy={geo.y(pontos[ultimo].valor)} r={4.5} />

          {ativo !== null && (
            <g>
              <line
                className="grafico__cursor"
                x1={geo.x(ativo)}
                x2={geo.x(ativo)}
                y1={MARGEM.topo}
                y2={geo.base}
              />
              <circle className="grafico__ponto grafico__ponto--ativo" cx={geo.x(ativo)} cy={geo.y(pontos[ativo].valor)} r={5.5} />
            </g>
          )}
        </svg>

        {ativo !== null && (
          <Tooltip
            ponto={pontos[ativo]}
            formatar={formatar}
            esquerda={Math.min(Math.max(geo.x(ativo) - 60, 0), largura - 130)}
            topo={Math.max(geo.y(pontos[ativo].valor) - 66, 0)}
          />
        )}
      </div>
    </figure>
  )
}

/* ------------------------------------------------------------------ */
/* Barras                                                              */
/* ------------------------------------------------------------------ */

export function GraficoBarras({
  titulo,
  descricao,
  pontos,
  formatar,
  formatarEixo = formatar,
  altura = 230,
}: Props) {
  const { ref, largura } = useLargura()
  const geo = geometria(pontos, largura, altura, true, true)
  const { ativo, aoMover, sair } = useHover(pontos, geo)

  if (pontos.length === 0) return null

  const larguraPlot = largura - MARGEM.esquerda - MARGEM.direita
  // 2px de respiro entre barras (nunca borda) e um minimo para nao sumirem.
  const larguraBarra = Math.max(2, larguraPlot / pontos.length - 2)

  return (
    <figure className="grafico" ref={ref}>
      <figcaption className="grafico__titulo">
        {titulo}
        {descricao && <span className="grafico__descricao">{descricao}</span>}
      </figcaption>

      <div className="grafico__area">
        <svg
          width={largura}
          height={altura}
          role="img"
          aria-label={`${titulo}. Valores exatos na tabela de evolução.`}
          onMouseMove={aoMover}
          onMouseLeave={sair}
        >
          <Moldura geo={geo} pontos={pontos} formatarEixo={formatarEixo} />

          {pontos.map((ponto, indice) => {
            const y = geo.y(ponto.valor)
            const alturaBarra = Math.max(geo.base - y, 1)
            return (
              <rect
                key={ponto.rotulo}
                className={`grafico__barra${ativo === indice ? ' grafico__barra--ativa' : ''}`}
                x={geo.x(indice) - larguraBarra / 2}
                y={y}
                width={larguraBarra}
                height={alturaBarra}
                rx={Math.min(4, larguraBarra / 2)}
              />
            )
          })}
        </svg>

        {ativo !== null && (
          <Tooltip
            ponto={pontos[ativo]}
            formatar={formatar}
            esquerda={Math.min(Math.max(geo.x(ativo) - 60, 0), largura - 130)}
            topo={Math.max(geo.y(pontos[ativo].valor) - 66, 0)}
          />
        )}
      </div>
    </figure>
  )
}

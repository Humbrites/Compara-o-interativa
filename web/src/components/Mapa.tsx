import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import type { Empreendimento } from '../types'
import { fmtMoeda } from '../lib/format'
import { Icone } from './Icones'

/** Centro inicial: Brasil inteiro, ate haver empreendimento para enquadrar. */
const CENTRO_PADRAO: L.LatLngExpression = [-15.78, -47.93]
const ZOOM_PADRAO = 4

interface Props {
  lista: Empreendimento[]
  selecionadoA: number | null
  selecionadoB: number | null
  onSelecionar: (id: number) => void
}

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

function temCoordenada(e: Empreendimento): boolean {
  return (
    e.latitude !== null &&
    e.longitude !== null &&
    Number.isFinite(e.latitude) &&
    Number.isFinite(e.longitude)
  )
}

/** Pino desenhado em CSS; a inicial do empreendimento vai dentro. */
function criarIcone(e: Empreendimento, papel: 'a' | 'b' | null, apagado: boolean): L.DivIcon {
  const classes = ['pino']
  if (papel) classes.push(`pino--${papel}`)
  if (apagado) classes.push('pino--apagado')

  // Primeira letra REAL do nome, ignorando prefixos entre colchetes e
  // pontuacao — senao "[exemplo] Vista Verde" viraria "E".
  const inicial = e.nome.replace(/^\s*\[[^\]]*\]\s*/, '').match(/\p{L}|\p{N}/u)?.[0] ?? '?'
  const rotulo = papel ? papel.toUpperCase() : inicial.toUpperCase()

  return L.divIcon({
    className: 'pino-wrapper',
    html: `<div class="${classes.join(' ')}"><span class="pino__interno">${escapar(rotulo)}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    tooltipAnchor: [10, -12],
  })
}

function montarTooltip(e: Empreendimento): string {
  const local = [e.bairro, e.cidade].filter(Boolean).join(' · ')
  const valor = e.valor_m2 !== null ? `<div class="dica__valor">${fmtMoeda(e.valor_m2, true)} / m²</div>` : ''
  const construtora = e.construtora ? `<div class="dica__linha">${escapar(e.construtora)}</div>` : ''
  const linhaLocal = local ? `<div class="dica__linha">${escapar(local)}</div>` : ''

  return `
    <div class="dica__cartao">
      <div class="dica__nome">${escapar(e.nome)}</div>
      ${construtora}
      ${linhaLocal}
      ${valor}
      <div class="dica__acao">Clique para selecionar</div>
    </div>`
}

export function Mapa({ lista, selecionadoA, selecionadoB, onSelecionar }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapaRef = useRef<L.Map | null>(null)
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const marcadoresRef = useRef(new Map<number, L.Marker>())

  // O clique precisa sempre chamar o callback mais recente sem recriar marcador.
  const onSelecionarRef = useRef(onSelecionar)
  onSelecionarRef.current = onSelecionar

  const comCoordenada = useMemo(() => lista.filter(temCoordenada), [lista])
  const semCoordenada = lista.length - comCoordenada.length

  /* --- Cria o mapa uma unica vez ---------------------------------------- */
  useEffect(() => {
    if (!divRef.current || mapaRef.current) return

    const mapa = L.map(divRef.current, {
      center: CENTRO_PADRAO,
      zoom: ZOOM_PADRAO,
      zoomControl: true,
      attributionControl: true,
      touchZoom: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(mapa)

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 52,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (grupo) => {
        const total = grupo.getChildCount()
        const porte = total < 10 ? 'pequeno' : total < 50 ? 'medio' : 'grande'
        const lado = porte === 'pequeno' ? 44 : porte === 'medio' ? 52 : 60
        return L.divIcon({
          html: `<div class="cluster cluster--${porte}" style="width:${lado}px;height:${lado}px"><div class="cluster__nucleo">${total}</div></div>`,
          className: 'cluster-wrapper',
          iconSize: L.point(lado, lado),
        })
      },
    })

    mapa.addLayer(cluster)
    mapaRef.current = mapa
    clusterRef.current = cluster

    // O container nasce com tamanho 0 dentro do flex; sem isso o mapa fica cinza.
    const ajustar = () => mapa.invalidateSize()
    const observador = new ResizeObserver(ajustar)
    observador.observe(divRef.current)

    return () => {
      observador.disconnect()
      mapa.remove()
      mapaRef.current = null
      clusterRef.current = null
      marcadoresRef.current.clear()
    }
  }, [])

  /* --- Sincroniza os marcadores com a lista ------------------------------ */
  useEffect(() => {
    const cluster = clusterRef.current
    const mapa = mapaRef.current
    if (!cluster || !mapa) return

    cluster.clearLayers()
    marcadoresRef.current.clear()

    for (const e of comCoordenada) {
      const marcador = L.marker([e.latitude as number, e.longitude as number], {
        icon: criarIcone(e, null, false),
        title: e.nome,
      })

      marcador.bindTooltip(montarTooltip(e), {
        direction: 'top',
        className: 'dica',
        offset: [0, -6],
        opacity: 1,
      })

      marcador.on('click', () => onSelecionarRef.current(e.id))
      marcadoresRef.current.set(e.id, marcador)
      cluster.addLayer(marcador)
    }

    // Enquadra o conjunto sempre que o resultado dos filtros muda.
    if (comCoordenada.length > 0) {
      const limites = L.latLngBounds(
        comCoordenada.map((e) => [e.latitude as number, e.longitude as number] as L.LatLngTuple),
      )
      mapa.fitBounds(limites, { padding: [70, 70], maxZoom: 15, animate: true })
    }
  }, [comCoordenada])

  /* --- Reflete a selecao nos icones ------------------------------------- */
  useEffect(() => {
    const houveSelecao = selecionadoA !== null || selecionadoB !== null

    for (const e of comCoordenada) {
      const marcador = marcadoresRef.current.get(e.id)
      if (!marcador) continue

      const papel = e.id === selecionadoA ? 'a' : e.id === selecionadoB ? 'b' : null
      // Sem nenhuma selecao todos ficam normais; com selecao, os outros recuam.
      marcador.setIcon(criarIcone(e, papel, houveSelecao && !papel))
      if (papel) marcador.setZIndexOffset(1000)
      else marcador.setZIndexOffset(0)
    }
  }, [comCoordenada, selecionadoA, selecionadoB])

  /* --- Centraliza no empreendimento selecionado -------------------------- */
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || selecionadoA === null) return

    const alvo = comCoordenada.find((e) => e.id === selecionadoA)
    if (!alvo) return

    const marcador = marcadoresRef.current.get(alvo.id)
    // zoomToShowLayer abre o cluster se o pino estiver agrupado.
    if (marcador && clusterRef.current) {
      clusterRef.current.zoomToShowLayer(marcador, () => {
        mapa.panTo([alvo.latitude as number, alvo.longitude as number], { animate: true })
      })
    }
  }, [selecionadoA, comCoordenada])

  function enquadrarTudo() {
    const mapa = mapaRef.current
    if (!mapa) return
    if (comCoordenada.length === 0) {
      mapa.setView(CENTRO_PADRAO, ZOOM_PADRAO)
      return
    }
    const limites = L.latLngBounds(
      comCoordenada.map((e) => [e.latitude as number, e.longitude as number] as L.LatLngTuple),
    )
    mapa.fitBounds(limites, { padding: [70, 70], maxZoom: 15 })
  }

  return (
    <div className="mapa-area">
      <div ref={divRef} className="mapa" role="application" aria-label="Mapa dos empreendimentos" />

      <div className="mapa-controles">
        <button
          type="button"
          className="mapa-botao"
          onClick={enquadrarTudo}
          title="Enquadrar todos os empreendimentos"
          aria-label="Enquadrar todos os empreendimentos"
        >
          <Icone nome="alvo" tamanho={17} />
        </button>
      </div>

      {semCoordenada > 0 && (
        <div className="mapa-aviso">
          <Icone nome="alerta" tamanho={15} />
          <span>
            <strong>{semCoordenada}</strong>{' '}
            {semCoordenada === 1 ? 'empreendimento sem coordenada' : 'empreendimentos sem coordenada'} —
            não aparece{semCoordenada === 1 ? '' : 'm'} no mapa
          </span>
        </div>
      )}

      {lista.length === 0 && (
        <div className="mapa-aviso">
          <Icone nome="info" tamanho={15} />
          <span>Nenhum empreendimento para exibir</span>
        </div>
      )}
    </div>
  )
}

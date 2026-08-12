import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'

import { api } from '../lib/api'
import { mensagemDoErro } from '../lib/http'
import type { EnderecoEncontrado } from '../types'
import { Campo } from './ui'
import { Icone } from './Icones'

/**
 * Onde o empreendimento fica — sem ninguem digitar coordenada.
 *
 * Latitude e longitude eram dois campos de texto, e quem cadastra um imovel
 * nao sabe os numeros: o empreendimento entrava na base e sumia do mapa, que e
 * o centro do produto. Aqui o corretor busca o endereco, escolhe na lista e
 * confere o pino; os numeros continuam existindo, mas recolhidos, para o caso
 * de alguem TER a coordenada exata (uma planta, um GPS).
 */

const CENTRO_BRASIL: L.LatLngExpression = [-15.78, -47.93]
const ZOOM_BRASIL = 4
const ZOOM_ENDERECO = 17

interface Props {
  valores: { endereco: string; cidade: string; bairro: string; latitude: string; longitude: string }
  /** Aplica varios campos de uma vez (a busca preenche endereco, bairro e cidade juntos). */
  onAplicar: (campos: Partial<Props['valores']>) => void
  erros: { latitude?: string; longitude?: string }
  /** Campo de texto do formulario que hospeda este seletor. */
  entrada: (campo: string, extras?: Record<string, unknown>) => React.ReactNode
}

/** Coordenada em texto, no formato que o formulario guarda. */
const paraTexto = (valor: number) => valor.toFixed(6)

function lerCoordenada(texto: string): number | null {
  const numero = Number(String(texto).replace(',', '.'))
  return Number.isFinite(numero) && String(texto).trim() !== '' ? numero : null
}

export function SeletorDeLocal({ valores, onAplicar, erros, entrada }: Props) {
  const [termo, setTermo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<EnderecoEncontrado[] | null>(null)
  const [erroBusca, setErroBusca] = useState<string | null>(null)
  const [verCoordenadas, setVerCoordenadas] = useState(false)

  const caixaDoMapa = useRef<HTMLDivElement | null>(null)
  const mapa = useRef<L.Map | null>(null)
  const pino = useRef<L.Marker | null>(null)
  /**
   * Quem mexeu no ponto: o mapa (clique/arrasto) ou a busca.
   *
   * Reenquadrar depois de um arrasto faria o mapa fugir da mão de quem está
   * ajustando; NÃO reenquadrar depois de uma busca deixa o pino perdido num
   * mapa do Brasil inteiro, que foi exatamente o que aconteceu.
   */
  const veioDoMapa = useRef(false)

  const lat = lerCoordenada(valores.latitude)
  const lng = lerCoordenada(valores.longitude)
  const temPonto = lat !== null && lng !== null

  /** Grava o ponto escolhido — pelo clique, pelo arrasto ou pela busca. */
  function marcar(latitude: number, longitude: number) {
    onAplicar({ latitude: paraTexto(latitude), longitude: paraTexto(longitude) })
  }

  /* --- O mapa ------------------------------------------------------- */
  useEffect(() => {
    if (!caixaDoMapa.current || mapa.current) return

    const instancia = L.map(caixaDoMapa.current, {
      center: CENTRO_BRASIL,
      zoom: ZOOM_BRASIL,
      // Sem rolagem por engano: o formulário inteiro rola, e o zoom roubaria a
      // rolagem da página ao passar o mouse por cima.
      scrollWheelZoom: false,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(instancia)

    // Clicar no mapa marca o ponto: é o caminho de quem conhece a região e não
    // precisa de busca nenhuma.
    instancia.on('click', (evento: L.LeafletMouseEvent) => {
      veioDoMapa.current = true
      marcar(evento.latlng.lat, evento.latlng.lng)
    })

    mapa.current = instancia
    // O modal abre com animação; sem isso o mapa nasce com meia altura.
    setTimeout(() => instancia.invalidateSize(), 220)

    return () => {
      instancia.remove()
      mapa.current = null
      pino.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* --- O pino acompanha as coordenadas ------------------------------ */
  useEffect(() => {
    const instancia = mapa.current
    if (!instancia) return

    if (!temPonto) {
      if (pino.current) {
        pino.current.remove()
        pino.current = null
      }
      return
    }

    const posicao: L.LatLngExpression = [lat as number, lng as number]

    if (!pino.current) {
      pino.current = L.marker(posicao, {
        draggable: true,
        icon: L.divIcon({
          className: 'pino-wrapper',
          html: '<div class="pino pino--a"><span class="pino__interno">✓</span></div>',
          iconSize: [30, 30],
          iconAnchor: [15, 28],
        }),
      }).addTo(instancia)

      pino.current.on('dragend', () => {
        const ponto = pino.current?.getLatLng()
        if (!ponto) return
        veioDoMapa.current = true
        marcar(ponto.lat, ponto.lng)
      })
    } else {
      pino.current.setLatLng(posicao)
    }

    if (veioDoMapa.current) {
      // Clique ou arrasto: o usuário está olhando para o lugar certo, mexer no
      // enquadramento aqui seria tirar o mapa da mão dele.
      veioDoMapa.current = false
    } else {
      // Veio da busca (ou de um cadastro que já tinha coordenadas): aproxima,
      // senão o pino fica perdido no mapa do Brasil inteiro.
      instancia.setView(posicao, Math.max(instancia.getZoom(), ZOOM_ENDERECO))
    }
  }, [lat, lng, temPonto])

  /* --- Busca --------------------------------------------------------- */
  async function buscar() {
    // O que se digita no endereço já é a busca; cidade e bairro afinam o termo.
    const texto = [termo || valores.endereco, valores.bairro, valores.cidade].filter((p) => p && p.trim()).join(', ')
    if (texto.trim().length < 3) {
      setErroBusca('Escreva o endereço (ou pelo menos a rua e a cidade) para buscar')
      return
    }

    setBuscando(true)
    setErroBusca(null)
    try {
      const resposta = await api.buscarEndereco(texto)
      setResultados(resposta.resultados)
      if (resposta.resultados.length === 1) escolher(resposta.resultados[0])
    } catch (falha) {
      setResultados(null)
      setErroBusca(mensagemDoErro(falha, 'Não foi possível buscar o endereço agora'))
    } finally {
      setBuscando(false)
    }
  }

  /** Um resultado escolhido preenche o endereço inteiro de uma vez. */
  function escolher(item: EnderecoEncontrado) {
    onAplicar({
      endereco: item.endereco ?? valores.endereco,
      bairro: item.bairro ?? valores.bairro,
      cidade: item.cidade ?? valores.cidade,
      latitude: paraTexto(item.latitude),
      longitude: paraTexto(item.longitude),
    })
    setResultados(null)
    setTermo('')
  }

  const escolhido =
    resultados?.find(
      (item) => paraTexto(item.latitude) === valores.latitude && paraTexto(item.longitude) === valores.longitude,
    ) ?? null

  return (
    <div className="local">
      <div className="grade grade--2">
        <Campo rotulo="Cidade">{entrada('cidade', { placeholder: 'Ex.: Curitiba' })}</Campo>
        <Campo rotulo="Bairro">{entrada('bairro', { placeholder: 'Ex.: Batel' })}</Campo>

        <Campo rotulo="Endereço" dica="rua, número e complemento" className="col-inteira">
          <div className="local__busca">
            {entrada('endereco', {
              placeholder: 'Ex.: Rua Comendador Araújo, 100',
              onKeyDown: (evento: React.KeyboardEvent<HTMLInputElement>) => {
                if (evento.key === 'Enter') {
                  evento.preventDefault()
                  void buscar()
                }
              },
            })}
            <button
              type="button"
              className="btn btn--secundario"
              onClick={() => void buscar()}
              disabled={buscando}
              title="Achar este endereço no mapa e preencher as coordenadas"
            >
              <Icone nome={buscando ? 'spinner' : 'busca'} tamanho={15} className={buscando ? 'girando' : undefined} />
              {buscando ? 'Buscando…' : 'Buscar no mapa'}
            </button>
          </div>
        </Campo>
      </div>

      {erroBusca && (
        <p className="campo__dica linha-calculo linha-calculo--alerta">
          <Icone nome="alerta" tamanho={12} /> {erroBusca}
          <button type="button" className="link-acao" onClick={() => setVerCoordenadas(true)}>
            Informar as coordenadas à mão
          </button>
        </p>
      )}

      {resultados !== null && resultados.length === 0 && !erroBusca && (
        <p className="campo__dica linha-calculo">
          <Icone nome="info" tamanho={12} /> Nenhum endereço encontrado. Tente sem o número, ou clique no ponto certo
          direto no mapa.
        </p>
      )}

      {resultados !== null && resultados.length > 0 && (
        <ul className="local__resultados">
          {resultados.map((item) => {
            const ativo = escolhido === item
            return (
              <li key={`${item.latitude},${item.longitude}`}>
                <button
                  type="button"
                  className={`local__resultado${ativo ? ' local__resultado--ativo' : ''}`}
                  onClick={() => escolher(item)}
                >
                  <Icone nome={ativo ? 'check' : 'pino'} tamanho={14} />
                  <span>
                    <strong>{item.endereco ?? item.rotulo}</strong>
                    <span className="local__resultado__linha">
                      {[item.bairro, item.cidade, item.estado].filter(Boolean).join(' · ')}
                      {item.cep ? ` · ${item.cep}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="local__mapa-area">
        <div ref={caixaDoMapa} className="local__mapa" />
        <div className={`local__estado${temPonto ? ' local__estado--marcado' : ''}`}>
          {temPonto ? (
            <>
              <Icone nome="check" tamanho={14} />
              <span>
                <strong>Marcado no mapa.</strong> Arraste o pino para ajustar a posição exata.
              </span>
            </>
          ) : (
            <>
              <Icone nome="pino" tamanho={14} />
              <span>
                <strong>Ainda sem ponto no mapa.</strong> Busque o endereço acima ou clique no lugar certo aqui no
                mapa — sem isso o empreendimento é cadastrado, mas não aparece no mapa.
              </span>
            </>
          )}
        </div>
      </div>

      <div className="local__coordenadas">
        <button type="button" className="link-acao" onClick={() => setVerCoordenadas((v) => !v)}>
          <Icone nome={verCoordenadas ? 'seta_cima' : 'seta_baixo'} tamanho={12} />
          {verCoordenadas ? 'Ocultar as coordenadas' : 'Ajustar as coordenadas à mão'}
        </button>

        {temPonto && !verCoordenadas && (
          <span className="campo__dica">
            {valores.latitude}, {valores.longitude}
          </span>
        )}

        {temPonto && (
          <button
            type="button"
            className="link-acao link-acao--perigo"
            onClick={() => onAplicar({ latitude: '', longitude: '' })}
          >
            Limpar o ponto
          </button>
        )}
      </div>

      {verCoordenadas && (
        <div className="grade grade--2" style={{ marginTop: 'var(--e3)' }}>
          <Campo rotulo="Latitude" dica="entre -90 e 90" erro={erros.latitude}>
            {entrada('latitude', { placeholder: '-25.4284', inputMode: 'decimal' })}
          </Campo>
          <Campo rotulo="Longitude" dica="entre -180 e 180" erro={erros.longitude}>
            {entrada('longitude', { placeholder: '-49.2733', inputMode: 'decimal' })}
          </Campo>
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { IndicadorMercado, RespostaIndicadores } from '../types'
import { api } from '../lib/api'
import { Icone } from './Icones'

/**
 * A faixa de indicadores economicos do cabecalho.
 *
 * Os dados vem da nossa API (que fala com o SGS do Banco Central e guarda o
 * resultado). Aqui so ficam a apresentacao e a revalidacao: o componente
 * pergunta ao abrir e de meia em meia hora — quem decide se vale consultar o
 * Banco Central de novo e o servidor.
 */

/** De quanto em quanto tempo a aba aberta pergunta de novo. */
const INTERVALO_MS = 30 * 60 * 1000

const moeda = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
const percentual = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const variacaoCurta = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function valorDoIndicador(indicador: IndicadorMercado): string {
  return indicador.formato === 'moeda'
    ? `R$ ${moeda.format(indicador.valor)}`
    : `${percentual.format(indicador.valor)}%`
}

/**
 * "+0,20%" para variacao relativa, "−0,25 p.p." para diferenca de taxa.
 *
 * Movimento menor que a casa exibida vira "estável": a TR oscila na quarta
 * casa e o cartao mostrava "−0,00 p.p.", que nao quer dizer nada.
 */
function textoDaVariacao(indicador: IndicadorMercado): string | null {
  if (indicador.variacao === null) return null
  if (indicador.tendencia === 'estavel') return 'estável'

  const sinal = indicador.variacao > 0 ? '+' : '−'
  const numero = variacaoCurta.format(Math.abs(indicador.variacao))
  return indicador.variacaoEm === 'percentual' ? `${sinal}${numero}%` : `${sinal}${numero} p.p.`
}

/** "06/08/2026, 09:54" a partir do ISO que a API carimba. */
function textoDaAtualizacao(iso: string | null): string | null {
  if (!iso) return null
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return null
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Cartao({ indicador }: { indicador: IndicadorMercado }) {
  const variacao = textoDaVariacao(indicador)
  const seta = indicador.tendencia === 'alta' ? '↑' : indicador.tendencia === 'baixa' ? '↓' : '→'

  return (
    <article className="indicador" title={`${indicador.descricao} · leitura de ${indicador.referencia}`}>
      <div className="indicador__topo">
        <span className="indicador__nome">{indicador.nome}</span>
        <span className="indicador__periodo">{indicador.unidade}</span>
      </div>

      <div className="indicador__linha">
        <span className="indicador__valor">{valorDoIndicador(indicador)}</span>
        {variacao && (
          <span className={`indicador__variacao indicador__variacao--${indicador.tendencia}`}>
            <span aria-hidden="true">{seta}</span>
            {variacao}
          </span>
        )}
      </div>

      <span className="indicador__rodape">
        {indicador.acumulado12 !== null
          ? `${percentual.format(indicador.acumulado12)}% em 12 meses`
          : indicador.referencia}
      </span>
    </article>
  )
}

/** Enquanto os numeros nao chegam, o espaco ja fica reservado. */
function Esqueleto() {
  return (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="indicador indicador--esqueleto" aria-hidden="true">
          <div className="indicador__topo">
            <span className="esqueleto esqueleto--curto" />
          </div>
          <span className="esqueleto esqueleto--largo" />
          <span className="esqueleto esqueleto--curto" />
        </div>
      ))}
    </>
  )
}

export function IndicadoresMercado() {
  const [dados, setDados] = useState<RespostaIndicadores | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  // Evita `setState` depois que o componente saiu (troca de tela no meio).
  const vivo = useRef(true)

  const carregar = useCallback(async (forcar = false) => {
    setCarregando(true)
    try {
      const resposta = await api.indicadores(forcar)
      if (!vivo.current) return
      setDados(resposta)
      // A API responde 200 mesmo sem conseguir falar com o Banco Central: o
      // que diz que deu errado e o par `stale` + `erro`.
      setErro(resposta.indicadores.length === 0 ? resposta.erro ?? 'Indicadores indisponíveis' : null)
    } catch (falha) {
      if (!vivo.current) return
      setErro(falha instanceof Error ? falha.message : 'Falha ao buscar os indicadores')
    } finally {
      if (vivo.current) setCarregando(false)
    }
  }, [])

  useEffect(() => {
    vivo.current = true
    void carregar()
    const timer = window.setInterval(() => void carregar(), INTERVALO_MS)
    return () => {
      vivo.current = false
      window.clearInterval(timer)
    }
  }, [carregar])

  const atualizadoEm = textoDaAtualizacao(dados?.atualizadoEm ?? null)
  const semDados = !dados || dados.indicadores.length === 0

  return (
    <section className="indicadores" aria-label="Indicadores de mercado">
      <div className="indicadores__faixa">
        {carregando && semDados ? (
          <Esqueleto />
        ) : erro && semDados ? (
          <div className="indicadores__erro">
            <Icone nome="alerta" tamanho={14} />
            <span>{erro}</span>
          </div>
        ) : (
          dados?.indicadores.map((indicador) => <Cartao key={indicador.chave} indicador={indicador} />)
        )}
      </div>

      <div className="indicadores__rodape">
        {atualizadoEm && (
          <span className={`indicadores__carimbo${dados?.stale ? ' indicadores__carimbo--velho' : ''}`}>
            {dados?.stale && <Icone nome="alerta" tamanho={11} />}
            {dados?.stale ? `sem conexão — dados de ${atualizadoEm}` : `atualizado em ${atualizadoEm}`}
          </span>
        )}
        <button
          type="button"
          className="btn btn--fantasma btn--icone"
          onClick={() => void carregar(true)}
          disabled={carregando}
          title="Atualizar os indicadores agora"
        >
          <Icone nome={carregando ? 'spinner' : 'atualizar'} tamanho={14} className={carregando ? 'girando' : ''} />
        </button>
      </div>
    </section>
  )
}

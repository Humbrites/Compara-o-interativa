import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Empreendimento, EmpreendimentoInput, Filtros, ImagemEmpreendimento } from './types'
import { FILTROS_VAZIOS } from './types'
import { api } from './lib/api'
import { aplicarFiltros, calcularIndicadores } from './lib/dashboard'
import { Mapa } from './components/Mapa'
import { Kpis } from './components/Kpis'
import { BarraFiltros } from './components/BarraFiltros'
import { PainelDetalhe } from './components/PainelDetalhe'
import { FormEmpreendimento } from './components/FormEmpreendimento'
import { Comparativo } from './components/Comparativo'
import { ListaEmpreendimentos } from './components/ListaEmpreendimentos'
import { Icone } from './components/Icones'
import { Carregando, Estado, Toasts, type Aviso } from './components/ui'

interface EstadoForm {
  empreendimento: Empreendimento | null
  iniciarEmFluxos?: boolean
}

export default function App() {
  const [lista, setLista] = useState<Empreendimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState<string | null>(null)

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)
  const [selecionadoA, setSelecionadoA] = useState<number | null>(null)
  const [selecionadoB, setSelecionadoB] = useState<number | null>(null)

  const [form, setForm] = useState<EstadoForm | null>(null)
  const [comparando, setComparando] = useState(false)
  const [vendoLista, setVendoLista] = useState(false)

  const [avisos, setAvisos] = useState<Aviso[]>([])
  const proximoAviso = useRef(1)

  /* --- Avisos ------------------------------------------------------------ */
  const avisar = useCallback((texto: string, tipo: 'sucesso' | 'erro' = 'sucesso') => {
    const id = proximoAviso.current++
    setAvisos((atual) => [...atual, { id, texto, tipo }])
    window.setTimeout(() => setAvisos((atual) => atual.filter((a) => a.id !== id)), 3600)
  }, [])

  /* --- Carga ------------------------------------------------------------- */
  const carregar = useCallback(async () => {
    try {
      const dados = await api.listar()
      setLista(dados)
      setErroCarga(null)
    } catch (erro) {
      setErroCarga(erro instanceof Error ? erro.message : 'Falha ao carregar os dados')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  /* --- Derivados --------------------------------------------------------- */
  const filtrados = useMemo(() => aplicarFiltros(lista, filtros), [lista, filtros])
  const indicadores = useMemo(() => calcularIndicadores(filtrados), [filtrados])

  const empreendimentoA = useMemo(
    () => lista.find((e) => e.id === selecionadoA) ?? null,
    [lista, selecionadoA],
  )
  const empreendimentoB = useMemo(
    () => lista.find((e) => e.id === selecionadoB) ?? null,
    [lista, selecionadoB],
  )

  /* --- Acoes ------------------------------------------------------------- */
  function selecionar(id: number) {
    setSelecionadoA(id)
    if (selecionadoB === id) setSelecionadoB(null)
  }

  async function salvarEmpreendimento(dados: EmpreendimentoInput): Promise<Empreendimento> {
    const editando = form?.empreendimento ?? null
    const resultado = editando ? await api.editar(editando.id, dados) : await api.criar(dados)

    setLista((atual) => {
      const proxima = editando
        ? atual.map((e) => (e.id === resultado.id ? { ...resultado, fluxos: e.fluxos } : e))
        : [...atual, resultado]
      return proxima.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    })

    setSelecionadoA(resultado.id)
    // O modal segue aberto na etapa 2, entao passa a editar o registro salvo.
    setForm((atual) => (atual ? { ...atual, empreendimento: resultado } : atual))
    return resultado
  }

  async function excluirEmpreendimento(e: Empreendimento) {
    if (!window.confirm(`Excluir "${e.nome}"? Os fluxos de pagamento dele também serão removidos.`)) return

    try {
      await api.excluir(e.id)
      setLista((atual) => atual.filter((item) => item.id !== e.id))
      if (selecionadoA === e.id) setSelecionadoA(null)
      if (selecionadoB === e.id) setSelecionadoB(null)
      avisar('Empreendimento excluído')
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao excluir', 'erro')
    }
  }

  function irPara(id: number) {
    setSelecionadoA(id)
  }

  /** A galeria muda dentro do modal; o painel e as listas acompanham na hora. */
  function atualizarImagens(id: number, imagens: ImagemEmpreendimento[]) {
    setLista((atual) => atual.map((e) => (e.id === id ? { ...e, imagens } : e)))
  }

  /* --- Render ------------------------------------------------------------ */
  return (
    <div className="app">
      <header className="topo">
        <div className="topo__marca">
          <div className="topo__logo">
            <Icone nome="camadas" tamanho={19} espessura={2} />
          </div>
          <div>
            <div className="topo__titulo">Compara Interativa</div>
            <div className="topo__sub">Empreendimentos no mapa · comercial e marketing</div>
          </div>
        </div>

        <div className="topo__acoes">
          {empreendimentoA && lista.length > 1 && (
            <button
              type="button"
              className="btn btn--secundario"
              onClick={() => setComparando(true)}
              title="Comparar o empreendimento selecionado com outro"
            >
              <Icone nome="balanca" tamanho={15} />
              <span>Comparar</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn--primario"
            onClick={() => setForm({ empreendimento: null })}
            title="Adicionar empreendimento"
          >
            <Icone nome="mais" tamanho={16} />
            <span>Adicionar empreendimento</span>
          </button>
        </div>
      </header>

      <div className="corpo">
        <div className="coluna-mapa">
          {!carregando && !erroCarga && lista.length > 0 && (
            <>
              <Kpis indicadores={indicadores} onIrPara={irPara} onVerLista={() => setVendoLista(true)} />
              <BarraFiltros filtros={filtros} onMudar={setFiltros} lista={lista} totalFiltrado={filtrados.length} />
            </>
          )}

          {carregando ? (
            <div className="mapa-area" style={{ display: 'grid', placeItems: 'center' }}>
              <Carregando texto="Carregando empreendimentos…" />
            </div>
          ) : erroCarga ? (
            <div className="mapa-area" style={{ display: 'grid', placeItems: 'center' }}>
              <Estado
                icone="alerta"
                variante="erro"
                titulo="Não foi possível carregar os dados"
                texto={`${erroCarga}. Verifique se a API está rodando (npm run dev) e tente novamente.`}
                acao={
                  <button
                    type="button"
                    className="btn btn--secundario"
                    onClick={() => {
                      setCarregando(true)
                      void carregar()
                    }}
                  >
                    Tentar de novo
                  </button>
                }
              />
            </div>
          ) : lista.length === 0 ? (
            <div className="mapa-area" style={{ display: 'grid', placeItems: 'center' }}>
              <Estado
                icone="predio"
                titulo="Nenhum empreendimento cadastrado"
                texto="Comece adicionando o primeiro empreendimento: preencha os dados, informe latitude e longitude para ele aparecer no mapa e depois cadastre os fluxos de pagamento."
                acao={
                  <button type="button" className="btn btn--primario" onClick={() => setForm({ empreendimento: null })}>
                    <Icone nome="mais" tamanho={16} />
                    Adicionar empreendimento
                  </button>
                }
              />
            </div>
          ) : (
            <Mapa
              lista={filtrados}
              selecionadoA={selecionadoA}
              selecionadoB={selecionadoB}
              onSelecionar={selecionar}
            />
          )}
        </div>

        {empreendimentoA && (
          <aside className="coluna-painel">
            <PainelDetalhe
              empreendimento={empreendimentoA}
              podeComparar={lista.length > 1}
              onEditar={() => setForm({ empreendimento: empreendimentoA })}
              onExcluir={() => void excluirEmpreendimento(empreendimentoA)}
              onAdicionarFluxo={() => setForm({ empreendimento: empreendimentoA, iniciarEmFluxos: true })}
              onCompararCom={() => setComparando(true)}
              onFechar={() => {
                setSelecionadoA(null)
                setSelecionadoB(null)
              }}
            />
          </aside>
        )}
      </div>

      {form && (
        <FormEmpreendimento
          empreendimento={form.empreendimento}
          iniciarEmFluxos={form.iniciarEmFluxos}
          onFechar={() => {
            setForm(null)
            void carregar()
          }}
          onSalvar={salvarEmpreendimento}
          onMudouFluxos={() => void carregar()}
          onMudouImagens={atualizarImagens}
          avisar={avisar}
        />
      )}

      {vendoLista && (
        <ListaEmpreendimentos
          lista={lista}
          selecionado={selecionadoA}
          onSelecionar={(id) => {
            selecionar(id)
            setVendoLista(false)
          }}
          onEditar={(e) => {
            setVendoLista(false)
            setForm({ empreendimento: e })
          }}
          onExcluir={(e) => void excluirEmpreendimento(e)}
          onAdicionar={() => {
            setVendoLista(false)
            setForm({ empreendimento: null })
          }}
          onFechar={() => setVendoLista(false)}
        />
      )}

      {comparando && empreendimentoA && (
        <Comparativo
          a={empreendimentoA}
          b={empreendimentoB}
          lista={lista}
          onEscolherB={(id) => setSelecionadoB(id)}
          onTrocarLados={() => {
            setSelecionadoA(selecionadoB)
            setSelecionadoB(selecionadoA)
          }}
          onFechar={() => setComparando(false)}
        />
      )}

      <Toasts avisos={avisos} />
    </div>
  )
}

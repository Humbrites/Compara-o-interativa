import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Empreendimento, EmpreendimentoInput, Filtros, ImagemEmpreendimento, Unidade } from './types'
import { FILTROS_VAZIOS } from './types'
import { api } from './lib/api'
import { aplicarFiltros } from './lib/dashboard'
import { Mapa } from './components/Mapa'
import { IndicadoresMercado } from './components/IndicadoresMercado'
import { BarraFiltros } from './components/BarraFiltros'
import { PainelDetalhe } from './components/PainelDetalhe'
import { FormEmpreendimento } from './components/FormEmpreendimento'
import { Comparativo } from './components/Comparativo'
import { CompararUnidades } from './components/CompararUnidades'
import { ListaEmpreendimentos } from './components/ListaEmpreendimentos'
import { CalculadoraCub } from './components/CalculadoraCub'
import { SimuladorInvestimento } from './components/SimuladorInvestimento'
import { Icone } from './components/Icones'
import { Carregando, Estado, Toasts, type Aviso } from './components/ui'
import { MenuUsuario } from './components/MenuUsuario'
import { PainelConta } from './components/PainelConta'
import { PainelPlataforma } from './components/PainelPlataforma'
import { mensagemDoErro } from './lib/http'
import { ProvedorDeEdicao } from './lib/permissao'
import { plataforma } from './lib/plataforma'
import { ehSessaoDeCliente, type Sessao, type SessaoDoDashboard } from './lib/acesso'

interface EstadoForm {
  empreendimento: Empreendimento | null
  iniciarEmUnidades?: boolean
}

interface AppProps {
  /**
   * Quem tem conta: o cliente na base dele, ou o master vendo o sistema como
   * usuário de uma conta (para apresentar sem entrar no login de ninguém).
   */
  sessao: SessaoDoDashboard
  aoMudarSessao: (sessao: Sessao) => void
  aoSair: () => Promise<void>
}

export default function App({ sessao, aoMudarSessao, aoSair }: AppProps) {
  const [lista, setLista] = useState<Empreendimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState<string | null>(null)

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)
  const [selecionadoA, setSelecionadoA] = useState<number | null>(null)
  const [selecionadoB, setSelecionadoB] = useState<number | null>(null)

  const [form, setForm] = useState<EstadoForm | null>(null)
  const [comparando, setComparando] = useState(false)
  const [comparandoUnidades, setComparandoUnidades] = useState(false)
  const [vendoLista, setVendoLista] = useState(false)
  const [calculandoCub, setCalculandoCub] = useState<Empreendimento | null>(null)
  // false = fechado; null = aberto sem imovel; id = aberto com aquele imovel.
  const [simulandoInvestimento, setSimulandoInvestimento] = useState<false | number | null>(false)

  const [avisos, setAvisos] = useState<Aviso[]>([])
  const proximoAviso = useRef(1)

  // Conta que exige 2FA e usuario sem 2FA: o painel de seguranca abre sozinho,
  // porque ate configurar ele nao consegue gravar nada mesmo.
  const [painelConta, setPainelConta] = useState<false | 'equipe' | 'seguranca'>(
    sessao.precisaConfigurar2fa ? 'seguranca' : false,
  )
  const [painelPlataforma, setPainelPlataforma] = useState(false)
  const [saindoDaVisao, setSaindoDaVisao] = useState(false)

  /**
   * O master vendo o sistema como usuário. A tela é a MESMA do cliente de
   * propósito — mudar o que ele vê tiraria da apresentação justamente o que
   * está sendo apresentado. O que muda é a faixa do topo e, fora da conta de
   * demonstração, o fato de nada gravar.
   */
  const visita = sessao.verComo ?? null

  /**
   * Uma fonte só para "esta tela grava?": conta suspensa, 2FA pendente e visita
   * a cliente caem todas aqui. Sem isso, o botão existiria para o clique
   * terminar em 402/403 — que é pior do que não ter botão.
   */
  const podeEditar = !sessao.conta.somenteLeitura && !sessao.precisaConfigurar2fa

  /**
   * Conta, equipe e segurança são de quem PERTENCE ao cliente. Na visita quem
   * está logado é o master: as duas telas não se aplicam a ele, e é o próprio
   * TypeScript que cobra isso aqui.
   */
  const sessaoDeCliente = ehSessaoDeCliente(sessao) ? sessao : null

  /* --- Avisos ------------------------------------------------------------ */
  const avisar = useCallback((texto: string, tipo: 'sucesso' | 'erro' = 'sucesso') => {
    const id = proximoAviso.current++
    setAvisos((atual) => [...atual, { id, texto, tipo }])
    window.setTimeout(() => setAvisos((atual) => atual.filter((a) => a.id !== id)), 3600)
  }, [])

  /** Devolve o master para a administração dos clientes. */
  const voltarParaAdministracao = useCallback(async () => {
    setSaindoDaVisao(true)
    try {
      // Sem zerar o estado no sucesso: a sessão nova troca a tela inteira e
      // este componente sai do ar junto.
      aoMudarSessao(await plataforma.sairDaVisao())
    } catch (erro) {
      avisar(mensagemDoErro(erro, 'Não foi possível voltar para a administração'), 'erro')
      setSaindoDaVisao(false)
    }
  }, [aoMudarSessao, avisar])

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

  /** Comparar unidades só faz sentido com mais de uma na base inteira. */
  const totalDeUnidades = useMemo(() => lista.reduce((soma, e) => soma + e.unidades.length, 0), [lista])

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
    if (!window.confirm(`Excluir "${e.nome}"? As unidades, os fluxos de pagamento e as fotos dele também serão removidos.`)) return

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

  /** A galeria muda dentro do modal; o painel e as listas acompanham na hora. */
  function atualizarImagens(id: number, imagens: ImagemEmpreendimento[]) {
    setLista((atual) => atual.map((e) => (e.id === id ? { ...e, imagens } : e)))
  }

  /** Mesma coisa para as unidades (e os fluxos que moram dentro delas). */
  function atualizarUnidades(id: number, unidades: Unidade[]) {
    setLista((atual) => atual.map((e) => (e.id === id ? { ...e, unidades } : e)))
  }

  /* --- Render ------------------------------------------------------------ */
  return (
    <ProvedorDeEdicao pode={podeEditar}>
    <div className="app">
      {/* Topo enxuto: a marca, o caminho para os empreendimentos, o cadastro
          e os indicadores de mercado. Comparar e simular investimento moram
          no painel do imovel — e la que a decisao acontece. */}
      <header className="topo">
        <div className="topo__linha">
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
            <button
              type="button"
              className="btn btn--secundario"
              onClick={() => setVendoLista(true)}
              title="Abrir a lista de empreendimentos cadastrados"
            >
              <Icone nome="predio" tamanho={15} />
              <span>Empreendimentos</span>
              {lista.length > 0 && <span className="btn__contador">{lista.length}</span>}
            </button>

            {/* Comparar unidades ATRAVESSA os empreendimentos — por isso mora
                aqui em cima, e não só dentro do painel de um imóvel. */}
            {totalDeUnidades > 1 && (
              <button
                type="button"
                className="btn btn--secundario"
                onClick={() => setComparandoUnidades(true)}
                title="Comparar unidades lado a lado, de qualquer empreendimento"
              >
                <Icone nome="balanca" tamanho={15} />
                <span>Comparar unidades</span>
              </button>
            )}

            {podeEditar && (
              <button
                type="button"
                className="btn btn--primario"
                onClick={() => setForm({ empreendimento: null })}
                title="Adicionar empreendimento"
              >
                <Icone nome="mais" tamanho={16} />
                <span>Adicionar empreendimento</span>
              </button>
            )}

            {/* Na visita, o menu do usuário sairia do lugar: conta, equipe e
                segurança são do CLIENTE, e quem está logado é o master. A
                única saída que interessa aqui é voltar para a administração. */}
            {visita ? (
              <button
                type="button"
                className="btn btn--secundario"
                onClick={() => void voltarParaAdministracao()}
                disabled={saindoDaVisao}
              >
                <Icone
                  nome={saindoDaVisao ? 'spinner' : 'seta_esquerda'}
                  tamanho={15}
                  className={saindoDaVisao ? 'girando' : undefined}
                />
                <span>{saindoDaVisao ? 'Voltando…' : 'Voltar à administração'}</span>
              </button>
            ) : (
              sessaoDeCliente && (
                <MenuUsuario
                  sessao={sessaoDeCliente}
                  onAbrirConta={() => setPainelConta('equipe')}
                  onAbrirSeguranca={() => setPainelConta('seguranca')}
                  onAbrirPlataforma={() => setPainelPlataforma(true)}
                  onSair={aoSair}
                />
              )
            )}
          </div>
        </div>

        {/* Nunca deixar dúvida sobre de quem é a base que está na tela: numa
            apresentação, o operador precisa saber de relance se o que ele
            clicar grava — e em qual conta. */}
        {visita && (
          <div className={`faixa-topo faixa-topo--visita${visita.podeGravar ? ' faixa-topo--visita-grava' : ''}`} role="status">
            <Icone nome={visita.podeGravar ? 'camadas' : 'info'} tamanho={15} />
            <span>
              Você está vendo o sistema como usuário de <strong>{visita.conta}</strong>
              {visita.podeGravar
                ? ' — base de demonstração: o que você cadastrar aqui fica gravado.'
                : ' — somente leitura: nada do que você fizer altera a base deste cliente.'}
            </span>
            <button
              type="button"
              className="btn btn--pequeno btn--secundario"
              onClick={() => void voltarParaAdministracao()}
              disabled={saindoDaVisao}
            >
              {saindoDaVisao ? 'Voltando…' : 'Sair da visualização'}
            </button>
          </div>
        )}

        {/* Duas faixas que mudam o que dá para fazer na tela — por isso ficam
            no topo, e não escondidas dentro do painel de conta. */}
        {sessao.precisaConfigurar2fa && (
          <div className="faixa-topo faixa-topo--forte" role="status">
            <Icone nome="escudo" tamanho={15} />
            <span>
              <strong>{sessao.conta.nome}</strong> exige verificação em duas etapas. Até configurar, você consulta mas
              não grava.
            </span>
            <button type="button" className="btn btn--pequeno btn--secundario" onClick={() => setPainelConta('seguranca')}>
              Configurar agora
            </button>
          </div>
        )}

        {/* Na visita a faixa acima já explicou por que nada grava — e dizer
            "a conta está suspensa" ali seria mentira sobre o cliente. */}
        {sessao.conta.somenteLeitura && !sessao.precisaConfigurar2fa && !visita && (
          <div className="faixa-topo" role="status">
            <Icone nome="alerta" tamanho={15} />
            <span>
              A conta está suspensa — seus dados seguem aqui para consulta, mas não é possível gravar. Fale com o
              suporte para reativar.
            </span>
          </div>
        )}

        <IndicadoresMercado />
      </header>

      <div className="corpo">
        <div className="coluna-mapa">
          {!carregando && !erroCarga && lista.length > 0 && (
            <BarraFiltros filtros={filtros} onMudar={setFiltros} lista={lista} totalFiltrado={filtrados.length} />
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
                texto={
                  podeEditar
                    ? 'Comece adicionando o primeiro empreendimento: preencha os dados, informe latitude e longitude para ele aparecer no mapa e depois cadastre os fluxos de pagamento.'
                    : 'Esta conta ainda não cadastrou nenhum empreendimento — não há nada para mostrar no mapa.'
                }
                acao={
                  podeEditar ? (
                    <button
                      type="button"
                      className="btn btn--primario"
                      onClick={() => setForm({ empreendimento: null })}
                    >
                      <Icone nome="mais" tamanho={16} />
                      Adicionar empreendimento
                    </button>
                  ) : undefined
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
              lista={lista}
              podeComparar={lista.length > 1}
              onEditar={() => setForm({ empreendimento: empreendimentoA })}
              onExcluir={() => void excluirEmpreendimento(empreendimentoA)}
              onAdicionarUnidade={() => setForm({ empreendimento: empreendimentoA, iniciarEmUnidades: true })}
              onCalcularCub={() => setCalculandoCub(empreendimentoA)}
              onSimularInvestimento={() => setSimulandoInvestimento(empreendimentoA.id)}
              onCompararCom={() => setComparando(true)}
              onMudouUnidades={(unidades) => atualizarUnidades(empreendimentoA.id, unidades)}
              onMudouFluxosGerais={(fluxos) =>
                setLista((atual) => atual.map((e) => (e.id === empreendimentoA.id ? { ...e, fluxos } : e)))
              }
              avisar={avisar}
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
          iniciarEmUnidades={form.iniciarEmUnidades}
          onFechar={() => {
            setForm(null)
            void carregar()
          }}
          onSalvar={salvarEmpreendimento}
          onMudouImagens={atualizarImagens}
          onMudouUnidades={atualizarUnidades}
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

      {comparandoUnidades && lista.length > 0 && (
        <CompararUnidades
          lista={lista}
          empreendimentoInicial={empreendimentoA ?? lista.find((e) => e.unidades.length > 0) ?? lista[0]}
          onFechar={() => setComparandoUnidades(false)}
        />
      )}

      {simulandoInvestimento !== false && (
        <SimuladorInvestimento
          lista={lista}
          empreendimentoInicial={simulandoInvestimento}
          onFechar={() => setSimulandoInvestimento(false)}
          avisar={avisar}
        />
      )}

      {/* Calculadora do empreendimento: so simula. Virar fluxo de pagamento e
          coisa da unidade — o CUB de dentro dela e que grava. */}
      {calculandoCub && (
        <CalculadoraCub titulo={calculandoCub.nome} onFechar={() => setCalculandoCub(null)} avisar={avisar} />
      )}

      {painelConta !== false && sessaoDeCliente && (
        <PainelConta
          sessao={sessaoDeCliente}
          abaInicial={painelConta}
          aoMudarSessao={aoMudarSessao}
          avisar={avisar}
          onFechar={() => setPainelConta(false)}
        />
      )}

      {painelPlataforma && <PainelPlataforma avisar={avisar} onFechar={() => setPainelPlataforma(false)} />}

      <Toasts avisos={avisos} />
    </div>
    </ProvedorDeEdicao>
  )
}

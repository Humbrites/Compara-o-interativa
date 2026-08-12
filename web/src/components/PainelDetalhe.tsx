import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Empreendimento, FluxoPagamento, Unidade } from '../types'
import { api } from '../lib/api'
import {
  fmtArea,
  fmtEntrega,
  fmtFaixaInteiro,
  fmtFaixaMetragem,
  fmtFaixaMoeda,
  fmtInteiro,
  fmtMoeda,
  fmtTexto,
  TRACO,
} from '../lib/format'
import { corDoStatus } from '../lib/opcoes'
import { fotosDe } from '../lib/imagens'
import { usePodeEditar } from '../lib/permissao'
import { precoDaUnidade, resumoUnidades, rotuloUnidade } from '../lib/unidades'
import { Icone, type NomeIcone } from './Icones'
import { CartaoFluxo } from './CartaoFluxo'
import { CartaoUnidade } from './CartaoUnidade'
import { AnaliseUnidade } from './AnaliseUnidade'
import { FluxosDoEmpreendimento, fluxoParaEnvio, fluxoParaFormulario } from './FormFluxos'
import { Galeria } from './Galeria'
import { Selo } from './ui'

/**
 * O painel do empreendimento.
 *
 * A leitura vai do geral ao detalhe e sempre na mesma ordem: quem é o imóvel,
 * quanto custa, o que fazer com ele e, só então, a ficha e as unidades. O que
 * é secundário (observações, endereço, coordenadas, tabelas do formato antigo)
 * fica em blocos recolhidos — abertos, todos juntos, davam a sensação de
 * excesso que motivou o redesenho.
 */

function ItemFicha({ icone, rotulo, valor }: { icone: NomeIcone; rotulo: string; valor: string }) {
  const vazio = valor === TRACO
  return (
    <div className="ficha__item">
      <span className="ficha__rotulo">
        <Icone nome={icone} tamanho={12} />
        {rotulo}
      </span>
      <span className={`ficha__valor${vazio ? ' ficha__valor--fraco' : ''}`}>{valor}</span>
    </div>
  )
}

/**
 * Bloco recolhível. O cabeçalho é sempre um botão do tamanho da linha inteira
 * (alvo grande de clique) e leva o contador junto — dá para saber o que tem
 * dentro sem abrir.
 */
function Bloco({
  icone,
  titulo,
  contador,
  acao,
  aberto,
  onAlternar,
  children,
}: {
  icone: NomeIcone
  titulo: string
  contador?: number
  acao?: ReactNode
  aberto: boolean
  onAlternar: () => void
  children: ReactNode
}) {
  return (
    <section className={`bloco${aberto ? ' bloco--aberto' : ''}`}>
      <div className="bloco__cabecalho">
        <button type="button" className="bloco__botao" onClick={onAlternar} aria-expanded={aberto}>
          <Icone nome={icone} tamanho={14} />
          <span className="bloco__titulo">{titulo}</span>
          {contador !== undefined && <span className="bloco__contador">{contador}</span>}
          <span className="bloco__seta">
            <Icone nome={aberto ? 'seta_cima' : 'seta_baixo'} tamanho={14} />
          </span>
        </button>
        {acao}
      </div>

      {aberto && <div className="bloco__corpo">{children}</div>}
    </section>
  )
}

interface Props {
  empreendimento: Empreendimento
  podeComparar: boolean
  onEditar: () => void
  onExcluir: () => void
  onAdicionarUnidade: () => void
  onCalcularCub: () => void
  onSimularInvestimento: () => void
  onCompararCom: () => void
  /** O painel edita os fluxos das unidades: a lista de fora acompanha. */
  onMudouUnidades: (unidades: Unidade[]) => void
  /** Sobra do formato antigo: fluxo sem unidade. */
  onMudouFluxosGerais: (fluxos: FluxoPagamento[]) => void
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
  onFechar: () => void
}

export function PainelDetalhe({
  empreendimento: e,
  podeComparar,
  onEditar,
  onExcluir,
  onAdicionarUnidade,
  onCalcularCub,
  onSimularInvestimento,
  onCompararCom,
  onMudouUnidades,
  onMudouFluxosGerais,
  avisar,
  onFechar,
}: Props) {
  // Só leitura (conta suspensa, ou o master vendo a base de um cliente): o
  // painel continua inteiro, o que some é o que gravaria.
  const podeEditar = usePodeEditar()
  const local = [e.bairro, e.cidade].filter(Boolean).join(', ')

  const fotos = useMemo(() => fotosDe(e), [e])
  const resumo = useMemo(() => resumoUnidades(e.unidades), [e.unidades])
  const temUnidades = e.unidades.length > 0
  // A galeria some quando todo link quebra; ai a capa vazia entra no lugar.
  const [galeriaVazia, setGaleriaVazia] = useState(false)
  useEffect(() => setGaleriaVazia(false), [e.id])
  const temCapa = fotos.length > 0 && !galeriaVazia

  // Qual unidade esta com o fluxo de pagamento aberto para edicao.
  const [fluxosAbertos, setFluxosAbertos] = useState<number | null>(null)
  // Qual unidade esta com a analise de oportunidade aberta.
  const [analisando, setAnalisando] = useState<number | null>(null)
  useEffect(() => setAnalisando(null), [e.id])
  useEffect(() => setFluxosAbertos(null), [e.id])
  // Para qual unidade cada tabela antiga vai ser copiada.
  const [destino, setDestino] = useState<Record<number, string>>({})
  const [copiando, setCopiando] = useState<number | null>(null)

  // O que abre por padrao: o que o corretor olha em toda visita.
  const [blocos, setBlocos] = useState({
    ficha: true,
    unidades: true,
    tabelas: false,
    notas: false,
    local: false,
  })
  useEffect(() => setBlocos({ ficha: true, unidades: true, tabelas: false, notas: false, local: false }), [e.id])
  const alternar = (chave: keyof typeof blocos) =>
    setBlocos((atual) => ({ ...atual, [chave]: !atual[chave] }))

  /**
   * O numero que abre a conversa de venda: o preço. Com unidades vale a faixa
   * delas (que já considera o valor guardado na tabela de pagamento); sem
   * unidades, o valor do m² cadastrado no empreendimento.
   */
  const precoPrincipal = temUnidades && resumo.valor.min !== null ? fmtMoeda(resumo.valor.min) : null
  const m2Principal =
    temUnidades && resumo.valorM2.min !== null
      ? fmtFaixaMoeda(resumo.valorM2.min, resumo.valorM2.max)
      : e.valor_m2 !== null
        ? fmtMoeda(e.valor_m2)
        : null

  /** Troca os fluxos de uma unidade sem mexer no resto da lista. */
  function trocarFluxos(unidadeId: number, fluxos: FluxoPagamento[]) {
    onMudouUnidades(e.unidades.map((u) => (u.id === unidadeId ? { ...u, fluxos } : u)))
  }

  /**
   * Tabela geral e formato antigo: em vez de sumir com ela, o painel deixa
   * copiar para a unidade escolhida. A original fica — quem exclui e o usuario.
   */
  async function copiarParaUnidade(fluxo: FluxoPagamento) {
    const unidadeId = Number(destino[fluxo.id])
    const unidade = e.unidades.find((u) => u.id === unidadeId)
    if (!unidade) {
      avisar('Escolha a unidade que recebe a tabela', 'erro')
      return
    }

    setCopiando(fluxo.id)
    try {
      const copia = await api.criarFluxo(fluxoParaEnvio(fluxoParaFormulario(fluxo), e.id, unidade.id))
      trocarFluxos(unidade.id, [...unidade.fluxos, copia])
      setBlocos((atual) => ({ ...atual, unidades: true }))
      setFluxosAbertos(unidade.id)
      avisar(`Tabela copiada para ${rotuloUnidade(unidade)}`)
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao copiar a tabela', 'erro')
    } finally {
      setCopiando(null)
    }
  }

  async function excluirFluxoGeral(fluxo: FluxoPagamento) {
    const nome = fluxo.nome?.trim() || 'esta tabela'
    if (!window.confirm(`Excluir ${nome}? Essa ação não pode ser desfeita.`)) return

    try {
      await api.excluirFluxo(fluxo.id)
      onMudouFluxosGerais(e.fluxos.filter((f) => f.id !== fluxo.id))
      avisar('Tabela excluída')
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao excluir', 'erro')
    }
  }

  return (
    <>
      {/* O nome fica AQUI, no cabeçalho fixo: rolando o painel até as unidades,
          "Empreendimento" não dizia de qual imóvel se estava falando. */}
      <div className="painel__topo">
        <div className="painel__quem">
          <span className="painel__titulo">{e.nome}</span>
          {(e.construtora || e.tipo) && (
            <span className="painel__sub">{[e.construtora, e.tipo].filter(Boolean).join(' · ')}</span>
          )}
        </div>
        <div className="painel__acoes">
          {podeEditar && (
            <>
              <button type="button" className="btn btn--fantasma btn--icone" onClick={onEditar} title="Editar">
                <Icone nome="lapis" tamanho={15} />
              </button>
              <button type="button" className="btn btn--perigo btn--icone" onClick={onExcluir} title="Excluir">
                <Icone nome="lixeira" tamanho={15} />
              </button>
            </>
          )}
          <button type="button" className="btn btn--fantasma btn--icone" onClick={onFechar} title="Fechar painel">
            <Icone nome="fechar" tamanho={16} />
          </button>
        </div>
      </div>

      <div className="painel__conteudo">
        {temCapa && <Galeria key={e.id} fotos={fotos} nome={e.nome} tipo={e.tipo} onVazia={setGaleriaVazia} />}

        {/* Sem foto — ou com todos os links quebrados — o lugar da capa avisa
            em vez de sumir, senao parece que o painel carregou pela metade. */}
        {!temCapa && (
          <div className="capa-vazia">
            <Icone nome="imagem" tamanho={20} />
            <span>Não há fotos disponíveis no momento</span>
          </div>
        )}

        <div className="detalhe">
          {/* 1. Quem é o imóvel. O nome aparece sempre, com ou sem capa: era a
              única informação que mudava de lugar conforme a galeria. */}
          {/* Nome e construtora vivem no cabeçalho fixo — repeti-los aqui,
              logo abaixo, era a mesma informação duas vezes na mesma tela. */}
          <header className="detalhe__cabecalho">
            {local && (
              <div className="detalhe__local">
                <Icone nome="local" tamanho={13} />
                {local}
              </div>
            )}

            <div className="detalhe__selos">
              {e.status_obra && (
                <Selo cor={corDoStatus(e.status_obra)} icone="obra">
                  {e.status_obra}
                </Selo>
              )}
              {e.entrega && (
                <Selo cor="cinza" icone="calendario">
                  Entrega {fmtEntrega(e.entrega)}
                </Selo>
              )}
              {temUnidades && (
                <Selo cor="cinza" icone="predio">
                  {resumo.total} {resumo.total === 1 ? 'unidade' : 'unidades'}
                  {resumo.disponiveis > 0 &&
                    ` · ${resumo.disponiveis} ${resumo.disponiveis === 1 ? 'disponível' : 'disponíveis'}`}
                </Selo>
              )}
            </div>
          </header>

          {/* 2. Quanto custa. Um cartão só, com o número grande e o m² ao lado
              — antes o valor médio do m² aparecia sozinho e o preço da unidade
              ficava perdido lá embaixo, no meio da lista. */}
          {(precoPrincipal || m2Principal) && (
            <div className="preco">
              {precoPrincipal && (
                <div className="preco__bloco">
                  <span className="preco__rotulo">
                    {resumo.valor.max !== null && resumo.valor.max !== resumo.valor.min ? 'A partir de' : 'Valor'}
                  </span>
                  <span className="preco__valor">{precoPrincipal}</span>
                  {resumo.valor.max !== null && resumo.valor.max !== resumo.valor.min && (
                    <span className="preco__dica">até {fmtMoeda(resumo.valor.max)}</span>
                  )}
                </div>
              )}
              {m2Principal && (
                <div className="preco__bloco preco__bloco--secundario">
                  <span className="preco__rotulo">Valor do m²</span>
                  <span className="preco__valor preco__valor--menor">{m2Principal}</span>
                  <span className="preco__dica">{temUnidades ? 'entre as unidades' : 'cadastrado no empreendimento'}</span>
                </div>
              )}
            </div>
          )}

          {/* 3. O que fazer com ele. Três botões iguais não diziam por onde
              começar: comparar é a razão de existir da ferramenta, então é ele
              quem fica em destaque — e vira "Simular investimento" quando não
              há um segundo imóvel para comparar. */}
          <div className="painel__ferramentas">
            {podeComparar ? (
              <>
                <button type="button" className="btn btn--primario" onClick={onCompararCom}>
                  <Icone nome="balanca" tamanho={15} />
                  Comparar
                </button>
                <button type="button" className="btn btn--secundario" onClick={onSimularInvestimento}>
                  <Icone nome="grafico" tamanho={15} />
                  Investimento
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--primario" onClick={onSimularInvestimento}>
                <Icone nome="grafico" tamanho={15} />
                Simular investimento
              </button>
            )}
            <button type="button" className="btn btn--secundario" onClick={onCalcularCub}>
              <Icone nome="cartao" tamanho={15} />
              CUB
            </button>
          </div>

          {/* 4. A ficha. */}
          <Bloco
            icone="lista"
            titulo="Ficha técnica"
            aberto={blocos.ficha}
            onAlternar={() => alternar('ficha')}
          >
            <div className="ficha">
              <ItemFicha
                icone="cama"
                rotulo="Dormitórios"
                valor={
                  temUnidades
                    ? fmtFaixaInteiro(resumo.dormitorios.min, resumo.dormitorios.max)
                    : fmtInteiro(e.dormitorios)
                }
              />
              <ItemFicha icone="predio" rotulo="Suítes" valor={fmtInteiro(e.suites)} />
              <ItemFicha icone="banheira" rotulo="Banheiros" valor={fmtInteiro(e.banheiros)} />
              <ItemFicha
                icone="carro"
                rotulo="Vagas"
                valor={temUnidades ? fmtFaixaInteiro(resumo.vagas.min, resumo.vagas.max) : fmtInteiro(e.vagas)}
              />
              <ItemFicha
                icone="regua"
                rotulo="Metragem"
                valor={
                  temUnidades
                    ? fmtFaixaMetragem(resumo.metragem.min, resumo.metragem.max)
                    : fmtFaixaMetragem(e.metragem_min, e.metragem_max)
                }
              />
              <ItemFicha
                icone="grafico"
                rotulo="Metragem máx."
                valor={temUnidades ? fmtArea(resumo.metragem.max) : fmtArea(e.metragem_max)}
              />
            </div>

            {temUnidades && (
              <p className="campo__dica">
                <Icone nome="info" tamanho={12} /> Dormitórios, vagas e metragem vêm das unidades cadastradas.
              </p>
            )}
          </Bloco>

          {/* 5. As unidades — o que o corretor vende de verdade. */}
          <Bloco
            icone="predio"
            titulo="Unidades"
            contador={temUnidades ? resumo.total : undefined}
            aberto={blocos.unidades}
            onAlternar={() => alternar('unidades')}
            acao={
              podeEditar ? (
                <button type="button" className="btn btn--fantasma btn--pequeno" onClick={onAdicionarUnidade}>
                  <Icone nome="mais" tamanho={13} />
                  Adicionar
                </button>
              ) : undefined
            }
          >
            {!temUnidades ? (
              <div className="observacao">
                Nenhuma unidade cadastrada. Cadastre as plantas (metragem, dormitórios, vagas, posição e preço) e o
                fluxo de pagamento de cada uma para comparar unidade a unidade.
              </div>
            ) : (
              <>
                <div className="resumo-unidades">
                  <div className="resumo-unidades__item">
                    <span className="resumo-unidades__rotulo">Disponíveis</span>
                    <span className="resumo-unidades__valor">
                      {resumo.disponiveis} de {resumo.total}
                    </span>
                  </div>
                  <div className="resumo-unidades__item">
                    <span className="resumo-unidades__rotulo">Valores</span>
                    <span className="resumo-unidades__valor">{fmtFaixaMoeda(resumo.valor.min, resumo.valor.max)}</span>
                  </div>
                  <div className="resumo-unidades__item">
                    <span className="resumo-unidades__rotulo">Valor do m²</span>
                    <span className="resumo-unidades__valor">
                      {fmtFaixaMoeda(resumo.valorM2.min, resumo.valorM2.max)}
                    </span>
                  </div>
                </div>

                {e.unidades.map((unidade, indice) => (
                  <CartaoUnidade
                    key={unidade.id}
                    unidade={unidade}
                    indice={indice}
                    rodape={
                      <>
                        {/* A análise responde "esta unidade é interessante?" —
                            a pergunta que vem antes de abrir a tabela. */}
                        <button
                          type="button"
                          className="btn btn--secundario btn--pequeno"
                          onClick={() => setAnalisando(unidade.id)}
                        >
                          <Icone nome="alvo" tamanho={13} />
                          Analisar
                        </button>

                        {/* O fluxo abre aqui mesmo: e no atendimento que a
                            condicao vira proposta de um cliente. */}
                        <button
                          type="button"
                          className="btn btn--fantasma btn--pequeno"
                          onClick={() => setFluxosAbertos((atual) => (atual === unidade.id ? null : unidade.id))}
                        >
                          <Icone nome={fluxosAbertos === unidade.id ? 'seta_cima' : 'seta_baixo'} tamanho={13} />
                          {unidade.fluxos.length === 0
                            ? 'Fluxo de pagamento'
                            : `Fluxos de pagamento (${unidade.fluxos.length})`}
                        </button>

                        {fluxosAbertos === unidade.id && (
                          <div className="unidade__fluxos">
                            <FluxosDoEmpreendimento
                              empreendimentoId={e.id}
                              unidadeId={unidade.id}
                              titulo={rotuloUnidade(unidade, indice)}
                              valorSugerido={precoDaUnidade(unidade)}
                              fluxos={unidade.fluxos}
                              onMudou={(fluxos) => trocarFluxos(unidade.id, fluxos)}
                              avisar={avisar}
                            />
                          </div>
                        )}
                      </>
                    }
                  />
                ))}
              </>
            )}
          </Bloco>

          {/* Formato antigo: tabela do empreendimento inteiro. So aparece
              enquanto sobrar alguma — o cadastro novo e sempre por unidade. */}
          {e.fluxos.length > 0 && (
            <Bloco
              icone="cartao"
              titulo="Tabelas gerais"
              contador={e.fluxos.length}
              aberto={blocos.tabelas}
              onAlternar={() => alternar('tabelas')}
            >
              <div className="observacao">
                O fluxo de pagamento agora é cadastrado dentro de cada unidade. Estas tabelas vieram do formato
                anterior{podeEditar ? ': copie para a unidade que atende e depois exclua.' : ' e valem para o empreendimento inteiro.'}
              </div>

              {e.fluxos.map((fluxo, indice) => (
                <div key={fluxo.id}>
                  <CartaoFluxo
                    fluxo={fluxo}
                    indice={indice}
                    titulo={e.nome}
                    onExcluir={podeEditar ? () => void excluirFluxoGeral(fluxo) : undefined}
                  />

                  {podeEditar && temUnidades && (
                    <div className="acoes-fluxo" style={{ marginBottom: 'var(--e4)' }}>
                      <select
                        className="entrada"
                        style={{ flex: '1 1 160px' }}
                        value={destino[fluxo.id] ?? ''}
                        onChange={(ev) => setDestino((atual) => ({ ...atual, [fluxo.id]: ev.target.value }))}
                      >
                        <option value="">Copiar para a unidade…</option>
                        {e.unidades.map((unidade, i) => (
                          <option key={unidade.id} value={unidade.id}>
                            {rotuloUnidade(unidade, i)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn--secundario btn--pequeno"
                        onClick={() => void copiarParaUnidade(fluxo)}
                        disabled={!destino[fluxo.id] || copiando === fluxo.id}
                      >
                        {copiando === fluxo.id ? (
                          <>
                            <Icone nome="spinner" tamanho={13} className="girando" />
                            Copiando…
                          </>
                        ) : (
                          <>
                            <Icone nome="mais" tamanho={13} />
                            Copiar
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </Bloco>
          )}

          {e.observacoes && (
            <Bloco
              icone="lista"
              titulo="Observações"
              aberto={blocos.notas}
              onAlternar={() => alternar('notas')}
            >
              <div className="observacao">{e.observacoes}</div>
            </Bloco>
          )}

          {(e.endereco || e.latitude !== null || e.longitude !== null) && (
            <Bloco
              icone="pino"
              titulo="Localização"
              aberto={blocos.local}
              onAlternar={() => alternar('local')}
            >
              <div className="ficha">
                {e.endereco && <ItemFicha icone="pino" rotulo="Endereço" valor={e.endereco} />}
                <ItemFicha icone="local" rotulo="Cidade" valor={fmtTexto(local)} />
                {(e.latitude !== null || e.longitude !== null) && (
                  <ItemFicha
                    icone="alvo"
                    rotulo="Coordenadas"
                    valor={`${e.latitude ?? TRACO}, ${e.longitude ?? TRACO}`}
                  />
                )}
              </div>
            </Bloco>
          )}
        </div>
      </div>

      {analisando !== null &&
        (() => {
          const alvo = e.unidades.find((u) => u.id === analisando)
          if (!alvo) return null
          return (
            <AnaliseUnidade
              unidade={alvo}
              unidades={e.unidades}
              indice={e.unidades.indexOf(alvo)}
              nomeDoEmpreendimento={e.nome}
              onFechar={() => setAnalisando(null)}
            />
          )
        })()}
    </>
  )
}

import { useEffect, useMemo, useState } from 'react'
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
import { resumoUnidades, rotuloUnidade } from '../lib/unidades'
import { Icone, type NomeIcone } from './Icones'
import { CartaoFluxo } from './CartaoFluxo'
import { CartaoUnidade } from './CartaoUnidade'
import { FluxosDoEmpreendimento, fluxoParaEnvio, fluxoParaFormulario } from './FormFluxos'
import { Galeria } from './Galeria'
import { Selo } from './ui'

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
  const local = [e.bairro, e.cidade].filter(Boolean).join(', ')

  const fotos = useMemo(() => fotosDe(e), [e])
  const resumo = useMemo(() => resumoUnidades(e.unidades), [e.unidades])
  const temUnidades = e.unidades.length > 0
  // A galeria some quando todo link quebra; ai o nome volta para o cabecalho.
  const [galeriaVazia, setGaleriaVazia] = useState(false)
  useEffect(() => setGaleriaVazia(false), [e.id])
  const temCapa = fotos.length > 0 && !galeriaVazia

  // Qual unidade esta com o fluxo de pagamento aberto para edicao.
  const [fluxosAbertos, setFluxosAbertos] = useState<number | null>(null)
  useEffect(() => setFluxosAbertos(null), [e.id])
  // Para qual unidade cada tabela antiga vai ser copiada.
  const [destino, setDestino] = useState<Record<number, string>>({})
  const [copiando, setCopiando] = useState<number | null>(null)

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
      <div className="painel__topo">
        <span className="painel__titulo">Empreendimento</span>
        <div className="painel__acoes">
          <button type="button" className="btn btn--fantasma btn--icone" onClick={onEditar} title="Editar">
            <Icone nome="lapis" tamanho={15} />
          </button>
          <button type="button" className="btn btn--perigo btn--icone" onClick={onExcluir} title="Excluir">
            <Icone nome="lixeira" tamanho={15} />
          </button>
          <button type="button" className="btn btn--fantasma btn--icone" onClick={onFechar} title="Fechar painel">
            <Icone nome="fechar" tamanho={16} />
          </button>
        </div>
      </div>

      <div className="painel__conteudo">
        {fotos.length > 0 && (
          <Galeria key={e.id} fotos={fotos} nome={e.nome} tipo={e.tipo} onVazia={setGaleriaVazia} />
        )}

        {/* Sem foto — ou com todos os links quebrados — o lugar da capa avisa em
            vez de sumir, senao parece que o painel carregou pela metade. A faixa
            e mais baixa que a capa e nao repete o nome: ele volta para o cabecalho. */}
        {!temCapa && (
          <div className="capa-vazia">
            <Icone nome="imagem" tamanho={20} />
            <span>Não há fotos disponíveis no momento</span>
          </div>
        )}

        <div className="detalhe">
          <header className="detalhe__cabecalho">
            {!temCapa && <h2 className="detalhe__nome">{e.nome}</h2>}
            {e.construtora && <div className="detalhe__construtora">{e.construtora}</div>}
            {local && (
              <div className="detalhe__local">
                <Icone nome="local" tamanho={13} />
                {local}
              </div>
            )}
            {e.endereco && (
              <div className="detalhe__local">
                <Icone nome="pino" tamanho={13} />
                {e.endereco}
              </div>
            )}
            <div className="detalhe__selos">
              {!temCapa && e.tipo && <Selo cor="cinza">{e.tipo}</Selo>}
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
            </div>
          </header>

          {e.valor_m2 !== null && (
            <div className="destaque-valor">
              <span className="destaque-valor__numero">{fmtMoeda(e.valor_m2, true)}</span>
              <span className="destaque-valor__rotulo">valor médio do m²</span>
            </div>
          )}

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
            <ItemFicha icone="obra" rotulo="Status" valor={fmtTexto(e.status_obra)} />
            <ItemFicha icone="calendario" rotulo="Entrega" valor={fmtEntrega(e.entrega)} />
          </div>

          {temUnidades && (
            <p className="campo__dica" style={{ marginTop: 'calc(var(--e4) * -1 + var(--e2))', marginBottom: 'var(--e4)' }}>
              <Icone nome="info" tamanho={12} /> Dormitórios, vagas e metragem vêm das unidades cadastradas.
            </p>
          )}

          <div className="painel__ferramentas">
            {podeComparar && (
              <button type="button" className="btn btn--secundario btn--bloco" onClick={onCompararCom}>
                <Icone nome="balanca" tamanho={15} />
                Comparar com outro empreendimento
              </button>
            )}

            <button type="button" className="btn btn--secundario btn--bloco" onClick={onSimularInvestimento}>
              <Icone nome="grafico" tamanho={15} />
              Simular investimento
            </button>

            <button type="button" className="btn btn--secundario btn--bloco" onClick={onCalcularCub}>
              <Icone nome="grafico" tamanho={15} />
              Calcular valor com CUB
            </button>
          </div>

          <section className="bloco">
            <h3 className="bloco__titulo">
              <Icone nome="predio" tamanho={13} />
              Unidades
              {temUnidades && <span className="bloco__contador">{resumo.total}</span>}
              <button type="button" className="btn btn--fantasma btn--pequeno" onClick={onAdicionarUnidade}>
                <Icone nome="mais" tamanho={13} />
                Adicionar
              </button>
            </h3>

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
                              valorSugerido={unidade.valor}
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
          </section>

          {/* Formato antigo: tabela do empreendimento inteiro. So aparece
              enquanto sobrar alguma — o cadastro novo e sempre por unidade. */}
          {e.fluxos.length > 0 && (
            <section className="bloco">
              <h3 className="bloco__titulo">
                <Icone nome="cartao" tamanho={13} />
                Tabelas gerais
                <span className="bloco__contador">{e.fluxos.length}</span>
              </h3>

              <div className="observacao">
                O fluxo de pagamento agora é cadastrado dentro de cada unidade. Estas tabelas vieram do formato
                anterior: copie para a unidade que atende e depois exclua.
              </div>

              {e.fluxos.map((fluxo, indice) => (
                <div key={fluxo.id}>
                  <CartaoFluxo fluxo={fluxo} indice={indice} onExcluir={() => void excluirFluxoGeral(fluxo)} />

                  {temUnidades && (
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
            </section>
          )}

          {e.observacoes && (
            <section className="bloco">
              <h3 className="bloco__titulo">
                <Icone nome="lista" tamanho={13} />
                Observações
              </h3>
              <div className="observacao">{e.observacoes}</div>
            </section>
          )}

          {(e.latitude !== null || e.longitude !== null) && (
            <p className="campo__dica">
              Coordenadas: {e.latitude ?? TRACO}, {e.longitude ?? TRACO}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

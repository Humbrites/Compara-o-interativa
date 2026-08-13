import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Empreendimento, FluxoPagamento, Unidade } from '../types'
import { api } from '../lib/api'
import {
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
import { LinhaUnidade } from './LinhaUnidade'
import { CompararUnidades } from './CompararUnidades'
import { AnaliseUnidade } from './AnaliseUnidade'
import { FluxosDoEmpreendimento, fluxoParaEnvio, fluxoParaFormulario } from './FormFluxos'
import { Galeria } from './Galeria'
import { ImportarTabela } from './ImportarTabela'
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
 * Seção da tela do imóvel.
 *
 * Era um acordeão: cada assunto abria e fechava, e o que estava aberto mudava
 * conforme o clique anterior. Numa tela só, isso obriga a PROCURAR — "onde
 * estava a ficha?" — porque nada fica no mesmo lugar duas visitas seguidas.
 * Agora o conteúdo está sempre visível e o lugar de cada assunto é fixo.
 */
function Secao({
  icone,
  titulo,
  contador,
  acao,
  recolher,
  children,
}: {
  icone: NomeIcone
  titulo: string
  contador?: number
  acao?: ReactNode
  /**
   * Só a lista de unidades recolhe, e por um motivo concreto: ela é a única
   * que cresce sem limite (um prédio pode ter dezenas). O resto da tela
   * continua sempre visível — recolher tudo era o problema antigo.
   */
  recolher?: { aberta: boolean; onAlternar: () => void }
  children: ReactNode
}) {
  const aberta = recolher ? recolher.aberta : true
  return (
    <section className={`secao${recolher && !aberta ? ' secao--recolhida' : ''}`}>
      <div className="secao__cabecalho">
        {recolher ? (
          <button type="button" className="secao__alternar" onClick={recolher.onAlternar} aria-expanded={aberta}>
            <Icone nome={icone} tamanho={14} />
            <h3 className="secao__titulo">{titulo}</h3>
            {contador !== undefined && <span className="secao__contador">{contador}</span>}
            <span className="secao__seta">
              <Icone nome={aberta ? 'seta_cima' : 'seta_baixo'} tamanho={14} />
            </span>
          </button>
        ) : (
          <>
            <Icone nome={icone} tamanho={14} />
            <h3 className="secao__titulo">{titulo}</h3>
            {contador !== undefined && <span className="secao__contador">{contador}</span>}
          </>
        )}
        {acao && aberta && <div className="secao__acoes">{acao}</div>}
      </div>
      {aberta && <div className="secao__corpo">{children}</div>}
    </section>
  )
}

interface Props {
  empreendimento: Empreendimento
  /** A base inteira: a comparação de unidades cruza empreendimentos. */
  lista: Empreendimento[]
  podeComparar: boolean
  onEditar: () => void
  onExcluir: () => void
  onAdicionarUnidade: () => void
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
  lista,
  podeComparar,
  onEditar,
  onExcluir,
  onAdicionarUnidade,
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
  const [comparandoUnidades, setComparandoUnidades] = useState(false)
  // A importacao da tabela da construtora abre em modal, em passos.
  const [importando, setImportando] = useState(false)
  // A lista de unidades pode ser recolhida: e a unica parte que cresce sem
  // limite. Nasce ABERTA — e o que o corretor abre a tela para ver.
  const [unidadesAbertas, setUnidadesAbertas] = useState(true)
  // Qual unidade esta com a linha expandida (detalhe + acoes).
  const [unidadeAberta, setUnidadeAberta] = useState<number | null>(null)
  useEffect(() => {
    setAnalisando(null)
    setComparandoUnidades(false)
    setImportando(false)
    setUnidadesAbertas(true)
    setUnidadeAberta(null)
  }, [e.id])
  useEffect(() => setFluxosAbertos(null), [e.id])
  // Para qual unidade cada tabela antiga vai ser copiada.
  const [destino, setDestino] = useState<Record<number, string>>({})
  const [copiando, setCopiando] = useState<number | null>(null)

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
      {/* Cabecalho da tela: quem e o imovel, o que ele custa e o unico botao
          que comeca um trabalho aqui. Fica FIXO no topo — rolando ate a ultima
          unidade, o nome e o preco continuam a vista. */}
      <header className="imovel__topo">
        <div className="imovel__quem">
          <h2 className="imovel__nome">{e.nome}</h2>
          <div className="imovel__linha">
            {(e.construtora || e.tipo) && (
              <span className="imovel__sub">{[e.construtora, e.tipo].filter(Boolean).join(' · ')}</span>
            )}
            {local && (
              <span className="imovel__sub">
                <Icone nome="local" tamanho={12} />
                {local}
              </span>
            )}
          </div>

          <div className="imovel__selos">
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
        </div>

        {(precoPrincipal || m2Principal) && (
          <div className="imovel__preco">
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

        <div className="imovel__acoes">
          {podeComparar && (
            <button type="button" className="btn btn--primario" onClick={onCompararCom}>
              <Icone nome="balanca" tamanho={15} />
              Comparar empreendimentos
            </button>
          )}
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
          {/* "Voltar ao mapa" com todas as letras: um X sozinho nao diz para
              ONDE se volta quando a tela toma o lugar do mapa. */}
          <button type="button" className="btn btn--secundario" onClick={onFechar}>
            <Icone nome="fechar" tamanho={15} />
            Voltar ao mapa
          </button>
        </div>
      </header>

      {/* Duas colunas com papeis fixos: a ESQUERDA e o que se vende (fotos e
          unidades), a DIREITA e o que se consulta sobre o predio. Cada assunto
          tem um lugar so — antes tudo era acordeao empilhado e a mesma
          informacao mudava de altura conforme o que estivesse aberto. */}
      {/* A tela tem DOIS andares. Em cima, "que imovel e este": as fotos e a
          ficha, lado a lado, que se le uma vez. Embaixo, a lista de unidades na
          largura INTEIRA — e uma tabela de vendas, e tabela se le comparando
          linha com linha, o que uma coluna estreita impede. */}
      <div className="imovel__corpo">
        {/* Sem fotos, a coluna da esquerda fica vazia e a ficha sozinha na
            direita deixa meia tela em branco — entao a apresentacao vira uma
            faixa horizontal. */}
        <div className={`imovel__apresentacao${temCapa ? '' : ' imovel__apresentacao--sem-fotos'}`}>
          {temCapa && <Galeria key={e.id} fotos={fotos} nome={e.nome} tipo={e.tipo} onVazia={setGaleriaVazia} />}

          {!temCapa && (
            <div className="capa-vazia">
              <Icone nome="imagem" tamanho={20} />
              <span>Não há fotos disponíveis no momento</span>
            </div>
          )}
        <aside className="imovel__ficha">
          <Secao icone="lista" titulo="Ficha técnica">
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
            </div>

            {temUnidades && (
              <p className="campo__dica">
                <Icone nome="info" tamanho={12} /> Dormitórios, vagas e metragem vêm das unidades cadastradas.
              </p>
            )}
          </Secao>

          {(e.endereco || e.latitude !== null || e.longitude !== null) && (
            <Secao icone="pino" titulo="Localização">
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
            </Secao>
          )}

          {e.observacoes && (
            <Secao icone="lista" titulo="Observações">
              <div className="observacao">{e.observacoes}</div>
            </Secao>
          )}
        </aside>
        </div>

        <div className="imovel__unidades">
          <Secao
            icone="predio"
            titulo="Unidades"
            contador={temUnidades ? resumo.total : undefined}
            recolher={temUnidades ? { aberta: unidadesAbertas, onAlternar: () => setUnidadesAbertas((a) => !a) } : undefined}
            acao={
              <>
                {resumo.total > 1 && (
                  <button
                    type="button"
                    className="btn btn--secundario btn--pequeno"
                    onClick={() => setComparandoUnidades(true)}
                    title="Comparar as unidades deste empreendimento lado a lado"
                  >
                    <Icone nome="balanca" tamanho={13} />
                    Comparar unidades
                  </button>
                )}
                {podeEditar && (
                  <>
                    {/* Cadastrar unidade a unidade e o caminho de uma; a
                        tabela da construtora traz o predio inteiro de uma vez. */}
                    <button
                      type="button"
                      className="btn btn--secundario btn--pequeno"
                      onClick={() => setImportando(true)}
                      title="Ler a tabela de vendas da construtora e cadastrar as unidades de uma vez"
                    >
                      <Icone nome="lista" tamanho={13} />
                      Importar tabela
                    </button>
                    <button type="button" className="btn btn--fantasma btn--pequeno" onClick={onAdicionarUnidade}>
                      <Icone nome="mais" tamanho={13} />
                      Adicionar
                    </button>
                  </>
                )}
              </>
            }
          >
            {!temUnidades ? (
              <div className="observacao">
                Nenhuma unidade cadastrada. Cadastre as plantas (metragem, dormitórios, vagas, posição e preço) e o
                fluxo de pagamento de cada uma para comparar unidade a unidade.
              </div>
            ) : (
              e.unidades.map((unidade, indice) => (
                <LinhaUnidade
                  key={unidade.id}
                  unidade={unidade}
                  indice={indice}
                  aberta={unidadeAberta === unidade.id}
                  onAlternar={() =>
                    setUnidadeAberta((atual) => (atual === unidade.id ? null : unidade.id))
                  }
                  detalhe={
                    <>
                      <div className="linha-unidade__acoes">
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
                      </div>

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
              ))
            )}
          </Secao>

          {/* Formato antigo: tabela do empreendimento inteiro. So aparece
              enquanto sobrar alguma — o cadastro novo e sempre por unidade. */}
          {e.fluxos.length > 0 && (
            <Secao icone="cartao" titulo="Tabelas gerais" contador={e.fluxos.length}>
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
            </Secao>
          )}
        </div>

      </div>

      {comparandoUnidades && (
        <CompararUnidades
          lista={lista}
          empreendimentoInicial={e}
          // Aberta daqui, a pergunta é sobre ESTE prédio; o botão do topo abre
          // a mesma tela já com a base inteira à mostra.
          soDoEmpreendimento
          avisar={avisar}
          onFechar={() => setComparandoUnidades(false)}
        />
      )}

      {importando && (
        <ImportarTabela
          empreendimento={e}
          onImportou={onMudouUnidades}
          avisar={avisar}
          onFechar={() => setImportando(false)}
        />
      )}

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

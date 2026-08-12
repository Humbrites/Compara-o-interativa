import { useMemo, useState } from 'react'
import type { Empreendimento, FluxoPagamento, Unidade } from '../types'
import {
  compararEmpreendimentos,
  compararFluxos,
  compararUnidades,
  textosDoFluxo,
  type LinhaComparativo,
} from '../lib/comparar'
import { fmtMoeda, fmtTexto } from '../lib/format'
import { capaDe } from '../lib/imagens'
import { localizacaoUnidade, rotuloUnidade } from '../lib/unidades'
import { Icone } from './Icones'
import { Modal, Estado } from './ui'

/* ------------------------------------------------------------------ */
/* Tabela de indicadores                                               */
/* ------------------------------------------------------------------ */

function Celula({ linha, lado }: { linha: LinhaComparativo; lado: 'a' | 'b' }) {
  const texto = lado === 'a' ? linha.textoA : linha.textoB
  const vence = linha.vencedor === lado
  const vazio = texto === '—'

  const classes = ['tabela-comp__valor']
  if (vence) classes.push('tabela-comp__valor--vence')
  else if (vazio) classes.push('tabela-comp__valor--vazio')

  return (
    <td className={classes.join(' ')} title={vence ? linha.criterio : undefined}>
      {vence ? (
        <span className="vence-marca">
          <Icone nome="check" tamanho={14} espessura={2.6} />
          {texto}
        </span>
      ) : (
        texto
      )}
      {linha.vencedor === 'empate' && lado === 'b' && (
        <span className="tabela-comp__empate">
          <Icone nome="igual" tamanho={11} />
          empate
        </span>
      )}
    </td>
  )
}

function TabelaComparativa({
  legenda,
  linhas,
  nomeA,
  nomeB,
}: {
  legenda: string
  linhas: LinhaComparativo[]
  nomeA: string
  nomeB: string
}) {
  return (
    <>
      {/* O titulo fica FORA da tabela: como <caption> ele era cortado pela
          borda arredondada com overflow hidden. */}
      <h3 className="tabela-comp__legenda">{legenda}</h3>
      <table className="tabela-comp">
        <thead>
          <tr>
            <th className="tabela-comp__indicador">Indicador</th>
            <th>{nomeA}</th>
            <th>{nomeB}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.chave}>
              <th scope="row" className="tabela-comp__indicador" title={linha.criterio}>
                {linha.rotulo}
              </th>
              <Celula linha={linha} lado="a" />
              <Celula linha={linha} lado="b" />
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Cabecalho A vs B                                                    */
/* ------------------------------------------------------------------ */

/**
 * Um dos lados do comparativo — e o seletor que TROCA o empreendimento dali.
 *
 * O lado A vinha fixo do imóvel selecionado no mapa: para comparar outro par
 * era preciso fechar, escolher outro no mapa e abrir de novo. Agora os dois
 * lados trocam sem sair da tela.
 */
function LadoVersus({
  empreendimento: e,
  papel,
  vitorias,
  lista,
  outroId,
  onEscolher,
}: {
  empreendimento: Empreendimento
  papel: 'a' | 'b'
  vitorias: number
  lista: Empreendimento[]
  /** O que já está do outro lado — ninguém compara um imóvel com ele mesmo. */
  outroId: number | null
  onEscolher: (id: number) => void
}) {
  const local = [e.bairro, e.cidade].filter(Boolean).join(', ')
  const opcoes = lista.filter((item) => item.id === e.id || item.id !== outroId)

  return (
    <div className={`versus__lado versus__lado--${papel}`}>
      {capaDe(e) ? (
        <img className="versus__foto" src={capaDe(e) as string} alt="" onError={(ev) => ev.currentTarget.remove()} />
      ) : (
        <div className="versus__foto versus__foto--vazia">
          <Icone nome="predio" tamanho={22} />
        </div>
      )}
      <div className="versus__info">
        <span className="versus__etiqueta">{papel === 'a' ? 'EMPREENDIMENTO A' : 'EMPREENDIMENTO B'}</span>
        <div className="versus__nome">{e.nome}</div>
        <div className="versus__meta">
          {fmtTexto(e.construtora)}
          {local && ` · ${local}`}
        </div>
        <div className="versus__placar">
          <Icone nome="check" tamanho={13} />
          {vitorias} {vitorias === 1 ? 'indicador melhor' : 'indicadores melhores'}
        </div>

        {opcoes.length > 1 && (
          <select
            className="entrada versus__trocar"
            value={e.id}
            onChange={(evento) => onEscolher(Number(evento.target.value))}
            aria-label={`Trocar o empreendimento ${papel.toUpperCase()}`}
          >
            {opcoes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Seletor do segundo empreendimento                                   */
/* ------------------------------------------------------------------ */

function SeletorLateral({
  lista,
  excluir,
  onEscolher,
}: {
  lista: Empreendimento[]
  excluir: number
  onEscolher: (id: number) => void
}) {
  const [busca, setBusca] = useState('')

  const candidatos = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return lista
      .filter((e) => e.id !== excluir)
      .filter((e) =>
        !termo ? true : [e.nome, e.construtora, e.cidade, e.bairro].some((c) => (c || '').toLowerCase().includes(termo)),
      )
  }, [lista, excluir, busca])

  if (lista.length <= 1) {
    return (
      <Estado
        icone="balanca"
        titulo="É preciso ter pelo menos dois empreendimentos"
        texto="Cadastre outro empreendimento para poder comparar lado a lado."
      />
    )
  }

  return (
    <div>
      <div className="busca" style={{ maxWidth: '100%', marginBottom: 'var(--e4)' }}>
        <span className="busca__icone">
          <Icone nome="busca" tamanho={15} />
        </span>
        <input
          className="entrada"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, construtora, cidade ou bairro…"
          autoFocus
        />
      </div>

      {candidatos.length === 0 ? (
        <Estado icone="busca" titulo="Nenhum empreendimento encontrado" texto="Ajuste a busca e tente de novo." />
      ) : (
        <div className="lista-escolha">
          {candidatos.map((e) => (
            <button key={e.id} type="button" className="escolha" onClick={() => onEscolher(e.id)}>
              {capaDe(e) ? (
                <img className="escolha__foto" src={capaDe(e) as string} alt="" onError={(ev) => ev.currentTarget.remove()} />
              ) : (
                <div className="escolha__foto" style={{ display: 'grid', placeItems: 'center', color: 'var(--texto-3)' }}>
                  <Icone nome="predio" tamanho={18} />
                </div>
              )}
              <div className="escolha__info">
                <div className="escolha__nome">{e.nome}</div>
                <div className="escolha__meta">
                  {[e.construtora, e.bairro, e.cidade].filter(Boolean).join(' · ') || 'Sem localização'}
                </div>
              </div>
              {e.valor_m2 !== null && <span className="escolha__valor">{fmtMoeda(e.valor_m2)}/m²</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fluxos disponiveis de um lado                                       */
/* ------------------------------------------------------------------ */

interface OpcaoFluxo {
  fluxo: FluxoPagamento
  rotulo: string
}

/**
 * O que aparece no seletor de fluxo: primeiro as tabelas da unidade
 * escolhida, depois as gerais do empreendimento.
 */
function opcoesDeFluxo(e: Empreendimento, unidade: Unidade | null): OpcaoFluxo[] {
  const nome = (fluxo: FluxoPagamento, indice: number) => fluxo.nome?.trim() || `Fluxo ${indice + 1}`

  const daUnidade = (unidade?.fluxos ?? []).map((fluxo, indice) => ({
    fluxo,
    rotulo: `${nome(fluxo, indice)} · ${rotuloUnidade(unidade as Unidade)}`,
  }))

  const gerais = e.fluxos.map((fluxo, indice) => ({
    fluxo,
    rotulo: unidade ? `${nome(fluxo, indice)} · geral` : nome(fluxo, indice),
  }))

  return [...daUnidade, ...gerais]
}

/** Seletor de unidade de um dos lados. */
function SeletorUnidade({
  empreendimento: e,
  valor,
  onMudar,
}: {
  empreendimento: Empreendimento
  valor: number | null
  onMudar: (id: number | null) => void
}) {
  return (
    <>
      <span className="seletor-fluxo__rotulo">Unidade de {e.nome}:</span>
      <select
        className="entrada filtros__select"
        value={valor ?? ''}
        onChange={(evento) => onMudar(evento.target.value ? Number(evento.target.value) : null)}
        disabled={e.unidades.length === 0}
      >
        {e.unidades.length === 0 ? (
          <option>Sem unidade cadastrada</option>
        ) : (
          <>
            <option value="">Empreendimento (sem unidade)</option>
            {e.unidades.map((unidade, indice) => (
              <option key={unidade.id} value={unidade.id}>
                {rotuloUnidade(unidade, indice)}
                {localizacaoUnidade(unidade) ? ` — ${localizacaoUnidade(unidade)}` : ''}
              </option>
            ))}
          </>
        )}
      </select>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Modal principal                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  a: Empreendimento
  b: Empreendimento | null
  lista: Empreendimento[]
  /** Troca o empreendimento de cada lado sem fechar a tela. */
  onEscolherA: (id: number) => void
  onEscolherB: (id: number) => void
  onTrocarLados: () => void
  onFechar: () => void
}

export function Comparativo({ a, b, lista, onEscolherA, onEscolherB, onTrocarLados, onFechar }: Props) {
  // Unidade escolhida de cada lado (null = comparar so o empreendimento).
  const [unidadeAId, setUnidadeAId] = useState<number | null>(null)
  const [unidadeBId, setUnidadeBId] = useState<number | null>(null)
  // Qual fluxo de cada lado entra na tabela comparativa (por id, porque a
  // lista muda de tamanho conforme a unidade escolhida).
  const [fluxoAId, setFluxoAId] = useState<number | null>(null)
  const [fluxoBId, setFluxoBId] = useState<number | null>(null)

  const unidadeA = useMemo(() => a.unidades.find((u) => u.id === unidadeAId) ?? null, [a.unidades, unidadeAId])
  const unidadeB = useMemo(() => b?.unidades.find((u) => u.id === unidadeBId) ?? null, [b, unidadeBId])

  // Com uma unidade escolhida, a tabela dela vem primeiro; as gerais seguem
  // valendo para os dois casos.
  const opcoesA = useMemo(() => opcoesDeFluxo(a, unidadeA), [a, unidadeA])
  const opcoesB = useMemo(() => (b ? opcoesDeFluxo(b, unidadeB) : []), [b, unidadeB])

  const escolhidoA = opcoesA.find((o) => o.fluxo.id === fluxoAId) ?? opcoesA[0] ?? null
  const escolhidoB = opcoesB.find((o) => o.fluxo.id === fluxoBId) ?? opcoesB[0] ?? null

  const linhasGerais = useMemo(() => (b ? compararEmpreendimentos(a, b) : []), [a, b])
  const linhasUnidade = useMemo(
    () => (unidadeA || unidadeB ? compararUnidades(unidadeA, unidadeB) : []),
    [unidadeA, unidadeB],
  )
  const linhasFluxo = useMemo(
    () => compararFluxos(escolhidoA?.fluxo ?? null, escolhidoB?.fluxo ?? null),
    [escolhidoA, escolhidoB],
  )

  const placar = useMemo(() => {
    const todas = [...linhasGerais, ...linhasUnidade, ...linhasFluxo]
    return {
      a: todas.filter((l) => l.vencedor === 'a').length,
      b: todas.filter((l) => l.vencedor === 'b').length,
    }
  }, [linhasGerais, linhasUnidade, linhasFluxo])

  if (!b) {
    return (
      <Modal
        titulo="Comparar empreendimentos"
        subtitulo={`Escolha o segundo empreendimento para comparar com ${a.nome}`}
        onFechar={onFechar}
      >
        <SeletorLateral lista={lista} excluir={a.id} onEscolher={onEscolherB} />
      </Modal>
    )
  }

  const textosA = textosDoFluxo(escolhidoA?.fluxo ?? null)
  const textosB = textosDoFluxo(escolhidoB?.fluxo ?? null)
  const temTextoLivre = textosA.descricao || textosB.descricao || textosA.observacoes || textosB.observacoes

  return (
    <Modal
      titulo="Comparativo"
      subtitulo="O melhor indicador de cada linha aparece destacado em verde."
      largo
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn--fantasma" onClick={onTrocarLados}>
            <Icone nome="seta_direita" tamanho={15} />
            Inverter A e B
          </button>
          <div className="direita">
            <button type="button" className="btn btn--primario" onClick={onFechar}>
              Fechar
            </button>
          </div>
        </>
      }
    >
      <div className="versus">
        <LadoVersus
          empreendimento={a}
          papel="a"
          vitorias={placar.a}
          lista={lista}
          outroId={b.id}
          onEscolher={onEscolherA}
        />
        <div className="versus__x">VS</div>
        <LadoVersus
          empreendimento={b}
          papel="b"
          vitorias={placar.b}
          lista={lista}
          outroId={a.id}
          onEscolher={onEscolherB}
        />
      </div>

      {(a.unidades.length > 0 || b.unidades.length > 0) && (
        <div className="bloco-comp">
          <div className="seletor-fluxo">
            <SeletorUnidade empreendimento={a} valor={unidadeAId} onMudar={setUnidadeAId} />
            <SeletorUnidade empreendimento={b} valor={unidadeBId} onMudar={setUnidadeBId} />
          </div>

          {linhasUnidade.length > 0 ? (
            <TabelaComparativa
              legenda="Unidade escolhida"
              linhas={linhasUnidade}
              nomeA={unidadeA ? rotuloUnidade(unidadeA) : a.nome}
              nomeB={unidadeB ? rotuloUnidade(unidadeB) : b.nome}
            />
          ) : (
            <p className="campo__dica">
              <Icone nome="info" tamanho={12} /> Escolha uma unidade de cada lado para comparar metragem, dormitórios,
              vagas, posição e preço unidade a unidade.
            </p>
          )}

          {(unidadeA || unidadeB) && !(unidadeA && unidadeB) && (
            <p className="campo__dica" style={{ marginTop: 'var(--e3)' }}>
              <Icone nome="info" tamanho={12} /> Só um lado tem unidade escolhida — sem os dois valores, nenhuma linha
              é destacada.
            </p>
          )}
        </div>
      )}

      <div className="bloco-comp">
        <TabelaComparativa
          legenda="Características do empreendimento"
          linhas={linhasGerais}
          nomeA={a.nome}
          nomeB={b.nome}
        />
      </div>


      <div className="bloco-comp">
        <div className="seletor-fluxo">
          <span className="seletor-fluxo__rotulo">Fluxo de {a.nome}:</span>
          <select
            className="entrada filtros__select"
            value={escolhidoA?.fluxo.id ?? ''}
            onChange={(e) => setFluxoAId(e.target.value ? Number(e.target.value) : null)}
            disabled={opcoesA.length === 0}
          >
            {opcoesA.length === 0 ? (
              <option>Sem fluxo cadastrado</option>
            ) : (
              opcoesA.map((opcao) => (
                <option key={opcao.fluxo.id} value={opcao.fluxo.id}>
                  {opcao.rotulo}
                </option>
              ))
            )}
          </select>

          <span className="seletor-fluxo__rotulo">Fluxo de {b.nome}:</span>
          <select
            className="entrada filtros__select"
            value={escolhidoB?.fluxo.id ?? ''}
            onChange={(e) => setFluxoBId(e.target.value ? Number(e.target.value) : null)}
            disabled={opcoesB.length === 0}
          >
            {opcoesB.length === 0 ? (
              <option>Sem fluxo cadastrado</option>
            ) : (
              opcoesB.map((opcao) => (
                <option key={opcao.fluxo.id} value={opcao.fluxo.id}>
                  {opcao.rotulo}
                </option>
              ))
            )}
          </select>
        </div>

        <TabelaComparativa legenda="Fluxo de pagamento" linhas={linhasFluxo} nomeA={a.nome} nomeB={b.nome} />

        {temTextoLivre && (
          <div className="texto-livre">
            <div className="texto-livre__cartao">
              <div className="texto-livre__titulo">{a.nome}</div>
              {textosA.descricao || <span style={{ color: 'var(--texto-3)' }}>Sem descrição livre</span>}
              {textosA.observacoes && (
                <div style={{ marginTop: 'var(--e2)', color: 'var(--texto-3)' }}>{textosA.observacoes}</div>
              )}
            </div>
            <div className="texto-livre__cartao">
              <div className="texto-livre__titulo">{b.nome}</div>
              {textosB.descricao || <span style={{ color: 'var(--texto-3)' }}>Sem descrição livre</span>}
              {textosB.observacoes && (
                <div style={{ marginTop: 'var(--e2)', color: 'var(--texto-3)' }}>{textosB.observacoes}</div>
              )}
            </div>
          </div>
        )}

        {(opcoesA.length === 0 || opcoesB.length === 0) && (
          <p className="campo__dica" style={{ marginTop: 'var(--e3)' }}>
            <Icone nome="info" tamanho={12} />{' '}
            {opcoesA.length === 0 && opcoesB.length === 0
              ? 'Nenhum dos dois tem fluxo de pagamento cadastrado.'
              : `${opcoesA.length === 0 ? a.nome : b.nome} ainda não tem fluxo de pagamento cadastrado.`}
          </p>
        )}
      </div>
    </Modal>
  )
}

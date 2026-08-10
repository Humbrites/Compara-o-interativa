import { useEffect, useMemo, useState } from 'react'

import { fmtArea, fmtInteiro, fmtMoeda, fmtPct, fmtTexto, TRACO } from '../lib/format'
import { detalharFluxo } from '../lib/fluxos'
import { mensagemDoErro } from '../lib/http'
import { plataforma, type BaseDoClienteResposta } from '../lib/plataforma'
import { capaDe } from '../lib/imagens'
import { localizacaoUnidade, precoDaUnidade, rotuloUnidade, valorM2Da } from '../lib/unidades'
import type { Empreendimento, FluxoPagamento, Unidade } from '../types'
import { Icone } from './Icones'
import { Carregando, Estado, Modal, Selo } from './ui'

/**
 * A base de um cliente, vista pelo suporte.
 *
 * SOMENTE LEITURA — nao ha um unico botao que grave. Ver o que o cliente
 * cadastrou e o que permite responder "por que o meu valor do m² esta assim";
 * corrigir por cima dele, sem que ele saiba, e outra conversa.
 *
 * As contas (valor do m², composicao do fluxo, preco da unidade) saem das
 * MESMAS funcoes que a tela do cliente usa. Recalcular aqui de outro jeito
 * faria o suporte enxergar um numero diferente do que o cliente esta vendo —
 * que e o pior lugar possivel para uma divergencia.
 */

interface Props {
  contaId: number
  nomeDaConta: string
  onFechar: () => void
}

export function BaseDoCliente({ contaId, nomeDaConta, onFechar }: Props) {
  const [dados, setDados] = useState<BaseDoClienteResposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<number | null>(null)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    let vivo = true

    plataforma
      .baseDoCliente(contaId)
      .then((resposta) => {
        if (!vivo) return
        setDados(resposta)
        // Com um empreendimento só, abrir sozinho poupa um clique inútil.
        if (resposta.empreendimentos.length === 1) setAberto(resposta.empreendimentos[0].id)
      })
      .catch((falha) => vivo && setErro(mensagemDoErro(falha, 'Não foi possível carregar a base')))

    return () => {
      vivo = false
    }
  }, [contaId])

  const filtrados = useMemo(() => {
    if (!dados) return []
    const termo = busca.trim().toLowerCase()
    if (!termo) return dados.empreendimentos

    return dados.empreendimentos.filter((e) =>
      [e.nome, e.construtora, e.cidade, e.bairro].some((campo) => (campo || '').toLowerCase().includes(termo)),
    )
  }, [dados, busca])

  return (
    <Modal
      titulo={nomeDaConta}
      subtitulo="Base do cliente — somente leitura"
      largo
      onFechar={onFechar}
      cabecalhoExtra={
        <div className="suporte-aviso">
          <Icone nome="info" tamanho={14} />
          <span>
            Você está vendo o que este cliente cadastrou, para dar suporte. Nada aqui é editável — mudanças na base
            são feitas por ele.
          </span>
        </div>
      }
    >
      {erro ? (
        <Estado icone="alerta" variante="erro" titulo="Falha ao carregar" texto={erro} />
      ) : !dados ? (
        <Carregando texto="Carregando a base do cliente…" />
      ) : dados.empreendimentos.length === 0 ? (
        <Estado
          icone="predio"
          titulo="Este cliente ainda não cadastrou nada"
          texto="A conta existe e o acesso funciona, mas a base está vazia — é o retrato de quem comprou e ainda não começou."
        />
      ) : (
        <div className="suporte">
          <div className="resumo-cartoes">
            <MiniCartao rotulo="Empreendimentos" valor={dados.resumo.empreendimentos} />
            <MiniCartao rotulo="Unidades" valor={dados.resumo.unidades} />
            <MiniCartao rotulo="Tabelas de venda" valor={dados.resumo.fluxos} />
            <MiniCartao
              rotulo="Fotos"
              valor={dados.resumo.fotos}
              apoio={dados.resumo.semCoordenada > 0 ? `${dados.resumo.semCoordenada} sem coordenada` : undefined}
            />
          </div>

          {dados.empreendimentos.length > 4 && (
            <div className="busca">
              <span className="busca__icone">
                <Icone nome="busca" tamanho={15} />
              </span>
              <input
                className="entrada"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, construtora ou cidade…"
              />
              {busca && (
                <button type="button" className="busca__limpar" onClick={() => setBusca('')} aria-label="Limpar busca">
                  <Icone nome="fechar" tamanho={13} />
                </button>
              )}
            </div>
          )}

          <ul className="suporte-lista">
            {filtrados.map((empreendimento) => (
              <LinhaEmpreendimento
                key={empreendimento.id}
                empreendimento={empreendimento}
                aberto={aberto === empreendimento.id}
                onAlternar={() => setAberto(aberto === empreendimento.id ? null : empreendimento.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}

function MiniCartao({ rotulo, valor, apoio }: { rotulo: string; valor: number; apoio?: string }) {
  return (
    <div className="cartao-resumo">
      <div className="cartao-resumo__rotulo">{rotulo}</div>
      <div className="cartao-resumo__valor">{valor}</div>
      {apoio && <div className="cartao-resumo__apoio">{apoio}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function LinhaEmpreendimento({
  empreendimento,
  aberto,
  onAlternar,
}: {
  empreendimento: Empreendimento
  aberto: boolean
  onAlternar: () => void
}) {
  const capa = capaDe(empreendimento)
  const local = [empreendimento.bairro, empreendimento.cidade].filter(Boolean).join(', ')
  const semMapa = empreendimento.latitude === null || empreendimento.longitude === null
  const totalFluxos =
    empreendimento.fluxos.length + empreendimento.unidades.reduce((soma, u) => soma + u.fluxos.length, 0)

  return (
    <li className="suporte-item">
      <button type="button" className="suporte-item__topo" onClick={onAlternar} aria-expanded={aberto}>
        <span className={`conta-linha__seta${aberto ? ' conta-linha__seta--aberta' : ''}`}>
          <Icone nome="seta" tamanho={12} />
        </span>

        {capa ? (
          <img className="suporte-item__foto" src={capa} alt="" loading="lazy" />
        ) : (
          <span className="suporte-item__foto suporte-item__foto--vazia">
            <Icone nome="predio" tamanho={16} />
          </span>
        )}

        <span className="suporte-item__identidade">
          <span className="suporte-item__nome">{empreendimento.nome}</span>
          <span className="suporte-item__local">
            {fmtTexto(empreendimento.construtora)}
            {local && ` · ${local}`}
          </span>
        </span>

        <span className="suporte-item__contagens">
          <span>
            <strong>{empreendimento.unidades.length}</strong> unid.
          </span>
          <span>
            <strong>{totalFluxos}</strong> tabela(s)
          </span>
          <span>
            <strong>{empreendimento.imagens.length}</strong> foto(s)
          </span>
        </span>

        <span className="suporte-item__selos">
          {empreendimento.status_obra && <Selo cor="cinza">{empreendimento.status_obra}</Selo>}
          {/* O aviso que o cliente vê no dashboard dele, para o suporte
              entender de cara por que o imóvel "sumiu" do mapa. */}
          {semMapa && <Selo cor="ambar">Fora do mapa</Selo>}
        </span>
      </button>

      {aberto && (
        <div className="suporte-item__corpo">
          <FichaEmpreendimento empreendimento={empreendimento} />

          {empreendimento.fluxos.length > 0 && (
            <section className="suporte-secao">
              <h4 className="suporte-secao__titulo">
                Tabelas gerais do empreendimento
                <span className="suporte-secao__nota">formato antigo, sem unidade</span>
              </h4>
              {empreendimento.fluxos.map((fluxo) => (
                <CartaoFluxoLeitura key={fluxo.id} fluxo={fluxo} valorDaUnidade={null} />
              ))}
            </section>
          )}

          <section className="suporte-secao">
            <h4 className="suporte-secao__titulo">Unidades</h4>

            {empreendimento.unidades.length === 0 ? (
              <p className="suporte-vazio">Nenhuma unidade cadastrada neste empreendimento.</p>
            ) : (
              <ul className="suporte-unidades">
                {empreendimento.unidades.map((unidade, indice) => (
                  <UnidadeLeitura key={unidade.id} unidade={unidade} indice={indice} />
                ))}
              </ul>
            )}
          </section>

          {empreendimento.observacoes && (
            <section className="suporte-secao">
              <h4 className="suporte-secao__titulo">Observações</h4>
              <p className="suporte-observacao">{empreendimento.observacoes}</p>
            </section>
          )}
        </div>
      )}
    </li>
  )
}

function FichaEmpreendimento({ empreendimento }: { empreendimento: Empreendimento }) {
  const itens: [string, string][] = [
    ['Valor do m²', fmtMoeda(empreendimento.valor_m2)],
    ['Metragem', fmtArea(empreendimento.metragem_min) + (empreendimento.metragem_max ? ` a ${fmtArea(empreendimento.metragem_max)}` : '')],
    ['Dormitórios', fmtInteiro(empreendimento.dormitorios)],
    ['Suítes', fmtInteiro(empreendimento.suites)],
    ['Vagas', fmtInteiro(empreendimento.vagas)],
    ['Entrega', fmtTexto(empreendimento.entrega)],
    ['Tipo', fmtTexto(empreendimento.tipo)],
    ['Endereço', fmtTexto(empreendimento.endereco)],
  ]

  return (
    <div className="suporte-ficha">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="suporte-ficha__item">
          <span className="suporte-ficha__rotulo">{rotulo}</span>
          <span className="suporte-ficha__valor">{valor}</span>
        </div>
      ))}
    </div>
  )
}

function UnidadeLeitura({ unidade, indice }: { unidade: Unidade; indice: number }) {
  // As mesmas funções da tela do cliente: preço e m² não podem divergir.
  const preco = precoDaUnidade(unidade)
  const m2 = valorM2Da(unidade)
  const local = localizacaoUnidade(unidade)

  return (
    <li className="suporte-unidade">
      <div className="suporte-unidade__topo">
        <div>
          <div className="suporte-unidade__nome">{rotuloUnidade(unidade, indice)}</div>
          {local && <div className="suporte-unidade__local">{local}</div>}
        </div>

        <div className="suporte-unidade__preco">
          <div className="suporte-unidade__valor">{preco === null ? TRACO : fmtMoeda(preco)}</div>
          {m2 !== null && <div className="suporte-unidade__m2">{fmtMoeda(m2)}/m²</div>}
        </div>
      </div>

      <div className="suporte-unidade__dados">
        {[
          ['Metragem', unidade.metragem_total ? fmtArea(unidade.metragem_total) : fmtArea(unidade.metragem)],
          ['Dorm.', fmtInteiro(unidade.dormitorios)],
          ['Suítes', fmtInteiro(unidade.suites)],
          ['Vagas', fmtInteiro(unidade.vagas)],
          ['Situação', fmtTexto(unidade.status)],
        ].map(([rotulo, valor]) => (
          <span key={rotulo}>
            <span className="suporte-unidade__rotulo">{rotulo}</span> {valor}
          </span>
        ))}
      </div>

      {unidade.fluxos.length === 0 ? (
        <p className="suporte-vazio">Sem tabela de venda cadastrada.</p>
      ) : (
        unidade.fluxos.map((fluxo) => <CartaoFluxoLeitura key={fluxo.id} fluxo={fluxo} valorDaUnidade={preco} />)
      )}
    </li>
  )
}

/** A composição da tabela de venda, com a mesma conta do cliente. */
function CartaoFluxoLeitura({ fluxo, valorDaUnidade }: { fluxo: FluxoPagamento; valorDaUnidade: number | null }) {
  const detalhe = detalharFluxo(fluxo, valorDaUnidade)

  return (
    <div className="suporte-fluxo">
      <div className="suporte-fluxo__topo">
        <span className="suporte-fluxo__nome">{fluxo.nome || 'Tabela de venda'}</span>
        <span className="suporte-fluxo__base">
          {detalhe.base === null ? 'sem valor do imóvel' : fmtMoeda(detalhe.base)}
          {detalhe.base !== null && !detalhe.baseDoFluxo && (
            <span className="suporte-fluxo__origem"> (preço da unidade)</span>
          )}
        </span>
      </div>

      <div className="suporte-fluxo__partes">
        {detalhe.partes.map((parte) => (
          <span key={parte.rotulo} className="suporte-fluxo__parte">
            <span className="suporte-fluxo__rotulo">{parte.rotulo}</span>
            <strong>{parte.valor === null ? TRACO : fmtMoeda(parte.valor)}</strong>
            {parte.percentual !== null && <span className="suporte-fluxo__pct">{fmtPct(parte.percentual)}</span>}
            {parte.detalhe && <span className="suporte-fluxo__detalhe">{parte.detalhe}</span>}
          </span>
        ))}
      </div>

      {/* A soma que não fecha é a causa número um de "meu fluxo está errado" —
          o suporte precisa ver isso sem abrir a calculadora. */}
      {detalhe.diferenca !== null && Math.abs(detalhe.diferenca) > 1 && (
        <div className={`suporte-fluxo__conferencia${detalhe.diferenca < 0 ? ' suporte-fluxo__conferencia--passou' : ''}`}>
          <Icone nome="alerta" tamanho={13} />
          {detalhe.diferenca > 0
            ? `Faltam ${fmtMoeda(detalhe.diferenca)} para fechar o valor do imóvel`
            : `A tabela passa ${fmtMoeda(Math.abs(detalhe.diferenca))} do valor do imóvel`}
        </div>
      )}
    </div>
  )
}

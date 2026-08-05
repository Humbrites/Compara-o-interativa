import { useEffect, useMemo, useState } from 'react'
import type { Empreendimento } from '../types'
import { fmtArea, fmtEntrega, fmtFaixaMetragem, fmtInteiro, fmtMoeda, fmtTexto, TRACO } from '../lib/format'
import { corDoStatus } from '../lib/opcoes'
import { fotosDe } from '../lib/imagens'
import { Icone, type NomeIcone } from './Icones'
import { CartaoFluxo } from './CartaoFluxo'
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
  onAdicionarFluxo: () => void
  onCompararCom: () => void
  onFechar: () => void
}

export function PainelDetalhe({
  empreendimento: e,
  podeComparar,
  onEditar,
  onExcluir,
  onAdicionarFluxo,
  onCompararCom,
  onFechar,
}: Props) {
  const local = [e.bairro, e.cidade].filter(Boolean).join(', ')

  const fotos = useMemo(() => fotosDe(e), [e])
  // A galeria some quando todo link quebra; ai o nome volta para o cabecalho.
  const [galeriaVazia, setGaleriaVazia] = useState(false)
  useEffect(() => setGaleriaVazia(false), [e.id])
  const temCapa = fotos.length > 0 && !galeriaVazia

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
        {/* Sem foto (ou com link quebrado) nao vale gastar 190px com um
            placeholder: o nome sobe para o cabecalho e o painel comeca no conteudo. */}
        {fotos.length > 0 && (
          <Galeria key={e.id} fotos={fotos} nome={e.nome} tipo={e.tipo} onVazia={setGaleriaVazia} />
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
            <ItemFicha icone="cama" rotulo="Dormitórios" valor={fmtInteiro(e.dormitorios)} />
            <ItemFicha icone="predio" rotulo="Suítes" valor={fmtInteiro(e.suites)} />
            <ItemFicha icone="banheira" rotulo="Banheiros" valor={fmtInteiro(e.banheiros)} />
            <ItemFicha icone="carro" rotulo="Vagas" valor={fmtInteiro(e.vagas)} />
            <ItemFicha icone="regua" rotulo="Metragem" valor={fmtFaixaMetragem(e.metragem_min, e.metragem_max)} />
            <ItemFicha icone="grafico" rotulo="Metragem máx." valor={fmtArea(e.metragem_max)} />
            <ItemFicha icone="obra" rotulo="Status" valor={fmtTexto(e.status_obra)} />
            <ItemFicha icone="calendario" rotulo="Entrega" valor={fmtEntrega(e.entrega)} />
          </div>

          {podeComparar && (
            <button type="button" className="btn btn--secundario btn--bloco" onClick={onCompararCom} style={{ marginBottom: 'var(--e5)' }}>
              <Icone nome="balanca" tamanho={15} />
              Comparar com outro empreendimento
            </button>
          )}

          <section className="bloco">
            <h3 className="bloco__titulo">
              <Icone nome="cartao" tamanho={13} />
              Fluxos de pagamento
              <button type="button" className="btn btn--fantasma btn--pequeno" onClick={onAdicionarFluxo}>
                <Icone nome="mais" tamanho={13} />
                Adicionar
              </button>
            </h3>

            {e.fluxos.length === 0 ? (
              <div className="observacao">
                Nenhum fluxo de pagamento cadastrado. Adicione a tabela de venda para que ela entre no comparativo.
              </div>
            ) : (
              e.fluxos.map((fluxo, indice) => <CartaoFluxo key={fluxo.id} fluxo={fluxo} indice={indice} />)
            )}
          </section>

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

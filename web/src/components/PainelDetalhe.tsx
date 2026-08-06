import { useEffect, useMemo, useState } from 'react'
import type { Empreendimento } from '../types'
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
import { resumoUnidades } from '../lib/unidades'
import { Icone, type NomeIcone } from './Icones'
import { CartaoFluxo } from './CartaoFluxo'
import { CartaoUnidade } from './CartaoUnidade'
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
  onAdicionarUnidade: () => void
  onCalcularCub: () => void
  onSimularInvestimento: () => void
  onCompararCom: () => void
  onFechar: () => void
}

export function PainelDetalhe({
  empreendimento: e,
  podeComparar,
  onEditar,
  onExcluir,
  onAdicionarFluxo,
  onAdicionarUnidade,
  onCalcularCub,
  onSimularInvestimento,
  onCompararCom,
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
                Nenhuma unidade cadastrada. Cadastre as plantas (metragem, dormitórios, vagas, posição e preço) para
                comparar unidade a unidade.
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
                  <CartaoUnidade key={unidade.id} unidade={unidade} indice={indice} />
                ))}
              </>
            )}
          </section>

          <section className="bloco">
            <h3 className="bloco__titulo">
              <Icone nome="cartao" tamanho={13} />
              Fluxos de pagamento
              <button type="button" className="btn btn--fantasma btn--pequeno" onClick={onAdicionarFluxo}>
                <Icone nome="mais" tamanho={13} />
                Adicionar
              </button>
            </h3>

            <button type="button" className="btn btn--secundario btn--bloco" onClick={onCalcularCub}>
              <Icone nome="grafico" tamanho={15} />
              Calcular valor com CUB
            </button>

            {e.fluxos.length === 0 ? (
              <div className="observacao">
                Nenhum fluxo geral cadastrado. A tabela de venda pode ficar aqui (vale para o empreendimento inteiro)
                ou dentro de cada unidade.
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

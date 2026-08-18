import { useMemo } from 'react'

import { analisarUnidade, textoDaPosicao, textoDoParcelamento, type AnaliseDaUnidade } from '../lib/analise'
import { useBaseM2 } from '../lib/baseM2'
import { fmtArea, fmtMoeda, TRACO } from '../lib/format'
import { fmtPercentual } from '../lib/cub'
import { rotuloUnidade } from '../lib/unidades'
import type { Unidade } from '../types'
import { Icone, type NomeIcone } from './Icones'
import { Modal, Selo } from './ui'

/**
 * Nivel 1 da analise: "esta unidade e interessante?".
 *
 * Nao repete a ficha da unidade (metragem, dormitorios, vagas ja estao no
 * cartao dela) — o que esta tela responde e a pergunta financeira: quanto sai
 * do bolso, QUANDO sai, quanto fica para o banco e como esse preco por metro
 * se compara com o das outras unidades do mesmo predio.
 */

interface Props {
  unidade: Unidade
  /** Todas as unidades do empreendimento — e delas que sai a comparacao. */
  unidades: Unidade[]
  indice: number
  nomeDoEmpreendimento: string
  onFechar: () => void
}

const CORES_DA_POSICAO: Record<AnaliseDaUnidade['posicao'], string> = {
  abaixo: 'verde',
  'na-media': 'azul',
  acima: 'ambar',
  unica: 'cinza',
  'sem-base': 'contorno',
}

const ROTULOS_DA_POSICAO: Record<AnaliseDaUnidade['posicao'], string> = {
  abaixo: 'Abaixo da média',
  'na-media': 'Na média',
  acima: 'Acima da média',
  unica: 'Única com preço',
  'sem-base': 'Sem comparação',
}

function Numero({
  icone,
  rotulo,
  valor,
  dica,
  tom = 'neutro',
}: {
  icone: NomeIcone
  rotulo: string
  valor: string
  dica?: string
  tom?: 'neutro' | 'entrada' | 'obra' | 'saldo'
}) {
  return (
    <div className={`analise-numero analise-numero--${tom}`}>
      <span className="analise-numero__rotulo">
        <Icone nome={icone} tamanho={12} />
        {rotulo}
      </span>
      <span className="analise-numero__valor">{valor}</span>
      {dica && <span className="analise-numero__dica">{dica}</span>}
    </div>
  )
}

/** Uma barra proporcional: entrada, obra e saldo sobre o preço. */
function BarraDoPagamento({ analise }: { analise: AnaliseDaUnidade }) {
  const base = analise.valor
  if (base === null || base <= 0) return null

  const partes = [
    { chave: 'entrada', rotulo: 'Entrada', valor: analise.entrada ?? 0, classe: 'entrada' },
    { chave: 'obra', rotulo: 'Durante a obra', valor: analise.durante ?? 0, classe: 'obra' },
    { chave: 'saldo', rotulo: 'Saldo na entrega', valor: analise.saldo ?? 0, classe: 'saldo' },
  ].filter((parte) => parte.valor > 0)

  if (partes.length === 0) return null

  return (
    <div className="analise-barra">
      <div className="analise-barra__trilho">
        {partes.map((parte) => (
          <span
            key={parte.chave}
            className={`analise-barra__parte analise-barra__parte--${parte.classe}`}
            style={{ width: `${(parte.valor / base) * 100}%` }}
            title={`${parte.rotulo}: ${fmtMoeda(parte.valor)}`}
          />
        ))}
      </div>
      <div className="analise-barra__legenda">
        {partes.map((parte) => (
          <span key={parte.chave} className="analise-barra__item">
            <span className={`analise-barra__ponto analise-barra__ponto--${parte.classe}`} />
            {parte.rotulo} · {fmtPercentual((parte.valor / base) * 100, 1)}
          </span>
        ))}
      </div>
    </div>
  )
}

export function AnaliseUnidade({ unidade, unidades, indice, nomeDoEmpreendimento, onFechar }: Props) {
  const base = useBaseM2()
  const analise = useMemo(() => analisarUnidade(unidade, unidades, base), [unidade, unidades, base])

  const semTabela = analise.fluxo === null
  const pct = (valor: number | null) => (valor === null ? TRACO : fmtPercentual(valor, 1))
  const dinheiro = (valor: number | null) => (valor === null ? TRACO : fmtMoeda(valor))

  return (
    <Modal
      titulo={`${rotuloUnidade(unidade, indice)}${analise.metragem !== null ? ` — ${fmtArea(analise.metragem)}` : ''}`}
      subtitulo={`${nomeDoEmpreendimento} · análise da oportunidade`}
      largo
      onFechar={onFechar}
      rodape={
        <div className="direita">
          <button type="button" className="btn btn--primario" onClick={onFechar}>
            Fechar
          </button>
        </div>
      }
    >
      <section className="form-secao form-secao--dados">
        <h3 className="form-secao__titulo">
          <Icone nome="dinheiro" tamanho={13} />
          O que a unidade custa
        </h3>

        <div className="analise-numeros">
          <Numero icone="dinheiro" rotulo="Valor" valor={dinheiro(analise.valor)} dica="preço da unidade" />
          <Numero
            icone="regua"
            rotulo="Valor por m²"
            valor={dinheiro(analise.valorM2)}
            dica={analise.metragem !== null ? `sobre ${fmtArea(analise.metragem)}` : 'informe a metragem'}
          />
          <Numero
            icone="cartao"
            rotulo="Entrada"
            valor={dinheiro(analise.entrada)}
            dica={`${pct(analise.pctEntrada)} do valor`}
            tom="entrada"
          />
          <Numero
            icone="obra"
            rotulo="Durante a obra"
            valor={dinheiro(analise.durante)}
            dica={textoDoParcelamento(analise, (v) => fmtMoeda(v)) ?? `${pct(analise.pctDurante)} · parcelas e reforços`}
            tom="obra"
          />
          <Numero
            icone="chave"
            rotulo="Saldo na entrega"
            valor={dinheiro(analise.saldo)}
            dica={`${pct(analise.pctFinanciavel)} · vai para o banco`}
            tom="saldo"
          />
        </div>

        {semTabela ? (
          <p className="campo__dica linha-calculo linha-calculo--alerta">
            <Icone nome="alerta" tamanho={12} /> Esta unidade não tem tabela de venda cadastrada — sem ela dá para
            saber o preço, mas não como ele é pago. Cadastre o fluxo de pagamento para ver a análise completa.
          </p>
        ) : (
          <BarraDoPagamento analise={analise} />
        )}
      </section>

      <section className="form-secao form-secao--chaves">
        <h3 className="form-secao__titulo">
          <Icone nome="banco" tamanho={13} />
          Quanto o comprador precisa ter
        </h3>

        <div className="analise-numeros">
          <Numero
            icone="chave"
            rotulo="Capital inicial"
            valor={dinheiro(analise.entrada)}
            dica="para assinar hoje"
            tom="entrada"
          />
          <Numero
            icone="banco"
            rotulo="Capital até a entrega"
            valor={dinheiro(analise.ateAEntrega)}
            dica={`${pct(analise.pctAteAEntrega)} do valor · entrada + obra`}
            tom="obra"
          />
          <Numero
            icone="grafico"
            rotulo="% financiável"
            valor={pct(analise.pctFinanciavel)}
            dica="o que o banco cobre na entrega"
            tom="saldo"
          />
        </div>

        <p className="campo__dica linha-calculo">
          <Icone nome="info" tamanho={12} /> <strong>Capital inicial</strong> é o que sai do bolso na assinatura;{' '}
          <strong>capital até a entrega</strong> soma a ele tudo que é pago durante a obra. O restante —{' '}
          {dinheiro(analise.saldo)} — é o que se financia quando as chaves saem.
        </p>
      </section>

      <section className="form-secao form-secao--resultado">
        <h3 className="form-secao__titulo">
          <Icone nome="balanca" tamanho={13} />
          Como se compara no empreendimento
        </h3>

        <div className="analise-comparacao">
          <div className="analise-comparacao__faixa">
            <span className="analise-numero__rotulo">Faixa do empreendimento</span>
            <span className="analise-comparacao__valor">
              {analise.faixaM2.min === null
                ? TRACO
                : `${fmtMoeda(analise.faixaM2.min)} — ${fmtMoeda(analise.faixaM2.max as number)}/m²`}
            </span>
            <span className="analise-numero__dica">
              {analise.faixaM2.media !== null ? `média de ${fmtMoeda(analise.faixaM2.media)}/m²` : 'sem unidades com preço'}
            </span>
          </div>

          <div className="analise-comparacao__posicao">
            <Selo cor={CORES_DA_POSICAO[analise.posicao]}>{ROTULOS_DA_POSICAO[analise.posicao]}</Selo>
            <p>{textoDaPosicao(analise)}</p>
          </div>
        </div>
      </section>
    </Modal>
  )
}

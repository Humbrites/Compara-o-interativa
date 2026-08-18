import type { ReactNode } from 'react'
import type { Unidade } from '../types'
import { fmtArea, fmtInteiro, fmtMoeda, TRACO } from '../lib/format'
import { corDoStatusUnidade } from '../lib/opcoes'
import { useBaseM2 } from '../lib/baseM2'
import { localizacaoUnidade, posicaoUnidade, precoDaUnidade, rotuloUnidade, ROTULO_BASE_M2, valorM2Da } from '../lib/unidades'
import { Icone } from './Icones'
import { Selo } from './ui'

/**
 * A unidade em UMA LINHA.
 *
 * O cartão (que continua no cadastro) ocupa ~180px de altura: com seis plantas,
 * a lista sozinha passava de mil pixels e engolia a tela do imóvel. Aqui cada
 * unidade cabe numa linha comparável com a de cima e a de baixo — que é como se
 * lê uma tabela de vendas — e só a unidade aberta mostra o detalhe e as ações.
 *
 * O preço sai de `precoDaUnidade`, a única definição de preço do projeto: ler
 * `unidade.valor` cru deixa sem preço quem só tem valor na tabela de pagamento.
 */

interface Props {
  unidade: Unidade
  indice: number
  aberta: boolean
  onAlternar: () => void
  /** Ações e o fluxo de pagamento — só aparecem com a linha aberta. */
  detalhe?: ReactNode
}

export function LinhaUnidade({ unidade, indice, aberta, onAlternar, detalhe }: Props) {
  const base = useBaseM2()
  const local = localizacaoUnidade(unidade)
  const posicao = posicaoUnidade(unidade)
  const preco = precoDaUnidade(unidade)
  const valorM2 = valorM2Da(unidade, base)

  return (
    <div className={`linha-unidade${aberta ? ' linha-unidade--aberta' : ''}`}>
      <button type="button" className="linha-unidade__resumo" onClick={onAlternar} aria-expanded={aberta}>
        <span className="linha-unidade__seta">
          <Icone nome={aberta ? 'seta_cima' : 'seta_baixo'} tamanho={13} />
        </span>

        <span className="linha-unidade__quem">
          <span className="linha-unidade__nome">{rotuloUnidade(unidade, indice)}</span>
          {unidade.tipologia && <span className="linha-unidade__tipologia">{unidade.tipologia}</span>}
        </span>

        {unidade.status && (
          <span className="linha-unidade__status">
            <Selo cor={corDoStatusUnidade(unidade.status)}>{unidade.status}</Selo>
          </span>
        )}

        {/* Os três números que decidem a conversa, sempre nas mesmas colunas —
            é o alinhamento que deixa comparar uma linha com a outra. */}
        <span className="linha-unidade__numeros">
          <span className="linha-unidade__num" title="Área privativa">
            {fmtArea(unidade.metragem)}
          </span>
          <span className="linha-unidade__num" title="Dormitórios">
            {fmtInteiro(unidade.dormitorios)} <span className="linha-unidade__uni">dorm.</span>
          </span>
          <span className="linha-unidade__num" title="Vagas">
            {fmtInteiro(unidade.vagas)} <span className="linha-unidade__uni">vagas</span>
          </span>
        </span>

        <span className="linha-unidade__preco">
          <span className="linha-unidade__valor">{preco !== null ? fmtMoeda(preco) : TRACO}</span>
          {valorM2 !== null && (
            <span className="linha-unidade__m2" title={`Calculado pela ${ROTULO_BASE_M2[base]}`}>
              {fmtMoeda(valorM2)}/m²
            </span>
          )}
        </span>
      </button>

      {aberta && (
        <div className="linha-unidade__detalhe">
          <div className="linha-unidade__ficha">
            {local && (
              <span>
                <Icone nome="predio" tamanho={12} /> {local}
              </span>
            )}
            {posicao && (
              <span>
                <Icone nome="alvo" tamanho={12} /> {posicao}
              </span>
            )}
            {unidade.metragem_total !== null && (
              <span>
                <Icone nome="regua" tamanho={12} /> {fmtArea(unidade.metragem_total)} total
              </span>
            )}
            {/* Área comum, terraço e espaço complementar só aparecem quando a
                tabela os trouxe: campo vazio é "não informado", nunca zero. */}
            {unidade.area_comum !== null && (
              <span>
                <Icone nome="regua" tamanho={12} /> {fmtArea(unidade.area_comum)} de área comum
              </span>
            )}
            {unidade.area_terraco !== null && (
              <span>
                <Icone nome="regua" tamanho={12} /> {fmtArea(unidade.area_terraco)} de terraço
              </span>
            )}
            {unidade.espaco_complementar && (
              <span>
                <Icone nome="lista" tamanho={12} /> {unidade.espaco_complementar}
              </span>
            )}
            {unidade.vagas_detalhe && (
              <span>
                <Icone nome="carro" tamanho={12} /> {unidade.vagas_detalhe}
              </span>
            )}
            {unidade.suites !== null && (
              <span>
                <Icone nome="cama" tamanho={12} /> {fmtInteiro(unidade.suites)} suíte(s)
              </span>
            )}
            {unidade.banheiros !== null && (
              <span>
                <Icone nome="banheira" tamanho={12} /> {fmtInteiro(unidade.banheiros)} banheiro(s)
              </span>
            )}
          </div>

          {detalhe}
        </div>
      )}
    </div>
  )
}

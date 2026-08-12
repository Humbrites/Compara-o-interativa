import { useState } from 'react'

import { PESOS_PADRAO, calcularScore, type PesosDoScore, type ScoreDaOportunidade } from '../lib/score'
import type { AnaliseDaUnidade } from '../lib/analise'
import type { Unidade } from '../types'
import { Icone } from './Icones'

/**
 * O score na tela — e a razao dele.
 *
 * ⚠️ A nota nunca aparece sozinha: a lista de criterios abaixo dela mostra a
 * nota de cada um, o peso e a frase que explica. E o que o corretor le em voz
 * alta quando o cliente pergunta "por que 82?".
 */

const CHAVE_DOS_PESOS = 'compara:pesos-do-score'

/** Os pesos ficam no navegador de quem usa: e uma preferencia, nao um dado. */
export function lerPesosSalvos(): PesosDoScore {
  try {
    const salvo = window.localStorage.getItem(CHAVE_DOS_PESOS)
    if (!salvo) return PESOS_PADRAO
    const lido = JSON.parse(salvo) as Partial<PesosDoScore>
    return { ...PESOS_PADRAO, ...lido }
  } catch {
    return PESOS_PADRAO
  }
}

function gravarPesos(pesos: PesosDoScore) {
  try {
    window.localStorage.setItem(CHAVE_DOS_PESOS, JSON.stringify(pesos))
  } catch {
    // Navegador sem storage (aba anônima restrita): os pesos valem só nesta sessão.
  }
}

const CORES: Record<ScoreDaOportunidade['faixa'], string> = {
  otima: 'verde',
  boa: 'azul',
  regular: 'ambar',
  atencao: 'vermelho',
  'sem-dados': 'cinza',
}

interface Props {
  analise: AnaliseDaUnidade
  unidades: Unidade[]
}

export function ScoreOportunidade({ analise, unidades }: Props) {
  const [pesos, setPesos] = useState<PesosDoScore>(lerPesosSalvos)
  const [ajustando, setAjustando] = useState(false)

  const score = calcularScore(analise, unidades, pesos)

  function mudarPeso(chave: keyof PesosDoScore, valor: number) {
    const novos = { ...pesos, [chave]: Math.max(0, Math.min(100, valor)) }
    setPesos(novos)
    gravarPesos(novos)
  }

  return (
    <div className="score">
      <div className={`score__nota score__nota--${CORES[score.faixa]}`}>
        <span className="score__numero">
          {score.nota === null ? '—' : score.nota.toFixed(0)}
          {score.nota !== null && <span className="score__de">/100</span>}
        </span>
        <span className="score__rotulo">{score.rotulo}</span>
      </div>

      <div className="score__criterios">
        {score.criterios.map((criterio) => (
          <div key={criterio.chave} className={`score__criterio${criterio.nota === null ? ' score__criterio--sem' : ''}`}>
            <div className="score__linha">
              <span className="score__criterio-nome">
                {criterio.rotulo}
                {ajustando && (
                  <input
                    className="entrada score__peso"
                    type="number"
                    min={0}
                    max={100}
                    value={criterio.peso}
                    onChange={(e) => mudarPeso(criterio.chave, Number(e.target.value))}
                    aria-label={`Peso de ${criterio.rotulo}`}
                  />
                )}
              </span>
              <span className="score__criterio-nota">
                {criterio.nota === null ? 'sem dado' : `${criterio.nota.toFixed(0)} × ${criterio.peso}%`}
              </span>
            </div>

            {criterio.nota !== null && (
              <div className="score__trilho">
                <span className="score__preenchido" style={{ width: `${criterio.nota}%` }} />
              </div>
            )}

            <span className="score__explicacao">{criterio.explicacao}</span>
          </div>
        ))}
      </div>

      <div className="score__rodape">
        <button type="button" className="link-acao" onClick={() => setAjustando((v) => !v)}>
          <Icone nome={ajustando ? 'seta_cima' : 'seta_baixo'} tamanho={12} />
          {ajustando ? 'Ocultar os pesos' : 'Ajustar os pesos'}
        </button>

        {ajustando && (
          <button
            type="button"
            className="link-acao"
            onClick={() => {
              setPesos(PESOS_PADRAO)
              gravarPesos(PESOS_PADRAO)
            }}
          >
            Voltar ao padrão
          </button>
        )}

        {score.pesoConsiderado < 100 && score.nota !== null && (
          <span className="campo__dica">
            <Icone nome="info" tamanho={12} /> Critérios sem dado ficaram de fora: a nota é a média dos{' '}
            {score.pesoConsiderado}% de peso que tinham informação.
          </span>
        )}
      </div>
    </div>
  )
}

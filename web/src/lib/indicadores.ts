import { useEffect, useRef, useState } from 'react'

import { api } from './api'
import type { IndicadorMercado } from '../types'

/**
 * Os indices de mercado para QUEM CALCULA (o simulador) — a faixa do cabecalho
 * tem a propria copia, porque la o assunto e exibir e revalidar de meia em
 * meia hora.
 *
 * A consulta ao Banco Central mora no servidor, com cache de 6 horas: pedir de
 * novo ao abrir o simulador nao gera trafego externo nenhum.
 */

export interface TaxaDoIndice {
  chave: string
  nome: string
  /** A ultima leitura publicada, em % ao mes. */
  mensalPublicado: number
  /**
   * O acumulado dos ultimos 12 meses — a taxa ANUAL que o simulador usa.
   *
   * ⚠️ Projetar o futuro pelo mes corrente seria refem de um mes atipico: o
   * IGP-M fechou julho/2026 em −1,16%, e um financiamento de trinta anos
   * calculado com deflacao seria mentira. Doze meses e a leitura que o proprio
   * mercado usa para dizer "o IPCA esta em 4,4%".
   */
  anual: number | null
  /** Data da leitura, em dd/mm/aaaa. */
  referencia: string
  /** true = a serie nao respondeu na ultima consulta; este e o valor anterior. */
  defasado: boolean
}

export interface IndicesDeMercado {
  taxas: Record<string, TaxaDoIndice>
  carregando: boolean
  erro: string | null
}

function paraTaxa(indicador: IndicadorMercado): TaxaDoIndice {
  return {
    chave: indicador.chave,
    nome: indicador.nome,
    mensalPublicado: indicador.valor,
    anual: indicador.acumulado12,
    referencia: indicador.referencia,
    defasado: Boolean(indicador.defasado),
  }
}

/** Busca uma vez, ao montar. Quem precisa de tempo real e a faixa do topo. */
export function useIndicesDeMercado(): IndicesDeMercado {
  const [taxas, setTaxas] = useState<Record<string, TaxaDoIndice>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true

    api
      .indicadores()
      .then((resposta) => {
        if (!vivo.current) return
        const mapa: Record<string, TaxaDoIndice> = {}
        for (const indicador of resposta.indicadores) mapa[indicador.chave] = paraTaxa(indicador)
        setTaxas(mapa)
        setErro(resposta.indicadores.length === 0 ? resposta.erro ?? 'Índices indisponíveis' : null)
      })
      .catch((falha: unknown) => {
        if (!vivo.current) return
        setErro(falha instanceof Error ? falha.message : 'Falha ao buscar os índices')
      })
      .finally(() => {
        if (vivo.current) setCarregando(false)
      })

    return () => {
      vivo.current = false
    }
  }, [])

  return { taxas, carregando, erro }
}

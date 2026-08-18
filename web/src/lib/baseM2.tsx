import { createContext, useContext, type ReactNode } from 'react'

import { BASE_M2_PADRAO, type BaseM2 } from './unidades'

/**
 * Qual metragem divide o preco no valor do m² desta conta.
 *
 * Vai por contexto, e nao por prop, pelo mesmo motivo de `usePodeEditar`: o m²
 * aparece em cinco niveis diferentes (lista, cartao, linha da unidade, ficha,
 * formulario). Passar prop ate la faria toda tela nova ter de lembrar de
 * repassar — e a que esquecesse mostraria um numero calculado por outra
 * metodologia, sem nenhum aviso, ao lado das que acertaram.
 *
 * O padrao e 'privativa': componente montado fora do provedor (um teste, um
 * lugar novo) usa a mesma base que a conta nova recebe no cadastro.
 */
const BaseDoM2 = createContext<BaseM2>(BASE_M2_PADRAO)

export function ProvedorBaseM2({ base, children }: { base: BaseM2; children: ReactNode }) {
  return <BaseDoM2.Provider value={base}>{children}</BaseDoM2.Provider>
}

export function useBaseM2(): BaseM2 {
  return useContext(BaseDoM2)
}

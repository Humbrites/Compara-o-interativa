import { createContext, useContext, type ReactNode } from 'react'

/**
 * Quem pode GRAVAR na tela que esta aberta.
 *
 * A mesma tela serve tres situacoes: o cliente na base dele, o cliente com a
 * conta suspensa e o master vendo a base de um cliente para apresentar o
 * sistema. Nas duas ultimas nada grava — e um botao que existe so para o
 * clique falhar com 402/403 e pior do que botao nenhum.
 *
 * Vai por contexto, e nao por prop, porque os botoes de escrita moram em
 * cinco niveis diferentes (painel, cartao da unidade, fluxo). Passar prop ate
 * la faria toda tela nova ter de lembrar de repassar — esquecer o repasse
 * abriria o botao de novo, calado.
 *
 * O padrao e `true`: componente montado fora do provedor (um teste, um lugar
 * novo) se comporta como sempre se comportou.
 */
const PodeEditar = createContext(true)

export function ProvedorDeEdicao({ pode, children }: { pode: boolean; children: ReactNode }) {
  return <PodeEditar.Provider value={pode}>{children}</PodeEditar.Provider>
}

export function usePodeEditar() {
  return useContext(PodeEditar)
}

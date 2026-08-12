import { useMemo, useState } from 'react'
import type { Empreendimento } from '../types'
import { fmtEntrega, fmtMoeda, TRACO } from '../lib/format'
import { corDoStatus } from '../lib/opcoes'
import { capaDe } from '../lib/imagens'
import { resumoUnidades } from '../lib/unidades'
import { Icone } from './Icones'
import { Selo } from './ui'

/**
 * A lista dos empreendimentos, SEMPRE na tela, ao lado do mapa.
 *
 * Antes ela morava num modal atrás do botão "Empreendimentos": escolher um
 * imóvel — que é o primeiro trabalho de toda visita — exigia abrir uma janela,
 * e a janela tinha a PRÓPRIA busca, diferente da busca do dashboard. Duas
 * buscas para a mesma pergunta é o retrato do "ficar procurando".
 *
 * Aqui a lista responde de cara "o que existe" e "qual eu abro", e o mapa fica
 * do lado respondendo "onde fica".
 */

type Ordem = 'nome' | 'preco' | 'entrega'

const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: 'nome', rotulo: 'Nome' },
  { valor: 'preco', rotulo: 'Menor preço' },
  { valor: 'entrega', rotulo: 'Entrega mais próxima' },
]

/** O menor preço do prédio — o mesmo número que a tela do imóvel mostra. */
function precoDe(e: Empreendimento): number | null {
  return resumoUnidades(e.unidades).valor.min
}

interface Props {
  lista: Empreendimento[]
  /** Quantos existem na base, para a lista dizer que está filtrando. */
  total: number
  selecionado: number | null
  onSelecionar: (id: number) => void
}

/* "Adicionar empreendimento" nao se repete aqui: o botao primario da barra do
   topo ja e o unico caminho para cadastrar. */
export function ListaLateral({ lista, total, selecionado, onSelecionar }: Props) {
  const [ordem, setOrdem] = useState<Ordem>('nome')

  const ordenada = useMemo(() => {
    const copia = [...lista]
    if (ordem === 'preco') {
      // Sem preço cadastrado o imóvel vai para o fim: ordenar por um dado que
      // não existe faria a lista parecer embaralhada.
      copia.sort((a, b) => (precoDe(a) ?? Infinity) - (precoDe(b) ?? Infinity))
    } else if (ordem === 'entrega') {
      copia.sort((a, b) => (a.entrega ?? '9999-99').localeCompare(b.entrega ?? '9999-99'))
    } else {
      copia.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    }
    return copia
  }, [lista, ordem])

  return (
    <aside className="lista-lateral">
      <div className="lista-lateral__topo">
        <span className="lista-lateral__contagem">
          {lista.length === total
            ? `${total} ${total === 1 ? 'empreendimento' : 'empreendimentos'}`
            : `${lista.length} de ${total}`}
        </span>

        <label className="lista-lateral__ordem">
          <span className="lista-lateral__ordem-rotulo">Ordenar por</span>
          <select
            className="entrada lista-lateral__select"
            value={ordem}
            onChange={(ev) => setOrdem(ev.target.value as Ordem)}
            aria-label="Ordenar a lista"
          >
            {ORDENS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="lista-lateral__itens">
        {ordenada.length === 0 ? (
          <div className="lista-lateral__vazia">
            <Icone nome="busca" tamanho={18} />
            <p>Nenhum empreendimento com esses filtros.</p>
            <p className="campo__dica">Limpe a busca ou os filtros para ver a base inteira.</p>
          </div>
        ) : (
          ordenada.map((e) => {
            const resumo = resumoUnidades(e.unidades)
            const preco = precoDe(e)
            const capa = capaDe(e)
            const local = [e.bairro, e.cidade].filter(Boolean).join(', ')
            return (
              <button
                key={e.id}
                type="button"
                className={`item-imovel${selecionado === e.id ? ' item-imovel--ativo' : ''}`}
                onClick={() => onSelecionar(e.id)}
                title={`Abrir ${e.nome}`}
              >
                <div className="item-imovel__foto">
                  {capa ? (
                    <img src={capa} alt="" loading="lazy" />
                  ) : (
                    <Icone nome="predio" tamanho={18} />
                  )}
                </div>

                <div className="item-imovel__texto">
                  <span className="item-imovel__nome">{e.nome}</span>
                  <span className="item-imovel__local">
                    {local || e.construtora || TRACO}
                  </span>

                  <div className="item-imovel__selos">
                    {e.status_obra && (
                      <Selo cor={corDoStatus(e.status_obra)} icone="obra">
                        {e.status_obra}
                      </Selo>
                    )}
                    {e.entrega && <Selo cor="cinza">{fmtEntrega(e.entrega)}</Selo>}
                  </div>

                  <div className="item-imovel__numeros">
                    {preco !== null && (
                      <span className="item-imovel__preco">
                        a partir de <strong>{fmtMoeda(preco)}</strong>
                      </span>
                    )}
                    {resumo.total > 0 && (
                      <span className="item-imovel__unidades">
                        {resumo.total} {resumo.total === 1 ? 'unidade' : 'unidades'}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

    </aside>
  )
}

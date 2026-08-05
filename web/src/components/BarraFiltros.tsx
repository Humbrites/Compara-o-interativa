import { useState } from 'react'
import type { Empreendimento, Filtros } from '../types'
import { FILTROS_VAZIOS } from '../types'
import { opcoesDe } from '../lib/dashboard'
import { STATUS_OBRA, TIPOS } from '../lib/opcoes'
import { Icone } from './Icones'

interface Props {
  filtros: Filtros
  onMudar: (filtros: Filtros) => void
  lista: Empreendimento[]
  totalFiltrado: number
}

export function BarraFiltros({ filtros, onMudar, lista, totalFiltrado }: Props) {
  // Os filtros nascem recolhidos: a barra cheia de selects poluia o topo.
  const [aberto, setAberto] = useState(false)

  const cidades = opcoesDe(lista, 'cidade')
  const construtoras = opcoesDe(lista, 'construtora')

  function mudar<C extends keyof Filtros>(campo: C, valor: Filtros[C]) {
    onMudar({ ...filtros, [campo]: valor })
  }

  // A busca nao conta como "filtro aplicado" — ela tem o proprio campo visivel.
  const ativos = Object.entries(filtros).filter(
    ([chave, valor]) => chave !== 'busca' && valor !== FILTROS_VAZIOS[chave as keyof Filtros],
  ).length
  const temAlgo = ativos > 0 || filtros.busca !== ''

  return (
    <>
      <div className="filtros">
        <div className="busca">
          <span className="busca__icone">
            <Icone nome="busca" tamanho={15} />
          </span>
          <input
            className="entrada"
            value={filtros.busca}
            onChange={(e) => mudar('busca', e.target.value)}
            placeholder="Buscar por nome, construtora, cidade ou bairro…"
            aria-label="Pesquisar empreendimentos"
          />
          {filtros.busca && (
            <button type="button" className="busca__limpar" onClick={() => mudar('busca', '')} aria-label="Limpar busca">
              <Icone nome="fechar" tamanho={13} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`btn btn--secundario btn--pequeno${aberto ? ' btn--ativo' : ''}`}
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
        >
          <Icone nome="filtro" tamanho={14} />
          Filtros
          {ativos > 0 && <span className="filtros__contador">{ativos}</span>}
          <Icone nome={aberto ? 'seta_cima' : 'seta_baixo'} tamanho={13} />
        </button>

        <div className="filtros__resultado">
          <span className="filtros__contagem">
            <strong>{totalFiltrado}</strong> de {lista.length}
          </span>
          {temAlgo && (
            <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => onMudar(FILTROS_VAZIOS)}>
              <Icone nome="fechar" tamanho={13} />
              Limpar
            </button>
          )}
        </div>
      </div>

      {aberto && (
        <div className="filtros filtros--painel">
          <select
            className="entrada filtros__select"
            value={filtros.cidade}
            onChange={(e) => mudar('cidade', e.target.value)}
            aria-label="Filtrar por cidade"
          >
            <option value="">Todas as cidades</option>
            {cidades.map((cidade) => (
              <option key={cidade} value={cidade}>
                {cidade}
              </option>
            ))}
          </select>

          <select
            className="entrada filtros__select"
            value={filtros.construtora}
            onChange={(e) => mudar('construtora', e.target.value)}
            aria-label="Filtrar por construtora"
          >
            <option value="">Todas as construtoras</option>
            {construtoras.map((construtora) => (
              <option key={construtora} value={construtora}>
                {construtora}
              </option>
            ))}
          </select>

          <select
            className="entrada filtros__select"
            value={filtros.tipo}
            onChange={(e) => mudar('tipo', e.target.value)}
            aria-label="Filtrar por tipo"
          >
            <option value="">Todos os tipos</option>
            {TIPOS.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>

          <select
            className="entrada filtros__select"
            value={filtros.status}
            onChange={(e) => mudar('status', e.target.value)}
            aria-label="Filtrar por status da obra"
          >
            <option value="">Todos os status</option>
            {STATUS_OBRA.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            className="entrada filtros__select"
            value={filtros.dormitorios}
            onChange={(e) => mudar('dormitorios', e.target.value)}
            aria-label="Filtrar por dormitórios"
          >
            <option value="">Dormitórios</option>
            {[1, 2, 3, 4, 5].map((qtd) => (
              <option key={qtd} value={qtd}>
                {qtd}+ dormitório{qtd > 1 ? 's' : ''}
              </option>
            ))}
          </select>

          <div className="filtros__faixa">
            <span className="filtros__faixa-rotulo">Metragem</span>
            <input
              value={filtros.metragemMin}
              onChange={(e) => mudar('metragemMin', e.target.value)}
              placeholder="mín"
              inputMode="decimal"
              aria-label="Metragem mínima"
            />
            <span className="filtros__separador">–</span>
            <input
              value={filtros.metragemMax}
              onChange={(e) => mudar('metragemMax', e.target.value)}
              placeholder="máx"
              inputMode="decimal"
              aria-label="Metragem máxima"
            />
          </div>

          <div className="filtros__faixa">
            <span className="filtros__faixa-rotulo">R$/m²</span>
            <input
              value={filtros.valorMin}
              onChange={(e) => mudar('valorMin', e.target.value)}
              placeholder="mín"
              inputMode="decimal"
              aria-label="Valor mínimo do m²"
            />
            <span className="filtros__separador">–</span>
            <input
              value={filtros.valorMax}
              onChange={(e) => mudar('valorMax', e.target.value)}
              placeholder="máx"
              inputMode="decimal"
              aria-label="Valor máximo do m²"
            />
          </div>
        </div>
      )}
    </>
  )
}

import { useState } from 'react'
import type { FluxoInput, FluxoPagamento } from '../types'
import { api } from '../lib/api'
import { Campo, Estado } from './ui'
import { Icone } from './Icones'
import { CartaoFluxo } from './CartaoFluxo'

type Formulario = Record<string, string>

const CAMPOS = [
  'nome', 'entrada_pct', 'entrada_valor', 'parcelas', 'parcela_valor',
  'reforcos_qtd', 'reforco_valor', 'chaves_pct', 'financiamento_pct',
  'descricao', 'observacoes',
]

const VAZIO: Formulario = Object.fromEntries(CAMPOS.map((c) => [c, '']))

function paraFormulario(fluxo: FluxoPagamento): Formulario {
  const form: Formulario = { ...VAZIO }
  for (const campo of CAMPOS) {
    const valor = (fluxo as unknown as Record<string, unknown>)[campo]
    form[campo] = valor === null || valor === undefined ? '' : String(valor)
  }
  return form
}

interface Props {
  empreendimentoId: number
  /** Preenchido = o fluxo pertence a essa unidade, nao ao empreendimento. */
  unidadeId?: number | null
  fluxos: FluxoPagamento[]
  onMudou: (fluxos: FluxoPagamento[]) => void
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
}

export function FluxosDoEmpreendimento({ empreendimentoId, unidadeId = null, fluxos, onMudou, avisar }: Props) {
  const daUnidade = unidadeId !== null
  const [form, setForm] = useState<Formulario | null>(null)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)

  function abrirNovo() {
    setEditandoId(null)
    setForm({ ...VAZIO, nome: `Fluxo ${fluxos.length + 1}` })
  }

  function abrirEdicao(fluxo: FluxoPagamento) {
    setEditandoId(fluxo.id)
    setForm(paraFormulario(fluxo))
  }

  function mudar(campo: string, valor: string) {
    setForm((atual) => (atual ? { ...atual, [campo]: valor } : atual))
  }

  async function salvar() {
    if (!form) return
    setSalvando(true)
    try {
      const dados: FluxoInput = { empreendimento_id: empreendimentoId }
      if (daUnidade) dados.unidade_id = unidadeId
      for (const campo of CAMPOS) {
        dados[campo as keyof FluxoInput] = form[campo].trim() || null
      }

      if (editandoId !== null) {
        const atualizado = await api.editarFluxo(editandoId, dados)
        onMudou(fluxos.map((f) => (f.id === editandoId ? atualizado : f)))
        avisar('Fluxo atualizado')
      } else {
        const criado = await api.criarFluxo(dados)
        onMudou([...fluxos, criado])
        avisar('Fluxo adicionado')
      }
      setForm(null)
      setEditandoId(null)
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao salvar o fluxo', 'erro')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(fluxo: FluxoPagamento) {
    const nome = fluxo.nome?.trim() || 'este fluxo'
    if (!window.confirm(`Excluir ${nome}? Essa ação não pode ser desfeita.`)) return

    try {
      await api.excluirFluxo(fluxo.id)
      onMudou(fluxos.filter((f) => f.id !== fluxo.id))
      avisar('Fluxo excluído')
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao excluir', 'erro')
    }
  }

  return (
    <div>
      {fluxos.length === 0 && !form && (
        <Estado
          icone="cartao"
          titulo="Nenhum fluxo de pagamento ainda"
          texto={
            daUnidade
              ? 'Cadastre a tabela de venda desta unidade: entrada, parcelamento, reforços, chaves e financiamento. Ela entra no comparativo quando a unidade for escolhida.'
              : 'Cadastre a tabela de venda: entrada, parcelamento, reforços, chaves e financiamento. Um empreendimento pode ter vários fluxos.'
          }
          acao={
            <button type="button" className="btn btn--primario" onClick={abrirNovo}>
              <Icone nome="mais" tamanho={15} />
              Adicionar fluxo
            </button>
          }
        />
      )}

      {fluxos.length > 0 && (
        <div style={{ marginBottom: form ? 'var(--e5)' : 0 }}>
          {fluxos.map((fluxo, indice) => (
            <CartaoFluxo
              key={fluxo.id}
              fluxo={fluxo}
              indice={indice}
              onEditar={() => abrirEdicao(fluxo)}
              onExcluir={() => excluir(fluxo)}
            />
          ))}
        </div>
      )}

      {!form && fluxos.length > 0 && (
        <button type="button" className="btn btn--secundario btn--bloco" onClick={abrirNovo}>
          <Icone nome="mais" tamanho={15} />
          Adicionar outro fluxo
        </button>
      )}

      {form && (
        <section
          className="form-secao"
          style={{
            padding: 'var(--e5)',
            border: '1px solid var(--borda)',
            borderRadius: 'var(--raio-lg)',
            background: 'var(--superficie-2)',
          }}
        >
          <h3 className="form-secao__titulo">
            <Icone nome="cartao" tamanho={13} />
            {editandoId !== null ? 'Editar fluxo' : 'Novo fluxo de pagamento'}
          </h3>

          <div className="grade">
            <Campo rotulo="Nome do fluxo" className="col-inteira" dica="como a construtora chama a tabela">
              <input
                className="entrada"
                value={form.nome}
                onChange={(e) => mudar('nome', e.target.value)}
                placeholder="Ex.: Tabela padrão, Plano obra, À vista"
                autoFocus
              />
            </Campo>

            <Campo rotulo="Entrada" dica="%">
              <input
                className="entrada"
                value={form.entrada_pct}
                onChange={(e) => mudar('entrada_pct', e.target.value)}
                placeholder="20"
                inputMode="decimal"
              />
            </Campo>
            <Campo rotulo="Entrada" dica="R$">
              <input
                className="entrada"
                value={form.entrada_valor}
                onChange={(e) => mudar('entrada_valor', e.target.value)}
                placeholder="60000"
                inputMode="decimal"
              />
            </Campo>

            <Campo rotulo="Parcelamento" dica="nº de parcelas">
              <input
                className="entrada"
                value={form.parcelas}
                onChange={(e) => mudar('parcelas', e.target.value)}
                placeholder="36"
                inputMode="numeric"
              />
            </Campo>
            <Campo rotulo="Valor da parcela" dica="R$">
              <input
                className="entrada"
                value={form.parcela_valor}
                onChange={(e) => mudar('parcela_valor', e.target.value)}
                placeholder="2500"
                inputMode="decimal"
              />
            </Campo>

            <Campo rotulo="Reforços" dica="quantidade">
              <input
                className="entrada"
                value={form.reforcos_qtd}
                onChange={(e) => mudar('reforcos_qtd', e.target.value)}
                placeholder="3"
                inputMode="numeric"
              />
            </Campo>
            <Campo rotulo="Valor do reforço" dica="R$">
              <input
                className="entrada"
                value={form.reforco_valor}
                onChange={(e) => mudar('reforco_valor', e.target.value)}
                placeholder="15000"
                inputMode="decimal"
              />
            </Campo>

            <Campo rotulo="Chaves" dica="%">
              <input
                className="entrada"
                value={form.chaves_pct}
                onChange={(e) => mudar('chaves_pct', e.target.value)}
                placeholder="10"
                inputMode="decimal"
              />
            </Campo>
            <Campo rotulo="Financiamento" dica="%">
              <input
                className="entrada"
                value={form.financiamento_pct}
                onChange={(e) => mudar('financiamento_pct', e.target.value)}
                placeholder="80"
                inputMode="decimal"
              />
            </Campo>

            <Campo rotulo="Descrição livre" className="col-inteira">
              <textarea
                className="entrada"
                value={form.descricao}
                onChange={(e) => mudar('descricao', e.target.value)}
                placeholder="Ex.: entrada em 3x sem juros, reforços anuais em dezembro, saldo financiado pela Caixa."
                rows={3}
              />
            </Campo>

            <Campo rotulo="Observações" className="col-inteira">
              <textarea
                className="entrada"
                value={form.observacoes}
                onChange={(e) => mudar('observacoes', e.target.value)}
                placeholder="Condições especiais, validade da tabela, desconto para pagamento à vista…"
                rows={2}
              />
            </Campo>
          </div>

          <div style={{ display: 'flex', gap: 'var(--e3)', marginTop: 'var(--e4)' }}>
            <button type="button" className="btn btn--primario" onClick={salvar} disabled={salvando}>
              {salvando ? (
                <>
                  <Icone nome="spinner" tamanho={15} className="girando" />
                  Salvando…
                </>
              ) : (
                <>
                  <Icone nome="check" tamanho={15} />
                  {editandoId !== null ? 'Salvar alterações' : 'Adicionar fluxo'}
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn--fantasma"
              onClick={() => {
                setForm(null)
                setEditandoId(null)
              }}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

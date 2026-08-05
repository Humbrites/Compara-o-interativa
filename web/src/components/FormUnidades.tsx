import { useState } from 'react'
import type { Unidade, UnidadeInput } from '../types'
import { api } from '../lib/api'
import { FACES, POSICOES_SOLARES, STATUS_UNIDADE } from '../lib/opcoes'
import { rotuloUnidade } from '../lib/unidades'
import { Campo, Estado } from './ui'
import { Icone } from './Icones'
import { CartaoUnidade } from './CartaoUnidade'
import { FluxosDoEmpreendimento } from './FormFluxos'
import { CalculadoraCub } from './CalculadoraCub'

type Formulario = Record<string, string>

const CAMPOS = [
  'identificacao', 'torre', 'andar', 'numero',
  'metragem', 'metragem_total',
  'dormitorios', 'suites', 'banheiros', 'vagas',
  'posicao_solar', 'face', 'valor', 'valor_m2', 'status', 'observacoes',
]

const VAZIO: Formulario = Object.fromEntries(CAMPOS.map((campo) => [campo, '']))

function paraFormulario(unidade: Unidade): Formulario {
  const form: Formulario = { ...VAZIO }
  for (const campo of CAMPOS) {
    const valor = (unidade as unknown as Record<string, unknown>)[campo]
    form[campo] = valor === null || valor === undefined ? '' : String(valor)
  }
  return form
}

interface Props {
  empreendimentoId: number
  unidades: Unidade[]
  onMudou: (unidades: Unidade[]) => void
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
}

export function UnidadesDoEmpreendimento({ empreendimentoId, unidades, onMudou, avisar }: Props) {
  const [form, setForm] = useState<Formulario | null>(null)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Qual unidade esta com o bloco de fluxos aberto.
  const [fluxosAbertos, setFluxosAbertos] = useState<number | null>(null)
  // Qual unidade esta com a calculadora do CUB aberta.
  const [cubAberto, setCubAberto] = useState<Unidade | null>(null)

  function abrirNova() {
    setEditandoId(null)
    setForm({ ...VAZIO, status: 'Disponível' })
  }

  function abrirEdicao(unidade: Unidade) {
    setEditandoId(unidade.id)
    setForm(paraFormulario(unidade))
  }

  function fechar() {
    setForm(null)
    setEditandoId(null)
  }

  function mudar(campo: string, valor: string) {
    setForm((atual) => (atual ? { ...atual, [campo]: valor } : atual))
  }

  function entrada(campo: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
      <input
        className="entrada"
        value={form?.[campo] ?? ''}
        onChange={(e) => mudar(campo, e.target.value)}
        {...extra}
      />
    )
  }

  function selecao(campo: string, opcoes: readonly string[]) {
    return (
      <select className="entrada" value={form?.[campo] ?? ''} onChange={(e) => mudar(campo, e.target.value)}>
        <option value="">Selecione…</option>
        {opcoes.map((opcao) => (
          <option key={opcao} value={opcao}>
            {opcao}
          </option>
        ))}
      </select>
    )
  }

  async function salvar() {
    if (!form) return
    setSalvando(true)
    try {
      // Campo em branco vai como null: o comparativo precisa distinguir
      // "nao informado" de zero.
      const dados: UnidadeInput = { empreendimento_id: empreendimentoId }
      for (const campo of CAMPOS) {
        dados[campo as keyof UnidadeInput] = form[campo].trim() || null
      }

      if (editandoId !== null) {
        const atualizada = await api.editarUnidade(editandoId, dados)
        onMudou(unidades.map((u) => (u.id === editandoId ? atualizada : u)))
        avisar('Unidade atualizada')
      } else {
        const criada = await api.criarUnidade(dados)
        onMudou([...unidades, criada])
        avisar('Unidade adicionada')
      }
      fechar()
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao salvar a unidade', 'erro')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(unidade: Unidade) {
    const nome = rotuloUnidade(unidade)
    if (!window.confirm(`Excluir ${nome}? Os fluxos de pagamento dela também serão removidos.`)) return

    try {
      await api.excluirUnidade(unidade.id)
      onMudou(unidades.filter((u) => u.id !== unidade.id))
      avisar('Unidade excluída')
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao excluir', 'erro')
    }
  }

  /** Guarda os fluxos de uma unidade sem recarregar a lista inteira. */
  function trocarFluxos(unidadeId: number, fluxos: Unidade['fluxos']) {
    onMudou(unidades.map((u) => (u.id === unidadeId ? { ...u, fluxos } : u)))
  }

  /** A simulacao do CUB vira um fluxo daquela unidade. */
  async function gerarFluxoDoCub(unidade: Unidade, dados: Parameters<typeof api.criarFluxo>[0]) {
    const criado = await api.criarFluxo({
      ...dados,
      empreendimento_id: empreendimentoId,
      unidade_id: unidade.id,
    })
    trocarFluxos(unidade.id, [...unidade.fluxos, criado])
    setFluxosAbertos(unidade.id)
    avisar('Fluxo gerado pela calculadora do CUB')
  }

  return (
    <div>
      {unidades.length === 0 && !form && (
        <Estado
          icone="predio"
          titulo="Nenhuma unidade cadastrada"
          texto="Cadastre as unidades que o corretor vende — cada uma com a própria metragem, dormitórios, vagas, posição e tabela de pagamento. Elas podem ser comparadas uma a uma."
          acao={
            <button type="button" className="btn btn--primario" onClick={abrirNova}>
              <Icone nome="mais" tamanho={15} />
              Adicionar unidade
            </button>
          }
        />
      )}

      {unidades.length > 0 && (
        <div style={{ marginBottom: form ? 'var(--e5)' : 0 }}>
          {unidades.map((unidade, indice) => (
            <CartaoUnidade
              key={unidade.id}
              unidade={unidade}
              indice={indice}
              onEditar={() => abrirEdicao(unidade)}
              onExcluir={() => void excluir(unidade)}
              rodape={
                <>
                  <div className="unidade__botoes">
                    <button
                      type="button"
                      className="btn btn--fantasma btn--pequeno"
                      onClick={() => setFluxosAbertos((atual) => (atual === unidade.id ? null : unidade.id))}
                    >
                      <Icone nome={fluxosAbertos === unidade.id ? 'seta_cima' : 'seta_baixo'} tamanho={13} />
                      {unidade.fluxos.length === 0
                        ? 'Fluxos de pagamento'
                        : `Fluxos de pagamento (${unidade.fluxos.length})`}
                    </button>

                    <button type="button" className="btn btn--secundario btn--pequeno" onClick={() => setCubAberto(unidade)}>
                      <Icone nome="grafico" tamanho={13} />
                      Calcular com CUB
                    </button>
                  </div>

                  {fluxosAbertos === unidade.id && (
                    <div className="unidade__fluxos">
                      <FluxosDoEmpreendimento
                        empreendimentoId={empreendimentoId}
                        unidadeId={unidade.id}
                        titulo={rotuloUnidade(unidade, indice)}
                        valorSugerido={unidade.valor}
                        fluxos={unidade.fluxos}
                        onMudou={(fluxos) => trocarFluxos(unidade.id, fluxos)}
                        avisar={avisar}
                      />
                    </div>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}

      {cubAberto && (
        <CalculadoraCub
          titulo={rotuloUnidade(cubAberto)}
          valorSugerido={cubAberto.valor}
          onFechar={() => setCubAberto(null)}
          onGerarFluxo={(dados) => gerarFluxoDoCub(cubAberto, dados)}
          avisar={avisar}
        />
      )}

      {!form && unidades.length > 0 && (
        <button type="button" className="btn btn--secundario btn--bloco" onClick={abrirNova}>
          <Icone nome="mais" tamanho={15} />
          Adicionar outra unidade
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
            <Icone nome="predio" tamanho={13} />
            {editandoId !== null ? 'Editar unidade' : 'Nova unidade'}
          </h3>

          <div className="grade">
            <Campo rotulo="Identificação" className="col-span-2" dica="como o corretor chama">
              {entrada('identificacao', { placeholder: 'Ex.: Tipo A, Cobertura, Apto 1204', autoFocus: true })}
            </Campo>
            <Campo rotulo="Status">{selecao('status', STATUS_UNIDADE)}</Campo>

            <Campo rotulo="Torre / bloco">{entrada('torre', { placeholder: 'Ex.: Torre 1' })}</Campo>
            <Campo rotulo="Andar">{entrada('andar', { placeholder: '12', inputMode: 'numeric' })}</Campo>
            <Campo rotulo="Número">{entrada('numero', { placeholder: '1204' })}</Campo>

            <Campo rotulo="Posição solar" dica="para onde é voltada">
              {selecao('posicao_solar', POSICOES_SOLARES)}
            </Campo>
            <Campo rotulo="Face" dica="em relação à rua">
              {selecao('face', FACES)}
            </Campo>
          </div>

          <div className="grade" style={{ marginTop: 'var(--e4)' }}>
            <Campo rotulo="Metragem privativa" dica="m²">
              {entrada('metragem', { placeholder: '78', inputMode: 'decimal' })}
            </Campo>
            <Campo rotulo="Metragem total" dica="m²">
              {entrada('metragem_total', { placeholder: '96', inputMode: 'decimal' })}
            </Campo>
            <Campo rotulo="Dormitórios">{entrada('dormitorios', { placeholder: '3', inputMode: 'numeric' })}</Campo>
            <Campo rotulo="Suítes">{entrada('suites', { placeholder: '1', inputMode: 'numeric' })}</Campo>
            <Campo rotulo="Banheiros">{entrada('banheiros', { placeholder: '2', inputMode: 'numeric' })}</Campo>
            <Campo rotulo="Vagas">{entrada('vagas', { placeholder: '2', inputMode: 'numeric' })}</Campo>

            <Campo rotulo="Valor da unidade" dica="R$">
              {entrada('valor', { placeholder: '842000', inputMode: 'decimal' })}
            </Campo>
            <Campo rotulo="Valor do m²" dica="em branco = calculado">
              {entrada('valor_m2', { placeholder: '10800', inputMode: 'decimal' })}
            </Campo>

            <Campo rotulo="Observações" className="col-inteira">
              <textarea
                className="entrada"
                value={form.observacoes}
                onChange={(e) => mudar('observacoes', e.target.value)}
                placeholder="Diferenciais da unidade: vista, varanda gourmet, depósito, andar alto…"
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
                  {editandoId !== null ? 'Salvar alterações' : 'Adicionar unidade'}
                </>
              )}
            </button>
            <button type="button" className="btn btn--fantasma" onClick={fechar}>
              Cancelar
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import type { FluxoInput, FluxoPagamento } from '../types'
import { api } from '../lib/api'
import { lerNumero } from '../lib/cub'
import { totalizarFluxo, type NumerosDoFluxo } from '../lib/fluxos'
import { fmtMoeda } from '../lib/format'
import { usePodeEditar } from '../lib/permissao'
import { Campo, Estado } from './ui'
import { Icone } from './Icones'
import { CartaoFluxo } from './CartaoFluxo'
import { CalculadoraCub } from './CalculadoraCub'

export type FormularioFluxo = Record<string, string>

/**
 * `cub_valor_imovel` e o VALOR TOTAL DO IMOVEL daquela tabela. O nome vem da
 * calculadora do CUB, que foi quem passou a gravar a coluna primeiro, mas o
 * campo e da tabela de venda: e dele que sai o preco da unidade
 * (`precoDaUnidade`) e o valor do m².
 */
export const CAMPOS_FLUXO = [
  'nome', 'cub_valor_imovel', 'entrada_pct', 'entrada_valor', 'entrada_parcelas',
  'parcelas', 'parcela_valor',
  'reforcos_qtd', 'reforco_valor', 'chaves_pct', 'financiamento_pct', 'financiamento_valor',
  'pos_parcelas', 'pos_parcela_valor', 'pos_reforcos_qtd', 'pos_reforco_valor',
  'descricao', 'observacoes',
]

export const FLUXO_VAZIO: FormularioFluxo = Object.fromEntries(CAMPOS_FLUXO.map((c) => [c, '']))

/** O formulario so mexe com texto; a conversao para numero fica na API. */
export function fluxoParaFormulario(fluxo: FluxoPagamento): FormularioFluxo {
  const form: FormularioFluxo = { ...FLUXO_VAZIO }
  for (const campo of CAMPOS_FLUXO) {
    const valor = (fluxo as unknown as Record<string, unknown>)[campo]
    form[campo] = valor === null || valor === undefined ? '' : String(valor)
  }
  // Tabela gravada antes do saldo automatico abre com ele ja calculado, para
  // o campo nao aparecer vazio. O que ja tem saldo gravado fica como esta:
  // o da calculadora do CUB sai de parcelas corrigidas mes a mes, mais fiel
  // que a conta simples daqui — e qualquer tecla na tabela refaz os dois.
  const temSaldo = form.financiamento_pct.trim() !== '' || form.financiamento_valor.trim() !== ''
  return temSaldo ? form : recalcularFinanciamento(form)
}

/** Verdadeiro quando ha algo digitado — evita gravar um fluxo em branco. */
export function fluxoPreenchido(form: FormularioFluxo): boolean {
  return CAMPOS_FLUXO.some((campo) => (form[campo] || '').trim() !== '')
}

/** So os numeros do fluxo; nome sozinho nao descreve tabela de venda nenhuma. */
export function fluxoTemNumeros(form: FormularioFluxo): boolean {
  return CAMPOS_FLUXO.filter((c) => c !== 'nome').some((campo) => (form[campo] || '').trim() !== '')
}

/** Numero de verdade digitado no campo: "," ou "R$" sozinhos nao contam. */
function numeroDoCampo(texto: string | undefined): number | null {
  return texto && /\d/.test(texto) ? lerNumero(texto) : null
}

/** O numero calculado de volta para o campo, em pt-BR e sem zeros sobrando. */
function paraCampo(valor: number, casas: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: casas })
}

/** Os numeros do formulario, prontos para a conta de `totalizarFluxo`. */
export function numerosDoFormulario(form: FormularioFluxo): NumerosDoFluxo {
  return {
    base: numeroDoCampo(form.cub_valor_imovel),
    entradaValor: numeroDoCampo(form.entrada_valor),
    entradaPct: numeroDoCampo(form.entrada_pct),
    parcelas: numeroDoCampo(form.parcelas),
    parcelaValor: numeroDoCampo(form.parcela_valor),
    reforcosQtd: numeroDoCampo(form.reforcos_qtd),
    reforcoValor: numeroDoCampo(form.reforco_valor),
    chavesPct: numeroDoCampo(form.chaves_pct),
    posParcelas: numeroDoCampo(form.pos_parcelas),
    posParcelaValor: numeroDoCampo(form.pos_parcela_valor),
    posReforcosQtd: numeroDoCampo(form.pos_reforcos_qtd),
    posReforcoValor: numeroDoCampo(form.pos_reforco_valor),
  }
}

/**
 * Entrada em R$ e entrada em % sao o MESMO numero dito de dois jeitos: digitar
 * um lado preenche o outro na hora, sempre sobre o valor total do imovel.
 */
function espelharEntrada(form: FormularioFluxo, campo: string, valor: string): FormularioFluxo {
  const proximo = { ...form }
  const base = numeroDoCampo(proximo.cub_valor_imovel)

  if (campo === 'entrada_valor' || campo === 'entrada_pct') {
    const espelho = campo === 'entrada_valor' ? 'entrada_pct' : 'entrada_valor'
    // Apagar um lado apaga o outro: sobrando sozinho, o espelho ressuscitaria
    // o campo limpo na proxima tecla do valor do imovel.
    if (valor.trim() === '') {
      proximo[espelho] = ''
      return proximo
    }
    const digitado = numeroDoCampo(valor)
    if (digitado === null || base === null || base <= 0) return proximo
    proximo[espelho] =
      campo === 'entrada_valor' ? paraCampo((digitado / base) * 100, 4) : paraCampo((base * digitado) / 100, 2)
    return proximo
  }

  // Mudou o valor do imovel: a % manda, porque ela e a condicao comercial
  // ("20% de entrada") e o R$ e consequencia dela.
  if (base === null || base <= 0) return proximo
  const pct = numeroDoCampo(proximo.entrada_pct)
  if (pct !== null) {
    proximo.entrada_valor = paraCampo((base * pct) / 100, 2)
    return proximo
  }
  const entrada = numeroDoCampo(proximo.entrada_valor)
  if (entrada !== null) proximo.entrada_pct = paraCampo((entrada / base) * 100, 4)
  return proximo
}

/**
 * O financiamento e o RESTO: o que sobra do valor do imovel depois da entrada,
 * das parcelas, dos reforcos e das chaves. Ninguem digita esses dois campos —
 * eles se refazem a cada tecla em qualquer parte da tabela.
 *
 * Sem valor total do imovel nao ha resto que se calcule (uma tabela geral do
 * empreendimento pode ser so "20% de entrada, 80% financiado"): ali os campos
 * continuam sendo de quem cadastra.
 */
function recalcularFinanciamento(form: FormularioFluxo): FormularioFluxo {
  const { saldo, saldoPct } = totalizarFluxo(numerosDoFormulario(form))
  if (saldo === null || saldoPct === null) return form

  // Tabela que ja passou do valor do imovel zera o saldo: financiamento
  // negativo nao existe, e o quanto passou vira aviso na tela.
  return {
    ...form,
    financiamento_valor: paraCampo(Math.max(0, saldo), 2),
    financiamento_pct: paraCampo(Math.max(0, saldoPct), 4),
  }
}

/** Campos que entram na conta do saldo — mexer neles refaz o financiamento. */
const CAMPOS_DA_CONTA = new Set([
  'cub_valor_imovel', 'entrada_pct', 'entrada_valor',
  'parcelas', 'parcela_valor', 'reforcos_qtd', 'reforco_valor', 'chaves_pct',
  // O que a construtora parcela DEPOIS das chaves tambem sai do valor do
  // imovel: sem entrar aqui, o saldo do banco viria inflado.
  'pos_parcelas', 'pos_parcela_valor', 'pos_reforcos_qtd', 'pos_reforco_valor',
])

/**
 * Uma tecla no formulario do fluxo: alem de guardar o que foi digitado, refaz
 * o que aquele campo implica — o espelho da entrada e o saldo a financiar.
 * Ninguem deveria abrir a calculadora do celular para cadastrar uma tabela.
 */
export function mudarCampoFluxo(form: FormularioFluxo, campo: string, valor: string): FormularioFluxo {
  let proximo = { ...form, [campo]: valor }
  if (CAMPOS_DA_CONTA.has(campo)) {
    proximo = espelharEntrada(proximo, campo, valor)
    proximo = recalcularFinanciamento(proximo)
  }
  return proximo
}

/** Monta o corpo do POST/PUT a partir do formulario. */
export function fluxoParaEnvio(
  form: FormularioFluxo,
  empreendimentoId: number,
  unidadeId: number | null,
): FluxoInput {
  const dados: FluxoInput = { empreendimento_id: empreendimentoId }
  if (unidadeId !== null) dados.unidade_id = unidadeId
  for (const campo of CAMPOS_FLUXO) {
    dados[campo as keyof FluxoInput] = (form[campo] || '').trim() || null
  }
  return dados
}

interface CamposProps {
  form: FormularioFluxo
  mudar: (campo: string, valor: string) => void
  /** Fluxo de unidade ganha exemplo de proposta no nome; o geral, de tabela. */
  daUnidade?: boolean
  autoFocus?: boolean
}

/**
 * A grade de campos do fluxo. Vive fora do <FluxosDoEmpreendimento> porque o
 * cadastro de unidade monta o primeiro fluxo dentro do proprio formulario.
 */
export function CamposFluxo({ form, mudar, daUnidade = false, autoFocus = false }: CamposProps) {
  // Com valor total do imovel o financiamento vira conta, nao campo: e o que
  // sobra depois de entrada, parcelas, reforcos e chaves.
  const { saldo } = totalizarFluxo(numerosDoFormulario(form))
  const calculado = saldo !== null
  const estouro = saldo !== null && saldo < -0.005 ? -saldo : null

  return (
    <div className="grade">
      <Campo rotulo="Nome do fluxo" className="col-inteira" dica={daUnidade ? 'ajuda a achar depois' : 'como a construtora chama a tabela'}>
        <input
          className="entrada"
          value={form.nome}
          onChange={(e) => mudar('nome', e.target.value)}
          placeholder={
            daUnidade
              ? 'Ex.: Tabela padrão, Proposta Ana e Bruno, À vista'
              : 'Ex.: Tabela padrão, Plano obra, À vista'
          }
          autoFocus={autoFocus}
        />
      </Campo>

      {/* Primeiro campo numerico de proposito: e o valor total do imovel que
          define o preco da unidade e o valor do m², e os dois se atualizam
          enquanto se digita aqui. */}
      <Campo
        rotulo="Valor total do imóvel"
        className="col-inteira"
        dica={daUnidade ? 'R$ — usado no valor do m² da unidade' : 'R$'}
      >
        <input
          className="entrada"
          value={form.cub_valor_imovel}
          onChange={(e) => mudar('cub_valor_imovel', e.target.value)}
          placeholder="800.000,00"
          inputMode="decimal"
        />
      </Campo>

      {/* Os dois lados da mesma entrada: digitar um preenche o outro pelo
          valor total do imovel, que fica logo acima. */}
      <Campo rotulo="Entrada" dica="% do valor total">
        <input
          className="entrada"
          value={form.entrada_pct}
          onChange={(e) => mudar('entrada_pct', e.target.value)}
          placeholder="20"
          inputMode="decimal"
        />
      </Campo>
      <Campo rotulo="Entrada" dica="R$ — um lado preenche o outro">
        <input
          className="entrada"
          value={form.entrada_valor}
          onChange={(e) => mudar('entrada_valor', e.target.value)}
          placeholder="60000"
          inputMode="decimal"
        />
      </Campo>
      {/* A entrada parcelada e a primeira pergunta de quem compra ("quanto
          entro hoje?") e era o que mais faltava nas tabelas do cliente. */}
      <Campo rotulo="Entrada em quantas vezes" className="col-inteira" dica="1 = à vista">
        <input
          className="entrada"
          value={form.entrada_parcelas}
          onChange={(e) => mudar('entrada_parcelas', e.target.value)}
          placeholder="4"
          inputMode="numeric"
        />
      </Campo>

      <Campo rotulo="Parcelamento" dica="nº de parcelas durante a obra">
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
      {/* O saldo do banco: o que sobra depois de tudo que o cliente paga
          direto. Com valor total do imovel os dois campos viram resultado —
          so leitura, refeitos a cada tecla na tabela. */}
      <Campo rotulo="Financiamento" dica={calculado ? '% — o que sobra' : '%'}>
        <input
          className={`entrada${calculado ? ' entrada--calculada' : ''}`}
          value={form.financiamento_pct}
          onChange={(e) => mudar('financiamento_pct', e.target.value)}
          placeholder="80"
          inputMode="decimal"
          readOnly={calculado}
          tabIndex={calculado ? -1 : undefined}
          title={calculado ? 'Calculado: o que falta para fechar o valor do imóvel' : undefined}
        />
      </Campo>
      <Campo
        rotulo="Saldo a financiar"
        dica={calculado ? 'R$ — calculado' : 'R$'}
        erro={
          estouro !== null
            ? `As partes cadastradas já passam ${fmtMoeda(estouro, true)} do valor do imóvel`
            : undefined
        }
      >
        <input
          className={`entrada${calculado ? ' entrada--calculada' : ''}`}
          value={form.financiamento_valor}
          onChange={(e) => mudar('financiamento_valor', e.target.value)}
          placeholder="640.000,00"
          inputMode="decimal"
          readOnly={calculado}
          tabIndex={calculado ? -1 : undefined}
          title={calculado ? 'Valor total − entrada − parcelas − reforços − chaves − pós-chaves' : undefined}
        />
      </Campo>

      {/* Pós-chaves: o financiamento DIRETO com a construtora. Entra na
          composição do preço, mas NUNCA no desembolso até a entrega — é o que
          separa "quanto custa para chegar nas chaves" de "quanto custa o
          apartamento". */}
      <p className="campo__dica col-inteira" style={{ marginTop: 'var(--e2)' }}>
        <Icone nome="chave" tamanho={12} />
        Pós-chaves — o que a construtora parcela DEPOIS da entrega
      </p>
      <Campo rotulo="Mensais pós-chaves" dica="quantidade">
        <input
          className="entrada"
          value={form.pos_parcelas}
          onChange={(e) => mudar('pos_parcelas', e.target.value)}
          placeholder="24"
          inputMode="numeric"
        />
      </Campo>
      <Campo rotulo="Valor da mensal pós-chaves" dica="R$">
        <input
          className="entrada"
          value={form.pos_parcela_valor}
          onChange={(e) => mudar('pos_parcela_valor', e.target.value)}
          placeholder="2000"
          inputMode="decimal"
        />
      </Campo>
      <Campo rotulo="Semestrais pós-chaves" dica="quantidade">
        <input
          className="entrada"
          value={form.pos_reforcos_qtd}
          onChange={(e) => mudar('pos_reforcos_qtd', e.target.value)}
          placeholder="4"
          inputMode="numeric"
        />
      </Campo>
      <Campo rotulo="Valor do semestral pós-chaves" dica="R$">
        <input
          className="entrada"
          value={form.pos_reforco_valor}
          onChange={(e) => mudar('pos_reforco_valor', e.target.value)}
          placeholder="15000"
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
  )
}

interface Props {
  empreendimentoId: number
  /** Preenchido = o fluxo pertence a essa unidade, nao ao empreendimento. */
  unidadeId?: number | null
  /** Nome que a calculadora do CUB mostra e usa nos arquivos exportados. */
  titulo?: string
  /** Valor que pre-preenche o "valor do imovel" na calculadora. */
  valorSugerido?: number | null
  fluxos: FluxoPagamento[]
  onMudou: (fluxos: FluxoPagamento[]) => void
  /**
   * O valor total do imovel enquanto ele esta sendo DIGITADO (antes de salvar
   * o fluxo). E o que deixa o valor do m² da unidade acompanhar a tecla, sem
   * esperar um botao. Texto vazio = nada digitado aqui.
   */
  onValorImovel?: (texto: string) => void
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
}

export function FluxosDoEmpreendimento({
  empreendimentoId,
  unidadeId = null,
  titulo = 'Empreendimento',
  valorSugerido = null,
  fluxos,
  onMudou,
  onValorImovel,
  avisar,
}: Props) {
  // Só leitura: as tabelas continuam abrindo (é o que se apresenta ao
  // cliente), mas nada que grave aparece — nem a calculadora, que gera fluxo.
  const podeEditar = usePodeEditar()
  const daUnidade = unidadeId !== null
  const [form, setForm] = useState<FormularioFluxo | null>(null)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [calculando, setCalculando] = useState(false)

  // Formulario fechado nao tem valor digitado: quem ouve volta para o fluxo salvo.
  const valorDigitado = form?.cub_valor_imovel ?? ''
  useEffect(() => {
    onValorImovel?.(valorDigitado)
  }, [valorDigitado, onValorImovel])

  /** A calculadora do CUB devolve um fluxo pronto — so falta gravar. */
  async function gerarPelaCalculadora(dados: FluxoInput) {
    const criado = await api.criarFluxo({
      ...dados,
      empreendimento_id: empreendimentoId,
      ...(daUnidade ? { unidade_id: unidadeId } : {}),
    })
    onMudou([...fluxos, criado])
    avisar('Fluxo gerado pela calculadora do CUB')
  }

  const botaoCub = (
    <button type="button" className="btn btn--secundario btn--bloco" onClick={() => setCalculando(true)}>
      <Icone nome="grafico" tamanho={15} />
      Calcular valor com CUB
    </button>
  )

  function abrirNovo() {
    setEditandoId(null)
    setForm({ ...FLUXO_VAZIO, nome: `Fluxo ${fluxos.length + 1}` })
  }

  function abrirEdicao(fluxo: FluxoPagamento) {
    setEditandoId(fluxo.id)
    setForm(fluxoParaFormulario(fluxo))
  }

  function mudar(campo: string, valor: string) {
    setForm((atual) => (atual ? mudarCampoFluxo(atual, campo, valor) : atual))
  }

  async function salvar() {
    if (!form) return
    setSalvando(true)
    try {
      const dados = fluxoParaEnvio(form, empreendimentoId, daUnidade ? unidadeId : null)

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
            !podeEditar
              ? 'Esta unidade ainda não tem tabela de venda cadastrada.'
              : daUnidade
                ? 'Cadastre a tabela de venda desta unidade: entrada, parcelamento, reforços, chaves e financiamento. Ela entra no comparativo quando a unidade for escolhida.'
                : 'Cadastre a tabela de venda: entrada, parcelamento, reforços, chaves e financiamento. Um empreendimento pode ter vários fluxos.'
          }
          acao={
            podeEditar ? (
              <div className="acoes-fluxo">
                <button type="button" className="btn btn--primario" onClick={abrirNovo}>
                  <Icone nome="mais" tamanho={15} />
                  Adicionar fluxo
                </button>
                <button type="button" className="btn btn--secundario" onClick={() => setCalculando(true)}>
                  <Icone nome="grafico" tamanho={15} />
                  Calcular valor com CUB
                </button>
              </div>
            ) : undefined
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
              valorDaUnidade={valorSugerido}
              titulo={titulo}
              onEditar={podeEditar ? () => abrirEdicao(fluxo) : undefined}
              onExcluir={podeEditar ? () => excluir(fluxo) : undefined}
            />
          ))}
        </div>
      )}

      {/* Com a lista vazia os dois caminhos ja aparecem dentro do <Estado>. */}
      {podeEditar && !form && fluxos.length > 0 && (
        <div className="acoes-fluxo">
          <button type="button" className="btn btn--secundario btn--bloco" onClick={abrirNovo}>
            <Icone nome="mais" tamanho={15} />
            Adicionar outro fluxo
          </button>
          {botaoCub}
        </div>
      )}

      {calculando && (
        <CalculadoraCub
          titulo={titulo}
          valorSugerido={valorSugerido}
          onFechar={() => setCalculando(false)}
          onGerarFluxo={gerarPelaCalculadora}
          avisar={avisar}
        />
      )}

      {form && (
        <section className="form-secao form-secao--aninhada">
          <h3 className="form-secao__titulo">
            <Icone nome="cartao" tamanho={13} />
            {editandoId !== null ? 'Editar fluxo' : 'Novo fluxo de pagamento'}
          </h3>

          <CamposFluxo form={form} mudar={mudar} daUnidade={daUnidade} autoFocus />

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

import { Fragment, useMemo, useState } from 'react'
import type { Empreendimento, EmpreendimentoInput, ImagemEmpreendimento, Unidade } from '../types'
import { STATUS_OBRA, TIPOS } from '../lib/opcoes'
import { api } from '../lib/api'
import { fmtArea, fmtMoeda, TRACO } from '../lib/format'
import { resumoUnidades, ROTULO_BASE_M2, valorM2MedioDe } from '../lib/unidades'
import { useBaseM2 } from '../lib/baseM2'
import { Campo, Modal } from './ui'
import { Icone, type NomeIcone } from './Icones'
import { UnidadesDoEmpreendimento } from './FormUnidades'
import { GaleriaUpload } from './GaleriaUpload'
import { SeletorDeLocal } from './SeletorDeLocal'
import { CalculadoraCub } from './CalculadoraCub'

/** O formulario trabalha com texto puro; a conversao acontece no envio. */
type Formulario = Record<string, string>

const CAMPOS: string[] = [
  'nome', 'construtora', 'cidade', 'bairro', 'endereco',
  'latitude', 'longitude', 'valor_m2', 'metragem_min', 'metragem_max',
  'dormitorios', 'suites', 'banheiros', 'vagas', 'torres',
  'status_obra', 'entrega', 'tipo', 'imagem_url', 'observacoes',
]

/**
 * Numeros do produto. Sao gerais do empreendimento, mas descrevem a mesma
 * coisa que cada unidade detalha — por isso moram na etapa das unidades, e
 * nao junto da identificacao.
 */
const CAMPOS_PRODUTO = [
  'valor_m2', 'metragem_min', 'metragem_max',
  'dormitorios', 'suites', 'banheiros', 'vagas',
]

function paraFormulario(e: Empreendimento | null): Formulario {
  const inicial: Formulario = {}
  for (const campo of CAMPOS) {
    const valor = e ? (e as unknown as Record<string, unknown>)[campo] : null
    inicial[campo] = valor === null || valor === undefined ? '' : String(valor)
  }
  return inicial
}

/** Erros da etapa 1: identificacao e localizacao. */
function validarDados(form: Formulario): Record<string, string> {
  const erros: Record<string, string> = {}

  if (!form.nome.trim()) erros.nome = 'Informe o nome do empreendimento'

  const lat = Number(form.latitude.replace(',', '.'))
  if (form.latitude.trim() && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
    erros.latitude = 'Latitude deve ficar entre -90 e 90'
  }

  const lng = Number(form.longitude.replace(',', '.'))
  if (form.longitude.trim() && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
    erros.longitude = 'Longitude deve ficar entre -180 e 180'
  }

  return erros
}

/** Erros do bloco de produto, que agora vive na etapa das unidades. */
function validarProduto(form: Formulario): Record<string, string> {
  const erros: Record<string, string> = {}

  const min = Number(form.metragem_min.replace(',', '.'))
  const max = Number(form.metragem_max.replace(',', '.'))
  if (form.metragem_min.trim() && form.metragem_max.trim() && Number.isFinite(min) && Number.isFinite(max) && min > max) {
    erros.metragem_max = 'A metragem máxima não pode ser menor que a mínima'
  }

  return erros
}

/**
 * Os números do empreendimento, lidos das unidades cadastradas.
 *
 * A mesma conta do servidor (que grava as colunas usadas pelos filtros e pelo
 * comparativo), refeita aqui só para exibir — a tela precisa reagir à unidade
 * que acabou de ser criada, antes de qualquer recarga.
 */
function ResumoDasUnidades({ unidades }: { unidades: Unidade[] }) {
  const base = useBaseM2()
  const resumo = useMemo(() => resumoUnidades(unidades, base), [unidades, base])
  const m2 = useMemo(() => valorM2MedioDe(unidades, base), [unidades, base])

  if (unidades.length === 0) {
    return (
      <p className="campo__dica linha-calculo">
        <Icone nome="info" tamanho={12} /> Estes números saem das unidades: assim que a primeira for cadastrada
        abaixo, a faixa de preço, as metragens e o valor do m² aparecem aqui — e se refazem a cada unidade
        adicionada, editada ou removida.
      </p>
    )
  }

  const faixa = (min: number | null, max: number | null, formatar: (v: number) => string) => {
    if (min === null) return TRACO
    return max !== null && max !== min ? `${formatar(min)} — ${formatar(max)}` : formatar(min)
  }

  return (
    <>
      <div className="indicadores-produto">
        <Indicador
          icone="dinheiro"
          rotulo="Valor das unidades"
          valor={faixa(resumo.valor.min, resumo.valor.max, (v) => fmtMoeda(v))}
          dica={resumo.valor.min === null ? 'nenhuma unidade com preço' : 'da menor à maior'}
        />
        <Indicador
          icone="regua"
          rotulo="Metragem"
          valor={faixa(resumo.metragem.min, resumo.metragem.max, (v) => fmtArea(v))}
          dica="privativa"
        />
        <Indicador
          icone="grafico"
          rotulo="Valor médio do m²"
          valor={m2 === null ? TRACO : fmtMoeda(m2)}
          dica={`soma dos preços ÷ soma das áreas (${ROTULO_BASE_M2[base]})`}
        />
        <Indicador
          icone="predio"
          rotulo="Unidades"
          valor={String(resumo.total)}
          dica={`${resumo.disponiveis} disponível(is)`}
        />
      </div>

      <p className="campo__dica linha-calculo">
        <Icone nome="info" tamanho={12} /> Calculado a partir das {resumo.total} unidade(s) abaixo — é isto que
        alimenta os filtros do dashboard e o comparativo. Dormitórios, suítes e vagas também: cada unidade tem os
        seus, e o empreendimento mostra o que ele oferece.
      </p>
    </>
  )
}

function Indicador({
  icone,
  rotulo,
  valor,
  dica,
}: {
  icone: NomeIcone
  rotulo: string
  valor: string
  dica: string
}) {
  return (
    <div className="indicador-produto">
      <span className="indicador-produto__rotulo">
        <Icone nome={icone} tamanho={12} />
        {rotulo}
      </span>
      <span className="indicador-produto__valor">{valor}</span>
      <span className="indicador-produto__dica">{dica}</span>
    </div>
  )
}

interface Props {
  /** null = cadastro novo. */
  empreendimento: Empreendimento | null
  /** Abre direto na etapa das unidades (botao "adicionar unidade" do painel). */
  iniciarEmUnidades?: boolean
  onFechar: () => void
  onSalvar: (dados: EmpreendimentoInput) => Promise<Empreendimento>
  onMudouImagens: (id: number, imagens: ImagemEmpreendimento[]) => void
  onMudouUnidades: (id: number, unidades: Unidade[]) => void
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
}

export function FormEmpreendimento({
  empreendimento,
  iniciarEmUnidades,
  onFechar,
  onSalvar,
  onMudouImagens,
  onMudouUnidades,
  avisar,
}: Props) {
  const [form, setForm] = useState<Formulario>(() => paraFormulario(empreendimento))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [passo, setPasso] = useState<1 | 2>(() => (empreendimento && iniciarEmUnidades ? 2 : 1))
  const [salvando, setSalvando] = useState(false)
  const [salvandoProduto, setSalvandoProduto] = useState(false)
  // Depois de salvar a etapa 1 passamos a trabalhar sobre o registro criado.
  const [salvo, setSalvo] = useState<Empreendimento | null>(empreendimento)
  // Fotos escolhidas antes de o cadastro existir — sobem logo apos o salvar.
  const [pendentes, setPendentes] = useState<File[]>([])
  // O campo de link so aparece a pedido, ou quando ja veio preenchido.
  const [verLink, setVerLink] = useState(() => Boolean(empreendimento?.imagem_url))
  const [calculadoraAberta, setCalculadoraAberta] = useState(false)

  // Aqui a calculadora so simula: fluxo de pagamento e sempre de uma unidade,
  // entao quem grava e o CUB de dentro dela.
  const calculadora = calculadoraAberta && (
    <CalculadoraCub
      titulo={salvo?.nome || form.nome.trim() || 'Empreendimento'}
      onFechar={() => setCalculadoraAberta(false)}
      avisar={avisar}
    />
  )

  /** Guarda a galeria no estado local e avisa a tela de fora. */
  function aplicarImagens(id: number, imagens: ImagemEmpreendimento[]) {
    setSalvo((atual) => (atual ? { ...atual, imagens } : atual))
    onMudouImagens(id, imagens)
  }

  /** Mesma ideia para as unidades. */
  function aplicarUnidades(id: number, unidades: Unidade[]) {
    setSalvo((atual) => (atual ? { ...atual, unidades } : atual))
    onMudouUnidades(id, unidades)
  }

  const editando = empreendimento !== null

  // O bloco de produto e editado na etapa 2, depois de o registro existir:
  // so gravamos o que o usuario mexeu de verdade.
  const produtoAlterado =
    salvo !== null &&
    (() => {
      const gravado = paraFormulario(salvo)
      return CAMPOS_PRODUTO.some((campo) => form[campo].trim() !== gravado[campo].trim())
    })()

  /** Grava os numeros gerais sem tirar o usuario da etapa das unidades. */
  async function salvarProduto(): Promise<boolean> {
    if (!salvo) return false

    const novosErros = validarProduto(form)
    setErros(novosErros)
    if (Object.keys(novosErros).length > 0) {
      avisar('Revise os campos destacados', 'erro')
      return false
    }

    setSalvandoProduto(true)
    try {
      // O PUT devolve o empreendimento completo (fluxos, unidades e imagens).
      setSalvo(await onSalvar(montarPayload()))
      avisar('Dados gerais salvos')
      return true
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao salvar', 'erro')
      return false
    } finally {
      setSalvandoProduto(false)
    }
  }

  /**
   * Sair da etapa das unidades grava o produto pendente — sem isso o usuario
   * digitaria os numeros e os perderia ao avancar.
   */
  async function irParaPasso(numero: 1 | 2) {
    if (!salvo) return
    if (passo === 2 && produtoAlterado && !(await salvarProduto())) return
    setPasso(numero)
  }

  /** Concluir grava o que estiver pendente antes de fechar. */
  async function concluir() {
    if (produtoAlterado && !(await salvarProduto())) return
    onFechar()
  }

  /** Fechar com produto por gravar precisa de confirmacao: fechar e desistir. */
  function fecharComAviso() {
    if (
      passo === 2 &&
      produtoAlterado &&
      !window.confirm('Os dados gerais do produto ainda não foram salvos. Fechar mesmo assim?')
    ) {
      return
    }
    onFechar()
  }

  function mudar(campo: string, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
    if (erros[campo]) setErros((atual) => ({ ...atual, [campo]: '' }))
  }

  /** Vários campos de uma vez: a busca de endereço preenche cinco juntos. */
  function aplicar(campos: Record<string, string>) {
    setForm((atual) => ({ ...atual, ...campos }))
    setErros((atual) => {
      const limpos = { ...atual }
      for (const campo of Object.keys(campos)) limpos[campo] = ''
      return limpos
    })
  }

  function entrada(campo: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
      <input
        className={`entrada${erros[campo] ? ' entrada--erro' : ''}`}
        value={form[campo]}
        onChange={(e) => mudar(campo, e.target.value)}
        {...extra}
      />
    )
  }

  /** Campo em branco vai como null para a API nao gravar string vazia. */
  /**
   * ⚠️ Os números do produto (m², metragens, dormitórios, suítes, banheiros e
   * vagas) NÃO vão no payload: quem os mantém é o servidor, a cada mudança de
   * unidade. Mandá-los daqui sobrescreveria o cálculo com o que estava na tela
   * quando o formulário abriu.
   */
  function montarPayload(): EmpreendimentoInput {
    const dados: Record<string, string | null> = { nome: form.nome.trim() }
    for (const campo of CAMPOS) {
      if (campo === 'nome' || CAMPOS_PRODUTO.includes(campo)) continue
      dados[campo] = form[campo].trim() || null
    }
    return dados as EmpreendimentoInput
  }

  async function salvarEtapa1() {
    const novosErros = validarDados(form)
    setErros(novosErros)
    if (Object.keys(novosErros).length > 0) {
      avisar('Revise os campos destacados', 'erro')
      return
    }

    setSalvando(true)
    try {
      const resultado = await onSalvar(montarPayload())
      setSalvo(resultado)
      avisar(editando ? 'Empreendimento atualizado' : 'Empreendimento cadastrado')

      // So agora existe id para pendurar as fotos escolhidas antes de salvar.
      if (pendentes.length > 0) {
        try {
          const resposta = await api.enviarImagens(resultado.id, pendentes)
          setPendentes([])
          setSalvo({ ...resultado, imagens: resposta.imagens })
          onMudouImagens(resultado.id, resposta.imagens)

          const recusadas = resposta.recusadas ?? []
          if (recusadas.length > 0) avisar(`${recusadas[0].nome}: ${recusadas[0].motivo}`, 'erro')
          else avisar(pendentes.length === 1 ? 'Foto enviada' : `${pendentes.length} fotos enviadas`)
        } catch (erro) {
          // O cadastro ja foi salvo: as fotos continuam na lista para tentar de
          // novo, e as etapas do topo ja estao liberadas para seguir sem elas.
          const motivo = erro instanceof Error ? erro.message : 'as fotos não subiram'
          avisar(`Empreendimento salvo, mas ${motivo}. Dá para seguir e enviar as fotos depois`, 'erro')
          return
        }
      }

      setPasso(2)
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao salvar', 'erro')
    } finally {
      setSalvando(false)
    }
  }

  /* --- Cabecalho com os dois passos ------------------------------------- */
  const ETAPAS = ['Dados do empreendimento', 'Unidades e fluxos']

  const cabecalho = (
    <div className="passos">
      {ETAPAS.map((titulo, indice) => {
        const numero = indice + 1
        const feito = passo > numero
        return (
          <Fragment key={titulo}>
            {indice > 0 && <span className="passo__traco" />}
            <button
              type="button"
              className={`passo${passo === numero ? ' passo--ativo' : ''}${feito ? ' passo--feito' : ''}`}
              // Navegar entre as etapas so faz sentido com o cadastro ja salvo.
              disabled={!salvo}
              onClick={() => void irParaPasso(numero as 1 | 2)}
            >
              <span className="passo__bolha">
                {feito ? <Icone nome="check" tamanho={12} espessura={3} /> : numero}
              </span>
              {titulo}
            </button>
          </Fragment>
        )
      })}
    </div>
  )

  /* --- Etapa 1 ----------------------------------------------------------- */
  if (passo === 1) {
    return (
      <Modal
        titulo={editando ? 'Editar empreendimento' : 'Adicionar empreendimento'}
        subtitulo="Só o nome é obrigatório — o resto pode ser preenchido depois."
        onFechar={onFechar}
        cabecalhoExtra={cabecalho}
        largo
        rodape={
          <>
            <button type="button" className="btn btn--fantasma" onClick={onFechar}>
              Cancelar
            </button>
            <div className="direita">
              <button type="button" className="btn btn--primario" onClick={salvarEtapa1} disabled={salvando}>
                {salvando ? (
                  <>
                    <Icone nome="spinner" tamanho={15} className="girando" />
                    Salvando…
                  </>
                ) : (
                  <>
                    Salvar e avançar
                    <Icone nome="seta_direita" tamanho={15} />
                  </>
                )}
              </button>
            </div>
          </>
        }
      >
        <form onSubmit={(e) => e.preventDefault()}>
          <section className="form-secao form-secao--dados">
            <h3 className="form-secao__titulo">
              <Icone nome="predio" tamanho={13} />
              Identificação
            </h3>
            <div className="grade">
              <Campo rotulo="Nome do empreendimento" obrigatorio erro={erros.nome} className="col-span-2">
                {entrada('nome', { placeholder: 'Ex.: Residencial Vista Verde', autoFocus: true })}
              </Campo>
              <Campo rotulo="Construtora">
                {entrada('construtora', { placeholder: 'Ex.: Construtora Alfa' })}
              </Campo>
              <Campo rotulo="Tipo">
                <select className="entrada" value={form.tipo} onChange={(e) => mudar('tipo', e.target.value)}>
                  <option value="">Selecione…</option>
                  {TIPOS.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </Campo>
              {/* Quantas torres o prédio tem — a unidade já diz em QUAL delas
                  ela está. Em branco fica "não informado", nunca 0. */}
              <Campo rotulo="Torres" dica="quantos blocos">
                {entrada('torres', { placeholder: '2', inputMode: 'numeric' })}
              </Campo>
            </div>
          </section>

          <section className="form-secao form-secao--chaves">
            <h3 className="form-secao__titulo">
              <Icone nome="local" tamanho={13} />
              Localização
            </h3>
            <SeletorDeLocal
              valores={{
                endereco: form.endereco,
                cidade: form.cidade,
                bairro: form.bairro,
                latitude: form.latitude,
                longitude: form.longitude,
              }}
              onAplicar={aplicar}
              erros={{ latitude: erros.latitude, longitude: erros.longitude }}
              entrada={entrada}
            />
          </section>

          <section className="form-secao form-secao--obra">
            <h3 className="form-secao__titulo">
              <Icone nome="obra" tamanho={13} />
              Obra
            </h3>
            <div className="grade">
              <Campo rotulo="Status da obra">
                <select
                  className="entrada"
                  value={form.status_obra}
                  onChange={(e) => mudar('status_obra', e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {STATUS_OBRA.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Entrega prevista" dica="mês/ano">
                {entrada('entrega', { type: 'month' })}
              </Campo>
            </div>
          </section>

          <section className="form-secao form-secao--pagamentos">
            <h3 className="form-secao__titulo">
              <Icone nome="imagem" tamanho={13} />
              Fotos
              <span className="form-secao__opcional">— opcional, dá para enviar depois</span>
            </h3>

            <GaleriaUpload
              empreendimentoId={salvo?.id ?? null}
              imagens={salvo?.imagens ?? []}
              pendentes={pendentes}
              onImagens={(imagens) => salvo && aplicarImagens(salvo.id, imagens)}
              onPendentes={setPendentes}
              avisar={avisar}
            />

            {/* O link avulso e a forma antiga de dar capa ao empreendimento;
                fica recolhido para nao competir com o envio de arquivos. */}
            <div className="link-avulso">
              <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setVerLink((v) => !v)}>
                <Icone nome={verLink ? 'seta_cima' : 'seta_baixo'} tamanho={13} />
                Usar um link de imagem
              </button>

              {verLink && (
                <div className="grade" style={{ marginTop: 'var(--e3)' }}>
                  <Campo
                    rotulo="Link de imagem"
                    className="col-inteira"
                    dica="só vale quando não há fotos enviadas"
                  >
                    {entrada('imagem_url', { placeholder: 'https://…', type: 'url' })}
                  </Campo>
                  {form.imagem_url.trim() && (
                    <div className="col-inteira">
                      <img
                        src={form.imagem_url}
                        alt="Pré-visualização da imagem"
                        className="link-avulso__previa"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                        onLoad={(e) => {
                          e.currentTarget.style.display = 'block'
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="form-secao form-secao--resultado">
            <h3 className="form-secao__titulo">
              <Icone nome="lista" tamanho={13} />
              Observações
            </h3>
            <div className="grade">
              <Campo rotulo="Observações" className="col-inteira">
                <textarea
                  className="entrada"
                  value={form.observacoes}
                  onChange={(e) => mudar('observacoes', e.target.value)}
                  placeholder="Diferenciais, lazer, pontos de atenção…"
                  rows={3}
                />
              </Campo>
            </div>
          </section>
        </form>

        {calculadora}
      </Modal>
    )
  }

  /* --- Etapa 2: produto, unidades e o fluxo de cada uma --------------------- */
  return (
    <>
      <Modal
        titulo="Unidades e fluxos"
        subtitulo={
          salvo ? `${salvo.nome} — cada planta com a própria metragem, preço e tabela de pagamento` : ''
        }
        onFechar={fecharComAviso}
        cabecalhoExtra={cabecalho}
        largo
        rodape={
          <>
            <button type="button" className="btn btn--fantasma" onClick={() => void irParaPasso(1)} disabled={salvandoProduto}>
              <Icone nome="seta_esquerda" tamanho={15} />
              Voltar aos dados
            </button>
            <div className="direita">
              <button
                type="button"
                className="btn btn--primario"
                onClick={() => void concluir()}
                disabled={salvandoProduto}
              >
                {salvandoProduto ? (
                  <>
                    <Icone nome="spinner" tamanho={15} className="girando" />
                    Salvando…
                  </>
                ) : (
                  <>
                    <Icone nome="check" tamanho={15} />
                    Concluir
                  </>
                )}
              </button>
            </div>
          </>
        }
      >
        {calculadora}

        {/* Os números do empreendimento saem das UNIDADES, não da digitação.
            Eram sete campos aqui — os mesmos que quem cadastra já preenche em
            cada unidade —, e duas versões da mesma verdade sempre terminam com
            a de cima envelhecendo calada. */}
        <section className="form-secao form-secao--dados">
          <h3 className="form-secao__titulo">
            <Icone nome="regua" tamanho={13} />
            Números do empreendimento
            <span className="form-secao__opcional">— calculados a partir das unidades</span>
          </h3>

          <ResumoDasUnidades unidades={salvo?.unidades ?? []} />

          <div className="acoes-fluxo" style={{ marginTop: 'var(--e3)' }}>
            <button type="button" className="btn btn--secundario" onClick={() => setCalculadoraAberta(true)}>
              <Icone nome="grafico" tamanho={15} />
              Calcular valor com CUB
            </button>
            <span className="campo__dica">
              A calculadora só simula o reajuste — quem grava a tabela de venda é a unidade.
            </span>
          </div>
        </section>

        {salvo && (
          <UnidadesDoEmpreendimento
            empreendimentoId={salvo.id}
            empreendimento={salvo}
            unidades={salvo.unidades}
            onMudou={(unidades) => aplicarUnidades(salvo.id, unidades)}
            avisar={avisar}
          />
        )}
      </Modal>
    </>
  )
}

import { useMemo, useState } from 'react'
import type {
  CampoImportado,
  CamposImportados,
  Empreendimento,
  EntradaImportacao,
  PreviaImportacao,
  ResultadoImportacao,
  Unidade,
} from '../types'
import { api } from '../lib/api'
import { mensagemDoErro } from '../lib/http'
import { fmtMoeda, fmtNumero, TRACO } from '../lib/format'
import { rotuloStatusUnidade, STATUS_UNIDADE_SLUG } from '../lib/opcoes'
import { montarPromptDeImportacao } from '../lib/promptImportacao'
import { descreverFluxoDaConstrutora, nomeDoFluxoImportado } from '../lib/fluxoImportado'
import { validarRespostaDaIa } from '../lib/validarImportacao'
import {
  CAMPOS_EDITAVEIS,
  CAMPOS_NUMERICOS,
  correcoesEfetivas,
  ROTULO_CAMPO_IMPORTADO as ROTULO_CAMPO,
  textoDoCampo,
  variacaoDePreco,
  type CorrecoesDaLinha,
} from '../lib/correcaoImportacao'
import { Icone } from './Icones'
import { Campo, Modal } from './ui'

/**
 * Importar a tabela de vendas da construtora, em quatro passos.
 *
 * Quem LE a tabela e a IA do usuario (o ChatGPT dele): a tela entrega um
 * prompt pronto, ele cola a tabela la e traz o JSON de volta. Por isso o
 * fluxo e em passos e nao num formulario so — sair da tela, ir ao chat e
 * voltar e parte do processo, e o passo diz em que ponto dele a pessoa esta.
 *
 * A regra que organiza a previa: NADA aqui apaga. Criar e atualizar vem
 * marcados (e o que a pessoa pediu ao importar); "sumiu da tabela" vem
 * DESMARCADO, porque uma coluna esquecida na planilha da construtora nao pode
 * derrubar o cadastro de um andar inteiro sem alguem dizer que sim.
 */

/* ------------------------------------------------------------------ */
/* Formatação dos valores da prévia                                    */
/* ------------------------------------------------------------------ */

const AREAS = new Set<CampoImportado>(['metragem', 'metragem_total', 'area_comum', 'area_terraco'])

/** O valor de um campo como a prévia mostra — cada tipo na sua unidade. */
function mostrar(campo: CampoImportado, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return TRACO
  if (campo === 'valor') return fmtMoeda(Number(valor))
  if (campo === 'status') return rotuloStatusUnidade(String(valor))
  if (AREAS.has(campo)) return `${fmtNumero(Number(valor))} m²`
  return String(valor)
}

/** Como a unidade NOVA é chamada antes de existir (ela ainda não tem id). */
function rotuloDaNova(campos: CamposImportados): string {
  if (campos.identificacao) return campos.identificacao
  const partes = [campos.torre, campos.numero ? `nº ${campos.numero}` : null].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : 'Unidade sem identificação'
}

/* ------------------------------------------------------------------ */
/* Correção da leitura, antes de gravar                                */
/* ------------------------------------------------------------------ */

/** Preço e disponibilidade: as duas mudanças que decidem uma conversa de venda. */
const CAMPOS_CHAVE = new Set<CampoImportado>(['valor', 'status'])

/**
 * Como cada linha da prévia é identificada enquanto ela ainda não foi gravada:
 * a nova só existe pela posição na lista; a alterada já tem id no banco.
 */
const chaveNova = (indice: number) => `n${indice}`
const chaveAlterada = (id: number) => `a${id}`

/**
 * Os campos importáveis de uma linha, em inputs, para corrigir a leitura da IA
 * antes de gravar.
 *
 * Existe porque a tabela da construtora não é padronizada: uma coluna lida como
 * área comum quando era privativa vira preço do m² errado em trinta unidades, e
 * hoje a única saída seria voltar ao chat e refazer a resposta inteira.
 */
function EditorDaLinha({
  proposto,
  digitado,
  onMudar,
  aviso,
}: {
  proposto: CamposImportados
  digitado: CorrecoesDaLinha | undefined
  onMudar: (campo: CampoImportado, texto: string) => void
  aviso: string
}) {
  return (
    <div className="importacao__editor">
      <div className="grade grade--compacta">
        {CAMPOS_EDITAVEIS.map((campo) => {
          const proposta = textoDoCampo(campo, proposto[campo])
          const texto = digitado?.[campo] ?? proposta
          const mudou = texto !== proposta

          return (
            <Campo
              key={campo}
              rotulo={ROTULO_CAMPO[campo]}
              dica={mudou ? 'corrigido' : undefined}
              className={mudou ? 'campo--corrigido' : undefined}
            >
              {campo === 'status' ? (
                <select className="entrada" value={texto} onChange={(evento) => onMudar(campo, evento.target.value)}>
                  <option value="">Não informado</option>
                  {STATUS_UNIDADE_SLUG.map((slug) => (
                    <option key={slug} value={slug}>
                      {rotuloStatusUnidade(slug)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="entrada"
                  value={texto}
                  onChange={(evento) => onMudar(campo, evento.target.value)}
                  inputMode={CAMPOS_NUMERICOS.has(campo) ? 'decimal' : undefined}
                  placeholder={CAMPOS_NUMERICOS.has(campo) ? '—' : 'Não informado'}
                />
              )}
            </Campo>
          )
        })}
      </div>
      <p className="importacao__nota">{aviso}</p>
    </div>
  )
}

/** O resumo de uma unidade nova, na linha: o que dela dá para dizer. */
function resumoDaNova(campos: CamposImportados): string {
  const partes = [
    campos.tipologia,
    campos.metragem !== null ? `${fmtNumero(campos.metragem)} m²` : null,
    campos.valor !== null ? fmtMoeda(campos.valor) : null,
    campos.status ? rotuloStatusUnidade(campos.status) : null,
  ].filter(Boolean)
  return partes.join(' · ')
}

/* ------------------------------------------------------------------ */
/* Área de transferência                                               */
/* ------------------------------------------------------------------ */

/**
 * Copiar com plano B: `navigator.clipboard` só existe em contexto seguro
 * (https ou localhost), e o dashboard costuma ser aberto por IP na rede ou por
 * túnel — onde a API simplesmente não está lá. Sem o plano B, o botão
 * principal do passo 1 falharia calado justo em quem usa fora do localhost.
 */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    // Cai no plano B abaixo: a permissão pode ter sido negada.
  }

  try {
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* O componente                                                        */
/* ------------------------------------------------------------------ */

interface Props {
  empreendimento: Empreendimento
  /**
   * A lista da tela acompanha: a rota de confirmar devolve as unidades prontas
   * e as torres gravadas no prédio (null quando ninguém informou nenhuma).
   */
  onImportou: (unidades: Unidade[], torres: number | null) => void
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
  onFechar: () => void
}

type Passo = 1 | 2 | 3 | 4

export function ImportarTabela({ empreendimento, onImportou, avisar, onFechar }: Props) {
  const [passo, setPasso] = useState<Passo>(1)
  const [copiado, setCopiado] = useState(false)

  const [texto, setTexto] = useState('')
  const [problemas, setProblemas] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const [previa, setPrevia] = useState<PreviaImportacao | null>(null)
  const [entrada, setEntrada] = useState<EntradaImportacao | null>(null)
  // Marcadas por índice/id. Criar e atualizar nascem marcadas; ausentes, não.
  const [criarMarcadas, setCriarMarcadas] = useState<Set<number>>(new Set())
  const [atualizarMarcadas, setAtualizarMarcadas] = useState<Set<number>>(new Set())
  const [ausentesMarcadas, setAusentesMarcadas] = useState<Set<number>>(new Set())

  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  // Nasce MARCADO quando a tabela traz condição de pagamento: quem importou
  // uma tabela com fluxo quer o fluxo. Quem só queria preços desmarca.
  const [gravarFluxo, setGravarFluxo] = useState(true)
  // Torres é PROPOSTA da leitura: quem confirma ajusta antes de gravar. Texto
  // (e não número) porque o campo em branco precisa continuar "não informado".
  const [torres, setTorres] = useState('')
  // O que a pessoa corrigiu na prévia, por linha. Guardado como TEXTO: é o que
  // está no input, e a conversão para número/status acontece na confirmação.
  const [correcoes, setCorrecoes] = useState<Record<string, CorrecoesDaLinha>>({})
  // Quais linhas estão com os campos abertos. Fechadas por padrão: corrigir é a
  // exceção, e a prévia existe primeiro para MOSTRAR o que vai acontecer.
  const [editando, setEditando] = useState<Set<string>>(new Set())

  const prompt = useMemo(
    () => montarPromptDeImportacao({ empreendimento: empreendimento.nome }),
    [empreendimento.nome],
  )

  const totalMarcado =
    criarMarcadas.size + atualizarMarcadas.size + ausentesMarcadas.size

  // Só a condição de pagamento a gravar já é motivo para confirmar: é o caso
  // de quem reimporta a MESMA tabela só para o fluxo entrar nas unidades.
  const soOFluxo =
    gravarFluxo && !!previa?.fluxo_construtora && (previa?.inalteradas.length ?? 0) > 0 && totalMarcado === 0

  /** As torres que o usuário deixou no campo; em branco = não informado. */
  const torresInformadas = torres.trim() ? Number(torres.trim().replace(',', '.')) : null

  // Ajustar só as torres já é motivo para confirmar: a tabela pode não ter
  // mudado nenhuma unidade e ainda assim ter revelado quantas torres existem.
  const soAsTorres =
    torresInformadas !== null &&
    Number.isFinite(torresInformadas) &&
    torresInformadas !== (previa?.torresAtual ?? null)

  // Unidades que fogem da condição geral — a tabela varia de uma para a outra.
  const unidadesComFluxoProprio =
    (previa?.novas.filter((n) => n.fluxo).length ?? 0) + (previa?.alteradas.filter((a) => a.fluxo).length ?? 0)

  async function copiarPrompt() {
    const ok = await copiarTexto(prompt)
    setCopiado(ok)
    if (ok) avisar('Prompt copiado — cole no seu ChatGPT junto com a tabela', 'sucesso')
    else avisar('Não consegui copiar automaticamente. Selecione o texto abaixo e copie à mão', 'erro')
  }

  /** Passo 2 → 3: valida aqui e, só se passar, pede a prévia ao servidor. */
  async function validarEPedirPrevia() {
    setErro(null)
    const lido = validarRespostaDaIa(texto)
    setProblemas(lido.problemas)
    if (!lido.ok) return

    const payload: EntradaImportacao = {
      unidades: lido.unidades,
      duvidas: lido.duvidas,
      fluxo_construtora: lido.fluxo_construtora,
      torres: lido.torres,
    }

    setOcupado(true)
    try {
      const resposta = await api.previaImportacao(empreendimento.id, payload)
      setEntrada(payload)
      setPrevia(resposta)
      setCriarMarcadas(new Set(resposta.novas.map((_, indice) => indice)))
      setAtualizarMarcadas(new Set(resposta.alteradas.map((a) => a.id)))
      setAusentesMarcadas(new Set())
      // Prévia nova, leitura nova: correção de uma tabela anterior não pode
      // sobreviver a uma segunda colagem.
      setCorrecoes({})
      setEditando(new Set())
      setGravarFluxo(true)
      // O que a tabela deixou concluir; sem conclusão, o que já está gravado —
      // e nunca um número inventado para preencher o campo.
      setTorres(String(resposta.torres ?? resposta.torresAtual ?? ''))
      setPasso(3)
    } catch (falha) {
      // O 400 da rota traz a lista de problemas: mostrar todos evita a viagem
      // de volta ao chat um erro por vez.
      const corpo = (falha as { corpo?: { problemas?: string[] } }).corpo
      if (Array.isArray(corpo?.problemas) && corpo.problemas.length > 0) setProblemas(corpo.problemas)
      else setErro(mensagemDoErro(falha, 'Não foi possível montar a prévia'))
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar() {
    if (!previa || (totalMarcado === 0 && !soOFluxo && !soAsTorres)) return
    setErro(null)
    setOcupado(true)
    try {
      const resposta = await api.confirmarImportacao(empreendimento.id, {
        criar: previa.novas
          .map((nova, indice) => ({ nova, indice }))
          .filter(({ indice }) => criarMarcadas.has(indice))
          .map(({ nova, indice }) => {
            // O corrigido VENCE o proposto. A API revalida os dois do mesmo
            // jeito — para ela é tudo texto colado por uma pessoa.
            const correcao = correcoesEfetivas(correcoes[chaveNova(indice)], nova.campos)
            return {
              ...nova.campos,
              ...correcao,
              fluxo: nova.fluxo ?? null,
              corrigida: Object.keys(correcao).length > 0,
            }
          }),
        atualizar: [
          ...previa.alteradas
            .filter((alterada) => atualizarMarcadas.has(alterada.id))
            .map((alterada) => {
              const correcao = correcoesEfetivas(correcoes[chaveAlterada(alterada.id)], alterada.proposto)
              const campos: Record<string, unknown> = { ...alterada.depois }

              for (const [campo, valor] of Object.entries(correcao)) {
                // Campo esvaziado na correção NÃO apaga o que está gravado: a
                // importação apenas deixa de mexer nele. Nada aqui zera unidade.
                if (valor === null) delete campos[campo]
                else campos[campo] = valor
              }

              return {
                id: alterada.id,
                campos: campos as Partial<CamposImportados>,
                fluxo: alterada.fluxo ?? null,
                corrigida: Object.keys(correcao).length > 0,
              }
            }),
          // Unidade que não mudou nada entra SÓ para receber a condição de
          // pagamento — sem campos, ela não é contada como atualizada.
          ...(gravarFluxo && previa.fluxo_construtora
            ? previa.inalteradas.map((u) => ({ id: u.id, campos: {}, fluxo: null }))
            : []),
        ],
        marcarIndisponiveis: previa.ausentes
          .filter((ausente) => ausentesMarcadas.has(ausente.id))
          .map((ausente) => ausente.id),
        fluxo_construtora: entrada?.fluxo_construtora ?? null,
        gravarFluxo,
        // Campo em branco = "não informado": a confirmação não pode apagar as
        // torres que já estavam no cadastro.
        torres: torresInformadas,
      })
      setResultado(resposta)
      onImportou(resposta.unidades, resposta.torres)
      setPasso(4)
      avisar('Tabela importada', 'sucesso')
    } catch (falha) {
      setErro(mensagemDoErro(falha, 'Não foi possível gravar a importação'))
    } finally {
      setOcupado(false)
    }
  }

  const alternar = (
    conjunto: Set<number>,
    definir: (novo: Set<number>) => void,
    chave: number,
  ) => {
    const proximo = new Set(conjunto)
    if (proximo.has(chave)) proximo.delete(chave)
    else proximo.add(chave)
    definir(proximo)
  }

  /** O que a pessoa acabou de digitar num campo de uma linha da prévia. */
  const corrigir = (chave: string, campo: CampoImportado, texto: string) =>
    setCorrecoes((atual) => ({ ...atual, [chave]: { ...atual[chave], [campo]: texto } }))

  const alternarEdicao = (chave: string) =>
    setEditando((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(chave)) proximo.delete(chave)
      else proximo.add(chave)
      return proximo
    })

  /** O botão que abre os campos de uma linha para correção. */
  const botaoCorrigir = (chave: string) => (
    <button
      type="button"
      className="btn btn--fantasma btn--pequeno importacao__corrigir"
      onClick={() => alternarEdicao(chave)}
      aria-expanded={editando.has(chave)}
    >
      <Icone nome="lapis" tamanho={12} />
      {editando.has(chave) ? 'Fechar os campos' : 'Corrigir a leitura'}
    </button>
  )

  /* --- Rodapé: um único CTA primário por passo ---------------------- */

  const rodape = (
    <>
      <div className="esquerda">
        {passo === 2 && (
          <button type="button" className="btn btn--fantasma" onClick={() => setPasso(1)} disabled={ocupado}>
            Voltar ao prompt
          </button>
        )}
        {passo === 3 && (
          <button type="button" className="btn btn--fantasma" onClick={() => setPasso(2)} disabled={ocupado}>
            Voltar e colar de novo
          </button>
        )}
      </div>
      <div className="direita">
        {passo === 1 && (
          <button type="button" className="btn btn--primario" onClick={() => setPasso(2)}>
            Já copiei — colar a resposta
            <Icone nome="seta_direita" tamanho={14} />
          </button>
        )}
        {passo === 2 && (
          <button
            type="button"
            className="btn btn--primario"
            onClick={() => void validarEPedirPrevia()}
            disabled={ocupado || texto.trim().length === 0}
          >
            {ocupado ? <Icone nome="spinner" tamanho={14} className="girando" /> : <Icone nome="check" tamanho={14} />}
            {ocupado ? 'Conferindo…' : 'Conferir e ver a prévia'}
          </button>
        )}
        {passo === 3 && (
          <button
            type="button"
            className="btn btn--primario"
            onClick={() => void confirmar()}
            disabled={ocupado || (totalMarcado === 0 && !soOFluxo && !soAsTorres)}
          >
            {ocupado ? <Icone nome="spinner" tamanho={14} className="girando" /> : <Icone nome="check" tamanho={14} />}
            {ocupado
              ? 'Importando…'
              : soOFluxo
                ? 'Gravar a condição de pagamento'
                : totalMarcado === 0
                  ? soAsTorres
                    ? 'Gravar as torres'
                    : 'Nada marcado'
                  : `Importar ${totalMarcado} ${totalMarcado === 1 ? 'unidade' : 'unidades'}`}
          </button>
        )}
        {passo === 4 && (
          <button type="button" className="btn btn--primario" onClick={onFechar}>
            Concluir
          </button>
        )}
      </div>
    </>
  )

  return (
    <Modal
      titulo="Importar tabela da construtora"
      subtitulo={empreendimento.nome}
      largo
      onFechar={onFechar}
      rodape={rodape}
    >
      <ol className="importacao__trilha" aria-label="Etapas da importação">
        {['Copiar o prompt', 'Colar a resposta', 'Conferir', 'Pronto'].map((nome, indice) => (
          <li
            key={nome}
            className={`importacao__etapa${passo === indice + 1 ? ' importacao__etapa--atual' : ''}${
              passo > indice + 1 ? ' importacao__etapa--feita' : ''
            }`}
          >
            <span className="importacao__etapa-num">{passo > indice + 1 ? '✓' : indice + 1}</span>
            {nome}
          </li>
        ))}
      </ol>

      {erro && (
        <div className="importacao__erro" role="alert">
          <Icone nome="alerta" tamanho={14} />
          {erro}
        </div>
      )}

      {/* --- Passo 1: o prompt ---------------------------------------- */}
      {passo === 1 && (
        <>
          <section className="form-secao form-secao--dados">
            <h4 className="form-secao__titulo">
              <Icone nome="info" tamanho={16} />
              Como funciona
            </h4>
            <ol className="importacao__instrucoes">
              <li>
                Copie o prompt abaixo e cole no <strong>seu ChatGPT</strong> (ou outra IA que você já use).
              </li>
              <li>
                Na mesma mensagem, logo depois do prompt, cole a <strong>tabela da construtora</strong> — do Excel, do
                PDF ou do CSV.
              </li>
              <li>Copie a resposta inteira que a IA devolver e volte aqui para colar no passo seguinte.</li>
            </ol>
            <p className="importacao__nota">
              A tabela não sai do seu computador para nenhum servidor nosso: quem lê é a IA da sua conta. Nada é gravado
              antes de você conferir a prévia.
            </p>
          </section>

          <section className="form-secao form-secao--chaves">
            <h4 className="form-secao__titulo">
              <Icone nome="copiar" tamanho={16} />
              O prompt
            </h4>
            <button type="button" className="btn btn--secundario" onClick={() => void copiarPrompt()}>
              <Icone nome={copiado ? 'check' : 'copiar'} tamanho={14} />
              {copiado ? 'Copiado' : 'Copiar prompt'}
            </button>
            <pre className="importacao__prompt" aria-label="Texto do prompt">
              {prompt}
            </pre>
          </section>
        </>
      )}

      {/* --- Passo 2: colar a resposta -------------------------------- */}
      {passo === 2 && (
        <section className="form-secao form-secao--dados">
          <h4 className="form-secao__titulo">
            <Icone nome="lista" tamanho={16} />
            Cole aqui a resposta da IA
          </h4>
          <p className="importacao__nota">
            Pode colar a resposta inteira, com o texto de conversa em volta — o bloco JSON é recortado sozinho.
          </p>
          <textarea
            className="importacao__area"
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value)
              if (problemas.length > 0) setProblemas([])
            }}
            placeholder={'```json\n{ "unidades": [ … ] }\n```'}
            rows={12}
            aria-label="Resposta da IA"
          />

          {problemas.length > 0 && (
            <div className="importacao__problemas" role="alert">
              <strong>
                <Icone nome="alerta" tamanho={14} />
                {problemas.length === 1
                  ? 'Um problema impede a importação:'
                  : `${problemas.length} problemas impedem a importação:`}
              </strong>
              <ul>
                {problemas.map((problema, indice) => (
                  <li key={indice}>{problema}</li>
                ))}
              </ul>
              <p className="importacao__nota">
                Corrija no chat (peça para refazer só o bloco JSON) e cole de novo. Nada foi gravado.
              </p>
            </div>
          )}
        </section>
      )}

      {/* --- Passo 3: a prévia ---------------------------------------- */}
      {passo === 3 && previa && (
        <>
          {/* O cabeçalho responde de relance "de que prédio é esta tabela e o
              que ela tem": sem isso, a prévia começava numa lista de unidades
              sem dizer quantas foram identificadas. */}
          <section className="form-secao form-secao--resultado">
            <h4 className="form-secao__titulo">
              <Icone nome="predio" tamanho={16} />
              {previa.empreendimento || empreendimento.nome}
              <span className="form-secao__complemento">
                {previa.totalRecebidas}{' '}
                {previa.totalRecebidas === 1 ? 'unidade identificada' : 'unidades identificadas'}
              </span>
            </h4>

            <div className="grade">
              <Campo rotulo="Torres" dica={previa.torres === null ? 'a tabela não deixou claro' : 'lido da tabela'}>
                <input
                  className="entrada"
                  value={torres}
                  onChange={(evento) => setTorres(evento.target.value)}
                  placeholder="2"
                  inputMode="numeric"
                  aria-label="Quantas torres o empreendimento tem"
                />
              </Campo>
            </div>

            <p className="importacao__nota">
              {previa.novas.length} nova(s) · {previa.alteradas.length} alterada(s) · {previa.ausentes.length}{' '}
              ausente(s) · {previa.duvidas.length} dúvida(s) da IA.
              {torres.trim()
                ? ' As torres serão gravadas no empreendimento ao confirmar.'
                : ' Em branco, as torres do cadastro ficam como estão.'}
            </p>
            <p className="importacao__nota">
              Leu algo errado? Use <strong>Corrigir a leitura</strong> na linha: o valor que você digitar entra no lugar
              do que a IA propôs.
            </p>
          </section>

          {previa.duvidas.length > 0 && (
            <section className="form-secao form-secao--obra importacao__duvidas">
              <h4 className="form-secao__titulo">
                <Icone nome="alerta" tamanho={16} />
                A IA ficou em dúvida
                <span className="form-secao__complemento">confira estes pontos na tabela original</span>
              </h4>
              <ul className="importacao__lista-duvidas">
                {previa.duvidas.map((duvida, indice) => (
                  <li key={indice}>
                    {duvida.unidade && <strong>{duvida.unidade}: </strong>}
                    {duvida.texto}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="form-secao form-secao--dados">
            <h4 className="form-secao__titulo">
              <Icone nome="mais" tamanho={16} />
              Unidades novas
              <span className="form-secao__complemento">
                {previa.novas.length === 0 ? 'nenhuma' : `${previa.novas.length} serão cadastradas`}
              </span>
            </h4>
            {previa.novas.length === 0 ? (
              <p className="importacao__vazio">Nenhuma unidade nova — todas as linhas da tabela já estão no cadastro.</p>
            ) : (
              <ul className="importacao__itens">
                {previa.novas.map((nova, indice) => {
                  const chave = chaveNova(indice)
                  const correcao = correcoesEfetivas(correcoes[chave], nova.campos)
                  const corrigida = Object.keys(correcao).length > 0
                  // A linha mostra o que VAI ser gravado: com correção, o
                  // corrigido; sem ela, o que a tabela trouxe.
                  const campos = { ...nova.campos, ...correcao }

                  return (
                    <li key={indice} className={`importacao__item${corrigida ? ' importacao__item--corrigida' : ''}`}>
                      <label className="importacao__marca">
                        <input
                          type="checkbox"
                          checked={criarMarcadas.has(indice)}
                          onChange={() => alternar(criarMarcadas, setCriarMarcadas, indice)}
                        />
                        <span className="importacao__nome">{rotuloDaNova(campos)}</span>
                        {nova.fluxo && (
                          <span className="importacao__selo" title="Esta unidade tem condição de pagamento própria">
                            condição própria
                          </span>
                        )}
                        {corrigida && (
                          <span
                            className="importacao__selo importacao__selo--corrigida"
                            title="Você corrigiu a leitura desta linha"
                          >
                            corrigida
                          </span>
                        )}
                      </label>
                      <span className="importacao__resumo">{resumoDaNova(campos) || TRACO}</span>
                      {botaoCorrigir(chave)}
                      {editando.has(chave) && (
                        <EditorDaLinha
                          proposto={nova.campos}
                          digitado={correcoes[chave]}
                          onMudar={(campo, texto) => corrigir(chave, campo, texto)}
                          aviso="O que você corrigir aqui vale mais do que a leitura da IA. Campo em branco entra como “não informado”, nunca como zero."
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="form-secao form-secao--pagamentos">
            <h4 className="form-secao__titulo">
              <Icone nome="lapis" tamanho={16} />
              Unidades que mudaram
              <span className="form-secao__complemento">
                {previa.alteradas.length === 0 ? 'nenhuma' : `${previa.alteradas.length} serão atualizadas`}
              </span>
            </h4>
            {previa.alteradas.length === 0 ? (
              <p className="importacao__vazio">Nenhuma mudança: o que a tabela traz é igual ao que está gravado.</p>
            ) : (
              <ul className="importacao__itens">
                {previa.alteradas.map((alterada) => {
                  const chave = chaveAlterada(alterada.id)
                  const correcao = correcoesEfetivas(correcoes[chave], alterada.proposto)
                  const corrigida = Object.keys(correcao).length > 0

                  return (
                    <li
                      key={alterada.id}
                      className={`importacao__item${corrigida ? ' importacao__item--corrigida' : ''}`}
                    >
                      <label className="importacao__marca">
                        <input
                          type="checkbox"
                          checked={atualizarMarcadas.has(alterada.id)}
                          onChange={() => alternar(atualizarMarcadas, setAtualizarMarcadas, alterada.id)}
                        />
                        <span className="importacao__nome">{alterada.identificacao}</span>
                        {alterada.fluxo && (
                          <span className="importacao__selo" title="Esta unidade tem condição de pagamento própria">
                            condição própria
                          </span>
                        )}
                        {corrigida && (
                          <span
                            className="importacao__selo importacao__selo--corrigida"
                            title="Você corrigiu a leitura desta linha"
                          >
                            corrigida
                          </span>
                        )}
                      </label>
                      {alterada.campos.length === 0 && (
                        <span className="importacao__resumo">só a condição de pagamento muda</span>
                      )}
                      <ul className="importacao__mudancas">
                        {alterada.campos.map((campo) => {
                          // Preço e status não são "mais um campo que mudou":
                          // são o que decide a conversa de venda da semana.
                          const chaveDaVenda = CAMPOS_CHAVE.has(campo)
                          const variacao = campo === 'valor'
                            ? variacaoDePreco(alterada.antes[campo], alterada.depois[campo])
                            : null

                          return (
                            <li key={campo} className={chaveDaVenda ? 'importacao__mudanca--chave' : undefined}>
                              <span className="importacao__campo">{ROTULO_CAMPO[campo]}</span>
                              <span className="importacao__antes">{mostrar(campo, alterada.antes[campo])}</span>
                              <Icone nome="seta_direita" tamanho={12} />
                              <span className="importacao__depois">{mostrar(campo, alterada.depois[campo])}</span>
                              {variacao && (
                                <span
                                  className={`importacao__variacao importacao__variacao--${
                                    variacao.subiu ? 'sobe' : 'desce'
                                  }`}
                                >
                                  {variacao.texto}
                                </span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                      {botaoCorrigir(chave)}
                      {editando.has(chave) && (
                        <EditorDaLinha
                          proposto={alterada.proposto}
                          digitado={correcoes[chave]}
                          onMudar={(campo, texto) => corrigir(chave, campo, texto)}
                          aviso="O que você corrigir aqui vale mais do que a leitura da IA. Campo deixado em branco não apaga o que já está gravado: a importação simplesmente não mexe nele."
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="form-secao form-secao--obra">
            <h4 className="form-secao__titulo">
              <Icone nome="alerta" tamanho={16} />
              Sumiram da tabela
              <span className="form-secao__complemento">
                {previa.ausentes.length === 0 ? 'nenhuma' : `${previa.ausentes.length} não vieram na tabela nova`}
              </span>
            </h4>
            {previa.ausentes.length === 0 ? (
              <p className="importacao__vazio">Todas as unidades cadastradas apareceram na tabela.</p>
            ) : (
              <>
                <p className="importacao__nota">
                  Nada é apagado. Marque só o que você tem certeza de que saiu de venda — a unidade passa a
                  “Indisponível” e continua no cadastro, com o histórico dela.
                </p>
                <ul className="importacao__itens">
                  {previa.ausentes.map((ausente) => (
                    <li key={ausente.id} className="importacao__item">
                      <label className="importacao__marca">
                        <input
                          type="checkbox"
                          checked={ausentesMarcadas.has(ausente.id)}
                          onChange={() => alternar(ausentesMarcadas, setAusentesMarcadas, ausente.id)}
                        />
                        <span className="importacao__nome">{ausente.identificacao}</span>
                      </label>
                      <span className="importacao__resumo">
                        marcar indisponível (hoje: {rotuloStatusUnidade(ausente.status_atual)})
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {(previa.fluxo_construtora || previa.novas.some((n) => n.fluxo) || previa.alteradas.some((a) => a.fluxo)) && (
            <section className="form-secao form-secao--chaves">
              <h4 className="form-secao__titulo">
                <Icone nome="cartao" tamanho={16} />
                Condição de pagamento lida
                <span className="form-secao__complemento">{nomeDoFluxoImportado(previa.fluxo_construtora)}</span>
              </h4>

              {previa.fluxo_construtora ? (
                <ul className="importacao__mudancas importacao__mudancas--fluxo">
                  {descreverFluxoDaConstrutora(previa.fluxo_construtora).map((parte) => (
                    <li key={parte.rotulo}>
                      <span className="importacao__campo">
                        {parte.rotulo}
                        {parte.posChaves && ' *'}
                      </span>
                      <span className="importacao__depois">{parte.texto}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="importacao__vazio">
                  A tabela não tem condição geral — só as unidades com condição própria recebem fluxo.
                </p>
              )}

              {descreverFluxoDaConstrutora(previa.fluxo_construtora).some((p) => p.posChaves) && (
                <p className="importacao__nota">
                  * pago <strong>depois da entrega</strong> — não entra no desembolso até as chaves.
                </p>
              )}

              {unidadesComFluxoProprio > 0 && (
                <p className="importacao__nota">
                  {unidadesComFluxoProprio === 1
                    ? '1 unidade tem condição própria e recebe a dela, não esta.'
                    : `${unidadesComFluxoProprio} unidades têm condição própria e recebem a delas, não esta.`}
                </p>
              )}

              {/* O único ponto da prévia em que se decide GRAVAR o fluxo. Vem
                  marcado porque é o que se espera de quem importou uma tabela
                  com condição de pagamento — mas quem só queria atualizar
                  preços não pode levar um fluxo novo em cada unidade junto. */}
              <label className="importacao__marca">
                <input type="checkbox" checked={gravarFluxo} onChange={() => setGravarFluxo(!gravarFluxo)} />
                <span className="importacao__nome">Criar a condição de pagamento nas unidades importadas</span>
              </label>
              <p className="importacao__nota">
                Cada unidade recebe a tabela de venda dela. Reimportar a mesma tabela ATUALIZA a que já existe com o
                mesmo nome — não cria uma cópia.
                {previa.inalteradas.length > 0 && previa.fluxo_construtora && (
                  <>
                    {' '}
                    As <strong>{previa.inalteradas.length}</strong> unidades que não mudaram também recebem a condição —
                    é a tabela do prédio, não só das que mudaram de preço.
                  </>
                )}
              </p>
            </section>
          )}
        </>
      )}

      {/* --- Passo 4: o resultado ------------------------------------- */}
      {passo === 4 && resultado && (
        <section className="form-secao form-secao--resultado">
          <h4 className="form-secao__titulo">
            <Icone nome="check" tamanho={16} />
            Importação concluída
          </h4>
          <ul className="importacao__contagens">
            <li>
              <strong>{resultado.criadas}</strong> {resultado.criadas === 1 ? 'unidade criada' : 'unidades criadas'}
            </li>
            <li>
              <strong>{resultado.atualizadas}</strong>{' '}
              {resultado.atualizadas === 1 ? 'unidade atualizada' : 'unidades atualizadas'}
            </li>
            <li>
              <strong>{resultado.indisponiveis}</strong>{' '}
              {resultado.indisponiveis === 1 ? 'marcada indisponível' : 'marcadas indisponíveis'}
            </li>
            {resultado.corrigidas > 0 && (
              <li>
                <strong>{resultado.corrigidas}</strong>{' '}
                {resultado.corrigidas === 1 ? 'corrigida à mão' : 'corrigidas à mão'}
              </li>
            )}
            {resultado.torres !== null && (
              <li>
                <strong>{resultado.torres}</strong> {resultado.torres === 1 ? 'torre gravada' : 'torres gravadas'}
              </li>
            )}
            {(resultado.fluxosCriados > 0 || resultado.fluxosAtualizados > 0) && (
              <li>
                <strong>{resultado.fluxosCriados + resultado.fluxosAtualizados}</strong>{' '}
                {resultado.fluxosCriados + resultado.fluxosAtualizados === 1
                  ? 'condição de pagamento gravada'
                  : 'condições de pagamento gravadas'}
                {resultado.fluxosAtualizados > 0 && ` (${resultado.fluxosAtualizados} já existiam e foram atualizadas)`}
              </li>
            )}
          </ul>
          <p className="importacao__nota">A lista de unidades da tela já está atualizada.</p>
        </section>
      )}
    </Modal>
  )
}

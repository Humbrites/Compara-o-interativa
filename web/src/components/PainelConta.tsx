import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

import {
  acesso,
  DESCRICAO_DO_PAPEL,
  NOME_DO_PAPEL,
  type DadosDaConta,
  type Papel,
  type SessaoAberta,
  type Sessao,
} from '../lib/acesso'
import { mensagemDoErro } from '../lib/http'
import { usePodeEditar } from '../lib/permissao'
import { BASE_M2_PADRAO, type BaseM2 } from '../lib/unidades'
import type { LogoDaConta, PosicaoLogo } from '../types'
import { conferirSenha } from './TelaAcesso'
import { Icone } from './Icones'
import { Campo, Carregando, Estado, Modal, Selo } from './ui'

/**
 * Conta, equipe e seguranca — as telas de quem JA entrou.
 *
 * O plano nao e editavel aqui de proposito: quem vende define contrato. A tela
 * mostra o que foi contratado e quanto dele esta em uso, e o caminho para
 * mudar e falar com o suporte.
 */

interface Props {
  sessao: Sessao
  aoMudarSessao: (sessao: Sessao) => void
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
  onFechar: () => void
  abaInicial?: 'equipe' | 'seguranca'
}

export function PainelConta({ sessao, aoMudarSessao, avisar, onFechar, abaInicial = 'equipe' }: Props) {
  const [aba, setAba] = useState<'equipe' | 'seguranca'>(abaInicial)

  return (
    <Modal
      titulo="Conta e acesso"
      subtitulo={sessao.conta?.nome}
      largo
      onFechar={onFechar}
      cabecalhoExtra={
        <div className="abas" role="tablist">
          {/* O master nao pertence a conta nenhuma: para ele so existe a
              propria seguranca. */}
          {sessao.conta && (
            <button
              type="button"
              role="tab"
              aria-selected={aba === 'equipe'}
              className={`aba${aba === 'equipe' ? ' aba--ativa' : ''}`}
              onClick={() => setAba('equipe')}
            >
              <Icone nome="equipe" tamanho={15} />
              Conta e equipe
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'seguranca'}
            className={`aba${aba === 'seguranca' ? ' aba--ativa' : ''}`}
            onClick={() => setAba('seguranca')}
          >
            <Icone nome="escudo" tamanho={15} />
            Minha segurança
          </button>
        </div>
      }
    >
      {aba === 'equipe' && sessao.conta ? (
        <AbaEquipe sessao={sessao} aoMudarSessao={aoMudarSessao} avisar={avisar} />
      ) : (
        <AbaSeguranca sessao={sessao} aoMudarSessao={aoMudarSessao} avisar={avisar} />
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Copiar link                                                         */
/* ------------------------------------------------------------------ */

/**
 * Sem servidor de e-mail, o link e entregue pelo administrador. O caminho
 * curto (`/convite/xxx`) vira endereco completo aqui, porque e ele que a
 * pessoa vai colar no WhatsApp.
 */
function LinkParaCopiar({ caminho, rotulo }: { caminho: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false)
  const url = `${window.location.origin}${caminho}`

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Sem permissao de area de transferencia (http sem localhost, por
      // exemplo): seleciona o texto para o usuario copiar na mao.
      const campo = document.getElementById('link-gerado') as HTMLInputElement | null
      campo?.select()
      return
    }
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2200)
  }

  return (
    <div className="link-gerado">
      <div className="link-gerado__rotulo">{rotulo}</div>
      <div className="link-gerado__linha">
        <input id="link-gerado" className="entrada" value={url} readOnly onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn--secundario" onClick={() => void copiar()}>
          <Icone nome={copiado ? 'check' : 'copiar'} tamanho={15} />
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="link-gerado__dica">
        Mande este link para a pessoa pelo canal que você já usa. Ele vale uma vez só.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Aba: conta e equipe                                                 */
/* ------------------------------------------------------------------ */

function AbaEquipe({
  sessao,
  aoMudarSessao,
  avisar,
}: {
  sessao: Sessao
  aoMudarSessao: (sessao: Sessao) => void
  avisar: Props['avisar']
}) {
  const [dados, setDados] = useState<DadosDaConta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [convidando, setConvidando] = useState(false)
  const [linkGerado, setLinkGerado] = useState<{ caminho: string; rotulo: string } | null>(null)

  const carregar = useCallback(async () => {
    try {
      setDados(await acesso.conta())
      setErro(null)
    } catch (falha) {
      setErro(mensagemDoErro(falha, 'Não foi possível carregar a conta'))
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (erro) return <Estado icone="alerta" variante="erro" titulo="Falha ao carregar" texto={erro} />
  if (!dados) return <Carregando texto="Carregando a conta…" />

  const podeGerir = dados.podeGerirEquipe
  const ehDono = sessao.usuario.papel === 'dono'
  const { assentos, plano } = dados
  const cheio = assentos.disponiveis !== null && assentos.disponiveis <= 0

  async function agir(acao: () => Promise<unknown>, mensagem: string) {
    try {
      await acao()
      await carregar()
      avisar(mensagem)
    } catch (falha) {
      avisar(mensagemDoErro(falha), 'erro')
    }
  }

  return (
    <div className="conta">
      {/* --- Plano ------------------------------------------------------ */}
      <section className="conta__bloco">
        <div className="plano">
          <div className="plano__topo">
            <div>
              <div className="plano__rotulo">Plano contratado</div>
              <div className="plano__nome">{plano.nome}</div>
            </div>
            <SeloStatus status={dados.status} />
          </div>

          <div className="plano__medida">
            <div className="plano__numeros">
              <strong>{assentos.ocupados}</strong>
              <span>de {assentos.limite === null ? 'sem limite' : assentos.limite} usuários</span>
            </div>
            {assentos.limite !== null && (
              <div className="plano__barra" role="img" aria-label={`${assentos.ocupados} de ${assentos.limite}`}>
                <div
                  className={`plano__preenchido${cheio ? ' plano__preenchido--cheio' : ''}`}
                  style={{ width: `${Math.min(100, (assentos.ocupados / assentos.limite) * 100)}%` }}
                />
              </div>
            )}
            <div className="plano__detalhe">
              {assentos.usuarios} em uso
              {assentos.convitesPendentes > 0 && ` · ${assentos.convitesPendentes} convite(s) aguardando`}
              {assentos.disponiveis !== null && assentos.disponiveis > 0 && ` · ${assentos.disponiveis} livre(s)`}
            </div>
          </div>

          {dados.expiraEm && (
            <div className="plano__vencimento">
              {dados.somenteLeitura ? 'Venceu em ' : 'Válido até '}
              {formatarData(dados.expiraEm)}
              {/* O ciclo explica a data: "vence em 30/09" sozinho não diz se a
                  próxima cobrança é daqui a um mês ou a um ano. */}
              <span className="plano__ciclo"> · renovação {dados.cobranca.nome.toLowerCase()}</span>
            </div>
          )}

          <p className="plano__nota">
            Para mudar de plano ou ajustar o número de usuários, fale com o suporte — o contrato não é editado por
            aqui.
          </p>
        </div>

        {dados.somenteLeitura && (
          <div className="aviso-faixa" role="status">
            <Icone nome="alerta" tamanho={15} />
            <span>
              A conta está suspensa: os dados seguem disponíveis para consulta, mas não é possível gravar nada.
            </span>
          </div>
        )}
      </section>

      {/* --- Dados da conta --------------------------------------------- */}
      {ehDono && <DadosDaContaForm dados={dados} aoSalvar={carregar} aoMudarSessao={aoMudarSessao} avisar={avisar} sessao={sessao} />}

      {/* --- Marca no material impresso ---------------------------------- */}
      {ehDono && <LogoDaContaForm dados={dados} sessao={sessao} aoMudarSessao={aoMudarSessao} avisar={avisar} />}

      {/* --- Equipe ------------------------------------------------------ */}
      <section className="conta__bloco">
        <div className="conta__titulo-linha">
          <h3 className="conta__titulo">Pessoas com acesso</h3>
          {podeGerir && !convidando && (
            <button
              type="button"
              className="btn btn--secundario btn--pequeno"
              onClick={() => {
                setConvidando(true)
                setLinkGerado(null)
              }}
              disabled={cheio || dados.somenteLeitura}
              title={cheio ? 'O plano está completo' : undefined}
            >
              <Icone nome="mais" tamanho={14} />
              Convidar
            </button>
          )}
        </div>

        {cheio && podeGerir && (
          <p className="conta__aviso">
            O plano está completo. Para convidar mais alguém, remova um usuário, cancele um convite pendente ou fale
            com o suporte para aumentar o plano.
          </p>
        )}

        {convidando && (
          <FormConvite
            aoCancelar={() => setConvidando(false)}
            podeCriarDono={ehDono}
            aoConvidar={async (dados_) => {
              const resposta = await acesso.convidar(dados_)
              setConvidando(false)
              setLinkGerado({ caminho: resposta.link, rotulo: `Convite de ${resposta.convite.email}` })
              await carregar()
              avisar('Convite criado — agora é só mandar o link')
            }}
          />
        )}

        {linkGerado && <LinkParaCopiar caminho={linkGerado.caminho} rotulo={linkGerado.rotulo} />}

        <ul className="pessoas">
          {dados.usuarios.map((pessoa) => (
            <li key={pessoa.id} className={`pessoa${pessoa.ativo ? '' : ' pessoa--inativa'}`}>
              <div className="pessoa__identidade">
                <div className="pessoa__nome">
                  {pessoa.nome}
                  {pessoa.id === sessao.usuario.id && <span className="pessoa__voce">você</span>}
                </div>
                <div className="pessoa__email">
                  {pessoa.email}
                  {pessoa.usuario && ` · @${pessoa.usuario}`}
                </div>
                <div className="pessoa__selos">
                  <Selo cor={pessoa.papel === 'dono' ? 'roxo' : pessoa.papel === 'admin' ? 'azul' : 'cinza'}>
                    {NOME_DO_PAPEL[pessoa.papel]}
                  </Selo>
                  {pessoa.totpAtivo && (
                    <Selo cor="verde" icone="escudo">
                      2FA
                    </Selo>
                  )}
                  {!pessoa.senhaDefinida && <Selo cor="ambar">Senha não definida</Selo>}
                  {!pessoa.ativo && <Selo cor="contorno">Sem acesso</Selo>}
                </div>
              </div>

              {podeGerir && pessoa.id !== sessao.usuario.id && !dados.somenteLeitura && (
                <div className="pessoa__acoes">
                  <select
                    className="filtros__select"
                    value={pessoa.papel}
                    disabled={pessoa.papel === 'dono' && !ehDono}
                    onChange={(e) =>
                      void agir(
                        () => acesso.salvarUsuario(pessoa.id, { papel: e.target.value as Papel }),
                        'Papel atualizado',
                      )
                    }
                    aria-label={`Papel de ${pessoa.nome}`}
                  >
                    {(['membro', 'admin', 'dono'] as Papel[]).map((papel) => (
                      <option key={papel} value={papel} disabled={papel === 'dono' && !ehDono}>
                        {NOME_DO_PAPEL[papel]}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="btn btn--fantasma btn--pequeno"
                    onClick={() =>
                      void agir(async () => {
                        const { link } = await acesso.linkDeSenha(pessoa.id)
                        setLinkGerado({ caminho: link, rotulo: `Link de senha de ${pessoa.nome}` })
                      }, 'Link gerado')
                    }
                  >
                    <Icone nome="chave" tamanho={14} />
                    Link de senha
                  </button>

                  <button
                    type="button"
                    className={`btn btn--pequeno ${pessoa.ativo ? 'btn--perigo' : 'btn--secundario'}`}
                    onClick={() =>
                      void agir(
                        () => acesso.salvarUsuario(pessoa.id, { ativo: !pessoa.ativo }),
                        pessoa.ativo ? 'Acesso removido' : 'Acesso devolvido',
                      )
                    }
                  >
                    {pessoa.ativo ? 'Remover acesso' : 'Devolver acesso'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* --- Convites pendentes ------------------------------------------ */}
      {dados.convites.length > 0 && (
        <section className="conta__bloco">
          <h3 className="conta__titulo">Convites aguardando resposta</h3>
          <p className="conta__aviso">Cada convite em aberto ocupa uma vaga do plano até ser aceito ou vencer.</p>

          <ul className="pessoas">
            {dados.convites.map((convite) => (
              <li key={convite.id} className="pessoa">
                <div className="pessoa__identidade">
                  {/* Sem nome informado, o e-mail vira o título — repeti-lo
                      logo abaixo só ocupa espaço dizendo a mesma coisa. */}
                  <div className="pessoa__nome">{convite.nome || convite.email}</div>
                  {convite.nome && <div className="pessoa__email">{convite.email}</div>}
                  <div className="pessoa__selos">
                    <Selo cor="cinza">{NOME_DO_PAPEL[convite.papel]}</Selo>
                    <Selo cor="ambar">Vence {formatarData(convite.expira_em)}</Selo>
                  </div>
                </div>

                {podeGerir && !dados.somenteLeitura && (
                  <div className="pessoa__acoes">
                    <button
                      type="button"
                      className="btn btn--perigo btn--pequeno"
                      onClick={() => void agir(() => acesso.cancelarConvite(convite.id), 'Convite cancelado')}
                    >
                      Cancelar convite
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function SeloStatus({ status }: { status: DadosDaConta['status'] }) {
  const mapa = {
    ativa: { cor: 'verde', texto: 'Ativa' },
    trial: { cor: 'azul', texto: 'Período de teste' },
    suspensa: { cor: 'ambar', texto: 'Suspensa' },
    cancelada: { cor: 'contorno', texto: 'Encerrada' },
  } as const

  const { cor, texto } = mapa[status] ?? mapa.ativa
  return <Selo cor={cor}>{texto}</Selo>
}

function formatarData(iso: string) {
  // Vem do SQLite em UTC ('YYYY-MM-DD HH:MM:SS'); o "Z" evita o navegador ler
  // como hora local e mostrar o dia anterior.
  const data = new Date(`${iso.replace(' ', 'T')}Z`)
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleDateString('pt-BR')
}

/* --- Dados da conta (nome e exigencia de 2FA) ------------------------- */

function DadosDaContaForm({
  dados,
  sessao,
  aoSalvar,
  aoMudarSessao,
  avisar,
}: {
  dados: DadosDaConta
  sessao: Sessao
  aoSalvar: () => Promise<void>
  aoMudarSessao: (sessao: Sessao) => void
  avisar: Props['avisar']
}) {
  const podeEditar = usePodeEditar()
  const [nome, setNome] = useState(dados.nome)
  const [salvando, setSalvando] = useState(false)

  const mudou = nome.trim() !== dados.nome
  const baseAtual: BaseM2 = dados.base_m2 ?? BASE_M2_PADRAO
  const travado = salvando || dados.somenteLeitura || !podeEditar

  async function salvar(extra?: { exigir2fa?: boolean; base_m2?: BaseM2 }) {
    setSalvando(true)
    try {
      const conta = await acesso.salvarConta({
        nome: nome.trim() || dados.nome,
        ...extra,
      })
      aoMudarSessao({ ...sessao, conta, precisaConfigurar2fa: conta.exigir2fa && !sessao.usuario.totpAtivo })
      await aoSalvar()
      avisar('Conta atualizada')
    } catch (falha) {
      avisar(mensagemDoErro(falha), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="conta__bloco">
      <h3 className="conta__titulo">Dados da conta</h3>

      <div className="conta__linha-form">
        <Campo rotulo="Nome da conta" className="col-inteira">
          <input className="entrada" value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        {mudou && (
          <button type="button" className="btn btn--primario btn--pequeno" disabled={salvando} onClick={() => void salvar()}>
            Salvar nome
          </button>
        )}
      </div>

      <div className="opcao">
        <label className="opcao__marcar">
          <input
            type="checkbox"
            checked={dados.exigir2fa}
            disabled={travado}
            onChange={(e) => void salvar({ exigir2fa: e.target.checked })}
          />
          <span>Exigir verificação em duas etapas de todo mundo</span>
        </label>
        <span className="campo__dica opcao__dica">
          quem ainda não configurou entra, mas só consegue mexer na própria segurança até configurar
        </span>
      </div>

      {/* A metodologia do m² é uma escolha da imobiliária, e ela vale para a
          base inteira: comparar um prédio pela privativa e o vizinho pela
          total elegeria vencedor pela metodologia, não pelo preço. */}
      <div className="conta__linha-form">
        <Campo rotulo="Cálculo do valor do m²" dica="vale para todos os empreendimentos">
          <select
            className="entrada"
            value={baseAtual}
            disabled={travado}
            onChange={(e) => void salvar({ base_m2: e.target.value as BaseM2 })}
          >
            <option value="privativa">Área privativa (padrão)</option>
            <option value="total">Área total</option>
          </select>
        </Campo>
      </div>
      <p className="conta__aviso">
        Trocar refaz o valor do m² de todos os empreendimentos da conta. A área comum nunca entra nessa conta.
      </p>
    </section>
  )
}

/* --- Logo da conta no material impresso -------------------------------- */

/** Espelha o que a API aceita — recusar aqui evita uma ida ao servidor. */
const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp']
const TAMANHO_MAX_LOGO = 2 * 1024 * 1024

const NOME_DA_POSICAO: Record<PosicaoLogo, string> = {
  'marca-dagua': 'Marca d’água (centro, atrás do conteúdo)',
  topo: 'Cabeçalho, ao lado do título',
  rodape: 'Rodapé, no fim da folha',
}

/**
 * A opacidade natural de cada posicao. A marca d'agua nasce bem apagada
 * (ela passa POR BAIXO do texto e nao pode disputar com o numero que o
 * cliente esta lendo); no cabecalho e no rodape a logo aparece inteira.
 */
const OPACIDADE_NATURAL: Record<PosicaoLogo, number> = {
  'marca-dagua': 0.08,
  topo: 1,
  rodape: 1,
}

interface ConfigDaLogo {
  posicao: PosicaoLogo
  tamanho: number
  opacidade: number
}

/**
 * A marca da imobiliaria nas exportacoes em PDF.
 *
 * So o dono mexe aqui — e a identidade da empresa no material que TODA a
 * equipe entrega ao cliente. Sem logo enviada nada aparece no papel e a folha
 * continua exatamente como sempre foi.
 */
function LogoDaContaForm({
  dados,
  sessao,
  aoMudarSessao,
  avisar,
}: {
  dados: DadosDaConta
  sessao: Sessao
  aoMudarSessao: (sessao: Sessao) => void
  avisar: Props['avisar']
}) {
  const podeEditar = usePodeEditar()
  const entrada = useRef<HTMLInputElement>(null)

  const [logo, setLogo] = useState<LogoDaConta>(dados.logo)
  const [config, setConfig] = useState<ConfigDaLogo>({
    posicao: dados.logo.posicao,
    tamanho: dados.logo.tamanho,
    opacidade: dados.logo.opacidade,
  })
  const [ocupado, setOcupado] = useState(false)
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)

  const travado = ocupado || dados.somenteLeitura || !podeEditar
  const mudou =
    config.posicao !== logo.posicao || config.tamanho !== logo.tamanho || config.opacidade !== logo.opacidade

  /** A sessão carrega a logo para as exportações — ela precisa saber na hora. */
  function aplicar(nova: LogoDaConta) {
    setLogo(nova)
    setConfig({ posicao: nova.posicao, tamanho: nova.tamanho, opacidade: nova.opacidade })
    aoMudarSessao({ ...sessao, conta: sessao.conta ? { ...sessao.conta, logo: nova } : sessao.conta })
  }

  async function enviar(arquivo: File) {
    if (!TIPOS_LOGO.includes(arquivo.type)) {
      avisar(`${arquivo.name}: a logo precisa ser PNG, JPG ou WEBP`, 'erro')
      return
    }
    if (arquivo.size > TAMANHO_MAX_LOGO) {
      avisar(`${arquivo.name}: a logo precisa ter até 2 MB`, 'erro')
      return
    }

    setOcupado(true)
    try {
      const resposta = await acesso.enviarLogo(arquivo)
      aplicar(resposta.logo)
      avisar('Logo atualizada')
    } catch (falha) {
      avisar(mensagemDoErro(falha, 'Não foi possível enviar a logo'), 'erro')
    } finally {
      setOcupado(false)
    }
  }

  async function remover() {
    setConfirmandoRemocao(false)
    setOcupado(true)
    try {
      aplicar((await acesso.removerLogo()).logo)
      avisar('Logo removida')
    } catch (falha) {
      avisar(mensagemDoErro(falha, 'Não foi possível remover a logo'), 'erro')
    } finally {
      setOcupado(false)
    }
  }

  async function salvarAjustes() {
    setOcupado(true)
    try {
      const conta = await acesso.salvarConta({
        logo_posicao: config.posicao,
        logo_tamanho: config.tamanho,
        logo_opacidade: config.opacidade,
      })
      aplicar(conta.logo)
      avisar('Ajustes da logo salvos')
    } catch (falha) {
      avisar(mensagemDoErro(falha), 'erro')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="conta__bloco">
      <div className="conta__titulo-linha">
        <h3 className="conta__titulo">Logo no material impresso</h3>
        {!travado && (
          <div className="conta__acoes">
            <button
              type="button"
              className="btn btn--secundario btn--pequeno"
              onClick={() => entrada.current?.click()}
            >
              <Icone nome={ocupado ? 'spinner' : 'imagem'} tamanho={14} className={ocupado ? 'girando' : undefined} />
              {logo.url ? 'Trocar logo' : 'Enviar logo'}
            </button>
            {logo.url && !confirmandoRemocao && (
              <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setConfirmandoRemocao(true)}>
                Remover
              </button>
            )}
          </div>
        )}
      </div>

      <input
        ref={entrada}
        type="file"
        accept={TIPOS_LOGO.join(',')}
        hidden
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0]
          // Permite escolher o mesmo arquivo de novo depois de remover.
          evento.target.value = ''
          if (arquivo) void enviar(arquivo)
        }}
      />

      {confirmandoRemocao && (
        <div className="aviso-faixa aviso-faixa--acao" role="status">
          <Icone nome="alerta" tamanho={15} />
          <span>Remover a logo? As próximas exportações saem sem marca nenhuma.</span>
          <button type="button" className="btn btn--perigo btn--pequeno" onClick={() => void remover()}>
            Remover
          </button>
          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setConfirmandoRemocao(false)}>
            Cancelar
          </button>
        </div>
      )}

      {!logo.url ? (
        <p className="conta__aviso">
          Nenhuma logo enviada — as exportações em PDF saem sem marca. PNG, JPG ou WEBP, até 2 MB. Fundo transparente
          (PNG) fica melhor como marca d’água.
        </p>
      ) : (
        <>
          <div className="logo-conta">
            {/* Como a folha vai sair: a marca d’água é apagada de propósito, e
                ver isso aqui evita o susto de imprimir e achar que falhou. */}
            <div className="logo-conta__papel">
              <div className="logo-conta__previa" aria-hidden="true">
                {config.posicao === 'marca-dagua' && (
                  <img
                    className="logo-conta__marca"
                    src={logo.url}
                    alt=""
                    style={{ width: `${config.tamanho}%`, opacity: config.opacidade }}
                  />
                )}
                <div className="logo-conta__folha">
                  {config.posicao === 'topo' && (
                    <img
                      className="logo-conta__no-topo"
                      src={logo.url}
                      alt=""
                      style={{ width: `${config.tamanho}%`, opacity: config.opacidade }}
                    />
                  )}
                  <span className="logo-conta__titulo-falso" />
                  <span className="logo-conta__linha-falsa" />
                  <span className="logo-conta__linha-falsa" />
                  <span className="logo-conta__linha-falsa logo-conta__linha-falsa--curta" />
                  {config.posicao === 'rodape' && (
                    <img
                      className="logo-conta__no-rodape"
                      src={logo.url}
                      alt=""
                      style={{ width: `${config.tamanho}%`, opacity: config.opacidade }}
                    />
                  )}
                </div>
              </div>
              <span className="campo__dica">prévia da folha impressa</span>
            </div>

            <div className="logo-conta__ajustes">
              <Campo rotulo="Posição na folha">
                <select
                  className="entrada"
                  value={config.posicao}
                  disabled={travado}
                  onChange={(evento) => {
                    const posicao = evento.target.value as PosicaoLogo
                    // Trocar de posição leva junto a opacidade natural dela —
                    // uma logo de cabeçalho com opacidade de marca d’água some.
                    setConfig((atual) => ({ ...atual, posicao, opacidade: OPACIDADE_NATURAL[posicao] }))
                  }}
                >
                  {(Object.keys(NOME_DA_POSICAO) as PosicaoLogo[]).map((posicao) => (
                    <option key={posicao} value={posicao}>
                      {NOME_DA_POSICAO[posicao]}
                    </option>
                  ))}
                </select>
              </Campo>

              <Campo rotulo="Tamanho" dica={`${config.tamanho}% da largura`}>
                <input
                  className="controle-faixa"
                  type="range"
                  min={10}
                  max={60}
                  step={1}
                  value={config.tamanho}
                  disabled={travado}
                  onChange={(evento) => setConfig((atual) => ({ ...atual, tamanho: Number(evento.target.value) }))}
                />
              </Campo>

              <Campo rotulo="Opacidade" dica={`${Math.round(config.opacidade * 100)}%`}>
                <input
                  className="controle-faixa"
                  type="range"
                  min={2}
                  max={100}
                  step={1}
                  value={Math.round(config.opacidade * 100)}
                  disabled={travado}
                  onChange={(evento) =>
                    setConfig((atual) => ({ ...atual, opacidade: Number(evento.target.value) / 100 }))
                  }
                />
              </Campo>

              {mudou && (
                <button
                  type="button"
                  className="btn btn--primario btn--pequeno"
                  disabled={travado}
                  onClick={() => void salvarAjustes()}
                >
                  Salvar ajustes
                </button>
              )}
            </div>
          </div>

          <p className="conta__aviso">
            A marca d’água passa por baixo do conteúdo e nunca cobre o que o cliente está lendo. Vale para todas as
            exportações em PDF da conta.
          </p>
        </>
      )}
    </section>
  )
}

/* --- Formulario de convite -------------------------------------------- */

function FormConvite({
  aoConvidar,
  aoCancelar,
  podeCriarDono,
}: {
  aoConvidar: (dados: { email: string; nome?: string; papel: Papel }) => Promise<void>
  aoCancelar: () => void
  podeCriarDono: boolean
}) {
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState<Papel>('membro')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setOcupado(true)
    try {
      await aoConvidar({ email: email.trim(), nome: nome.trim() || undefined, papel })
    } catch (falha) {
      setErro(mensagemDoErro(falha, 'Não foi possível convidar'))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form className="form-convite" onSubmit={enviar} noValidate>
      <div className="grade grade--2">
        <Campo rotulo="E-mail" obrigatorio>
          <input
            className="entrada"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@empresa.com.br"
            autoFocus
            required
          />
        </Campo>
        <Campo rotulo="Nome" dica="opcional">
          <input className="entrada" value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
      </div>

      <Campo rotulo="Papel" dica={DESCRICAO_DO_PAPEL[papel]}>
        <select className="filtros__select" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
          <option value="membro">{NOME_DO_PAPEL.membro}</option>
          <option value="admin">{NOME_DO_PAPEL.admin}</option>
          {podeCriarDono && <option value="dono">{NOME_DO_PAPEL.dono}</option>}
        </select>
      </Campo>

      {erro && (
        <div className="acesso__erro" role="alert">
          <Icone nome="alerta" tamanho={15} />
          <span>{erro}</span>
        </div>
      )}

      <div className="form-convite__acoes">
        <button type="button" className="btn btn--fantasma" onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primario" disabled={ocupado || !email.trim()}>
          {ocupado ? 'Criando…' : 'Gerar convite'}
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Aba: minha seguranca                                                */
/* ------------------------------------------------------------------ */

function AbaSeguranca({
  sessao,
  aoMudarSessao,
  avisar,
}: {
  sessao: Sessao
  aoMudarSessao: (sessao: Sessao) => void
  avisar: Props['avisar']
}) {
  const [sessoes, setSessoes] = useState<SessaoAberta[] | null>(null)
  const [codigosRestantes, setCodigosRestantes] = useState(0)

  const carregarSessoes = useCallback(async () => {
    try {
      const dados = await acesso.sessoes()
      setSessoes(dados.sessoes)
      setCodigosRestantes(dados.codigosRecuperacao)
    } catch {
      setSessoes([])
    }
  }, [])

  useEffect(() => {
    void carregarSessoes()
  }, [carregarSessoes])

  return (
    <div className="conta">
      {sessao.precisaConfigurar2fa && (
        <div className="aviso-faixa aviso-faixa--forte" role="status">
          <Icone nome="escudo" tamanho={15} />
          <span>
            <strong>{sessao.conta?.nome}</strong> exige verificação em duas etapas. Configure abaixo para voltar a usar
            o sistema.
          </span>
        </div>
      )}

      <BlocoPerfil sessao={sessao} aoMudarSessao={aoMudarSessao} avisar={avisar} />

      <Bloco2fa sessao={sessao} aoMudarSessao={aoMudarSessao} avisar={avisar} aoMudar={carregarSessoes} codigosRestantes={codigosRestantes} />

      <BlocoSenha avisar={avisar} aoTrocar={carregarSessoes} />

      <section className="conta__bloco">
        <div className="conta__titulo-linha">
          <h3 className="conta__titulo">Onde você está conectado</h3>
          {sessoes && sessoes.length > 1 && (
            <button
              type="button"
              className="btn btn--secundario btn--pequeno"
              onClick={async () => {
                try {
                  await acesso.encerrarOutrasSessoes()
                  await carregarSessoes()
                  avisar('As outras sessões foram encerradas')
                } catch (falha) {
                  avisar(mensagemDoErro(falha), 'erro')
                }
              }}
            >
              Encerrar as outras
            </button>
          )}
        </div>

        {!sessoes ? (
          <Carregando texto="Carregando sessões…" />
        ) : (
          <ul className="sessoes">
            {sessoes.map((item, indice) => (
              <li key={indice} className="sessao-item">
                <div>
                  <div className="sessao-item__agente">{descreverAgente(item.agente)}</div>
                  <div className="sessao-item__meta">
                    {item.ip || 'sem IP'} · último uso {formatarDataHora(item.ultimoUso)}
                  </div>
                </div>
                {item.atual && <Selo cor="verde">Esta sessão</Selo>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** O user-agent inteiro não diz nada a ninguém; o navegador e o sistema, sim. */
function descreverAgente(agente: string | null) {
  if (!agente) return 'Dispositivo desconhecido'

  const navegador = /Edg\//.test(agente)
    ? 'Edge'
    : /Chrome\//.test(agente)
      ? 'Chrome'
      : /Safari\//.test(agente)
        ? 'Safari'
        : /Firefox\//.test(agente)
          ? 'Firefox'
          : 'Navegador'

  const sistema = /Windows/.test(agente)
    ? 'Windows'
    : /Android/.test(agente)
      ? 'Android'
      : /iPhone|iPad/.test(agente)
        ? 'iOS'
        : /Mac OS/.test(agente)
          ? 'Mac'
          : /Linux/.test(agente)
            ? 'Linux'
            : ''

  return sistema ? `${navegador} no ${sistema}` : navegador
}

function formatarDataHora(iso: string) {
  const data = new Date(`${iso.replace(' ', 'T')}Z`)
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/* --- Meu perfil (o que vai impresso ao lado do nome) ------------------- */

/**
 * O cadastro do proprio usuario.
 *
 * O CRECI mora aqui — e nao na equipe — porque quem responde pelo registro e
 * o corretor, nao quem administra a conta. Ele sai no PDF entregue ao cliente
 * EXATAMENTE como digitado: cada conselho regional escreve o numero de um
 * jeito, e "arrumar" o formato deixaria a folha diferente do carimbo.
 */
function BlocoPerfil({
  sessao,
  aoMudarSessao,
  avisar,
}: {
  sessao: Sessao
  aoMudarSessao: (sessao: Sessao) => void
  avisar: Props['avisar']
}) {
  const podeEditar = usePodeEditar()
  const gravado = sessao.usuario.creci ?? ''
  const [creci, setCreci] = useState(gravado)
  const [salvando, setSalvando] = useState(false)

  const mudou = creci.trim() !== gravado

  async function salvar() {
    setSalvando(true)
    try {
      const usuario = await acesso.salvarPerfil({ creci })
      setCreci(usuario.creci ?? '')
      aoMudarSessao({ ...sessao, usuario })
      avisar('Perfil atualizado')
    } catch (falha) {
      avisar(mensagemDoErro(falha), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="conta__bloco">
      <h3 className="conta__titulo">Meu perfil</h3>

      <div className="conta__linha-form">
        <Campo rotulo="Nome">
          <input className="entrada" value={sessao.usuario.nome} readOnly disabled />
        </Campo>
        <Campo rotulo="CRECI" dica="opcional, vai impresso nas exportações">
          <input
            className="entrada"
            value={creci}
            disabled={salvando || !podeEditar}
            onChange={(evento) => setCreci(evento.target.value)}
            placeholder="CRECI/RS 00000-F"
            maxLength={60}
          />
        </Campo>
        {mudou && podeEditar && (
          <button type="button" className="btn btn--primario btn--pequeno" disabled={salvando} onClick={() => void salvar()}>
            Salvar CRECI
          </button>
        )}
      </div>

      <p className="conta__aviso">
        O CRECI aparece no cabeçalho dos PDFs, ao lado do seu nome, exatamente como você digitar. Deixe em branco para
        não citá-lo.
      </p>
    </section>
  )
}

/* --- 2FA -------------------------------------------------------------- */

function Bloco2fa({
  sessao,
  aoMudarSessao,
  avisar,
  aoMudar,
  codigosRestantes,
}: {
  sessao: Sessao
  aoMudarSessao: (sessao: Sessao) => void
  avisar: Props['avisar']
  aoMudar: () => Promise<void>
  codigosRestantes: number
}) {
  const [configurando, setConfigurando] = useState<{ qr: string; segredo: string } | null>(null)
  const [codigo, setCodigo] = useState('')
  const [codigos, setCodigos] = useState<string[] | null>(null)
  const [senha, setSenha] = useState('')
  const [pedindoSenha, setPedindoSenha] = useState<'desativar' | 'codigos' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const ativo = sessao.usuario.totpAtivo

  async function iniciar() {
    setErro(null)
    setOcupado(true)
    try {
      const dados = await acesso.iniciar2fa()
      setConfigurando({ qr: dados.qr, segredo: dados.segredo })
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  async function ativar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setOcupado(true)
    try {
      const { codigos: gerados } = await acesso.ativar2fa(codigo.trim())
      setCodigos(gerados)
      setConfigurando(null)
      setCodigo('')
      aoMudarSessao({
        ...sessao,
        usuario: { ...sessao.usuario, totpAtivo: true },
        precisaConfigurar2fa: false,
      })
      await aoMudar()
      avisar('Verificação em duas etapas ativada')
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarComSenha(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setOcupado(true)
    try {
      if (pedindoSenha === 'desativar') {
        await acesso.desativar2fa(senha)
        aoMudarSessao({ ...sessao, usuario: { ...sessao.usuario, totpAtivo: false } })
        setCodigos(null)
        avisar('Verificação em duas etapas desativada')
      } else {
        const { codigos: gerados } = await acesso.novosCodigos(senha)
        setCodigos(gerados)
        avisar('Códigos novos gerados — os antigos não valem mais')
      }
      setPedindoSenha(null)
      setSenha('')
      await aoMudar()
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="conta__bloco">
      <div className="conta__titulo-linha">
        <h3 className="conta__titulo">Verificação em duas etapas</h3>
        {ativo && (
          <Selo cor="verde" icone="escudo">
            Ativa
          </Selo>
        )}
      </div>

      {codigos && <CodigosRecuperacao codigos={codigos} aoFechar={() => setCodigos(null)} />}

      {!ativo && !configurando && (
        <>
          <p className="conta__aviso">
            Além da senha, entrar passa a pedir um código de 6 dígitos gerado no seu celular. Funciona sem internet e
            sem SMS — basta um aplicativo autenticador (Google Authenticator, Authy, 1Password).
          </p>
          {erro && <Alerta texto={erro} />}
          <button type="button" className="btn btn--primario" disabled={ocupado} onClick={() => void iniciar()}>
            <Icone nome="escudo" tamanho={15} />
            Ativar verificação
          </button>
        </>
      )}

      {configurando && (
        <form className="dois-fatores" onSubmit={ativar}>
          <ol className="dois-fatores__passos">
            <li>Abra o aplicativo autenticador no celular.</li>
            <li>Aponte para o QR Code abaixo (ou digite o código manual).</li>
            <li>Digite aqui o número de 6 dígitos que aparecer.</li>
          </ol>

          <div className="dois-fatores__grade">
            {/* O SVG vem pronto da API — nenhuma biblioteca de QR no navegador. */}
            <div className="dois-fatores__qr" dangerouslySetInnerHTML={{ __html: configurando.qr }} />

            <div className="dois-fatores__manual">
              <div className="dois-fatores__rotulo">Não consegue ler o QR? Digite este código:</div>
              <code className="dois-fatores__segredo">{configurando.segredo.match(/.{1,4}/g)?.join(' ')}</code>
            </div>
          </div>

          <Campo rotulo="Código do aplicativo">
            <input
              className="entrada entrada--codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              autoFocus
              required
            />
          </Campo>

          {erro && <Alerta texto={erro} />}

          <div className="form-convite__acoes">
            <button type="button" className="btn btn--fantasma" onClick={() => setConfigurando(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primario" disabled={ocupado || codigo.length !== 6}>
              Confirmar e ativar
            </button>
          </div>
        </form>
      )}

      {ativo && !pedindoSenha && (
        <>
          <p className="conta__aviso">
            Você tem <strong>{codigosRestantes}</strong> código(s) de recuperação sem uso. Eles são a única saída se
            você perder o celular — guarde fora dele.
          </p>
          <div className="conta__acoes">
            <button type="button" className="btn btn--secundario btn--pequeno" onClick={() => setPedindoSenha('codigos')}>
              Gerar códigos novos
            </button>
            {!sessao.conta?.exigir2fa && (
              <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setPedindoSenha('desativar')}>
                Desativar
              </button>
            )}
          </div>
        </>
      )}

      {pedindoSenha && (
        <form className="form-convite" onSubmit={confirmarComSenha}>
          <Campo
            rotulo="Confirme sua senha"
            dica={pedindoSenha === 'desativar' ? 'para desativar a verificação' : 'para gerar códigos novos'}
          >
            <input
              className="entrada"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </Campo>

          {erro && <Alerta texto={erro} />}

          <div className="form-convite__acoes">
            <button
              type="button"
              className="btn btn--fantasma"
              onClick={() => {
                setPedindoSenha(null)
                setSenha('')
                setErro(null)
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={`btn ${pedindoSenha === 'desativar' ? 'btn--perigo' : 'btn--primario'}`}
              disabled={ocupado || !senha}
            >
              {pedindoSenha === 'desativar' ? 'Desativar' : 'Gerar novos'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function CodigosRecuperacao({ codigos, aoFechar }: { codigos: string[]; aoFechar: () => void }) {
  return (
    <div className="recuperacao">
      <div className="recuperacao__topo">
        <Icone nome="chave" tamanho={16} />
        <strong>Guarde estes códigos agora</strong>
      </div>
      <p className="recuperacao__texto">
        Cada um serve uma vez, no lugar do código do aplicativo. Esta é a única vez que eles aparecem — nem nós
        conseguimos mostrá-los de novo.
      </p>

      <ul className="recuperacao__lista">
        {codigos.map((codigo) => (
          <li key={codigo}>
            <code>{codigo}</code>
          </li>
        ))}
      </ul>

      <div className="recuperacao__acoes">
        <button
          type="button"
          className="btn btn--secundario btn--pequeno"
          onClick={() => void navigator.clipboard.writeText(codigos.join('\n')).catch(() => {})}
        >
          <Icone nome="copiar" tamanho={14} />
          Copiar todos
        </button>
        <button type="button" className="btn btn--fantasma btn--pequeno" onClick={aoFechar}>
          Já guardei
        </button>
      </div>
    </div>
  )
}

/* --- Senha ------------------------------------------------------------ */

function BlocoSenha({ avisar, aoTrocar }: { avisar: Props['avisar']; aoTrocar: () => Promise<void> }) {
  const [aberto, setAberto] = useState(false)
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [tocado, setTocado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const problema = tocado ? conferirSenha(nova) : null

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setTocado(true)

    const invalida = conferirSenha(nova)
    if (invalida) {
      setErro(invalida)
      return
    }

    setErro(null)
    setOcupado(true)
    try {
      const { aviso } = await acesso.trocarSenha(atual, nova)
      setAberto(false)
      setAtual('')
      setNova('')
      setTocado(false)
      await aoTrocar()
      avisar(aviso)
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="conta__bloco">
      <div className="conta__titulo-linha">
        <h3 className="conta__titulo">Senha</h3>
        {!aberto && (
          <button type="button" className="btn btn--secundario btn--pequeno" onClick={() => setAberto(true)}>
            Trocar senha
          </button>
        )}
      </div>

      {!aberto ? (
        <p className="conta__aviso">Trocar a senha encerra as suas outras sessões abertas.</p>
      ) : (
        <form className="form-convite" onSubmit={enviar} noValidate>
          <Campo rotulo="Senha atual">
            <input
              className="entrada"
              type="password"
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </Campo>

          <Campo
            rotulo="Nova senha"
            dica="Pelo menos 10 caracteres, misturando letras e números"
            erro={problema ?? undefined}
          >
            <input
              className={`entrada${problema ? ' entrada--erro' : ''}`}
              type="password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              onBlur={() => setTocado(true)}
              autoComplete="new-password"
              required
            />
          </Campo>

          {erro && <Alerta texto={erro} />}

          <div className="form-convite__acoes">
            <button
              type="button"
              className="btn btn--fantasma"
              onClick={() => {
                setAberto(false)
                setErro(null)
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn--primario" disabled={ocupado}>
              Salvar senha
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function Alerta({ texto }: { texto: string }): ReactNode {
  return (
    <div className="acesso__erro" role="alert">
      <Icone nome="alerta" tamanho={15} />
      <span>{texto}</span>
    </div>
  )
}

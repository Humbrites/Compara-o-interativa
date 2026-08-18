import {
  createContext,
  useCallback,
  useContext,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

import type { Apresentacao } from '../lib/exportarSimulacao'
import type { LogoDaConta } from '../types'
import { Icone } from './Icones'
import { Campo, Modal } from './ui'

/**
 * Os dados que abrem TODA folha impressa: para quem ela foi feita e quem a
 * assina.
 *
 * Um componente so, usado pelos cinco pontos de exportacao (simulador, CUB,
 * comparativo A × B, unidades lado a lado e fluxos). Copiar o modal em cada
 * tela faria a quinta ficar para tras na primeira mudanca de texto — e o
 * corretor veria uma pergunta diferente dependendo de onde clicou.
 *
 * Nada aqui e obrigatorio: quem so quer o papel com os numeros confirma
 * direto, e as linhas em branco simplesmente nao aparecem no PDF.
 */
export interface DadosDaApresentacao {
  cliente: string
  corretor: string
  creci: string
}

interface Contexto {
  /** O que o modal abre preenchido: o ultimo usado, ou o cadastro de quem entrou. */
  dados: DadosDaApresentacao
  lembrar: (dados: DadosDaApresentacao) => void
  logo: LogoDaConta | null
}

/**
 * Fora do provedor (um teste, uma tela nova) o modal continua funcionando:
 * abre em branco e sem marca, que e como o sistema imprimia antes.
 */
const ContextoApresentacao = createContext<Contexto>({
  dados: { cliente: '', corretor: '', creci: '' },
  lembrar: () => {},
  logo: null,
})

export function ProvedorApresentacao({
  corretor,
  creci,
  logo,
  children,
}: {
  corretor: string
  creci: string | null
  logo: LogoDaConta | null
  children: ReactNode
}) {
  /**
   * Os ultimos valores usados ficam SO na memoria desta aba. Gravar o nome do
   * cliente no navegador seria guardar dado de terceiro num computador que
   * costuma ser compartilhado no balcao da imobiliaria — e ninguem pediu isso.
   *
   * Enquanto ninguem exportou nada, o modal segue o cadastro: assim o CRECI
   * recem-salvo no perfil ja aparece na proxima exportacao.
   */
  const [lembrados, setLembrados] = useState<DadosDaApresentacao | null>(null)
  const dados = lembrados ?? { cliente: '', corretor, creci: creci ?? '' }

  return (
    <ContextoApresentacao.Provider value={{ dados, lembrar: setLembrados, logo }}>
      {children}
    </ContextoApresentacao.Provider>
  )
}

/** A logo como a folha de impressao precisa dela: endereco completo e configuracao. */
function marcaParaOPapel(logo: LogoDaConta | null): Apresentacao['logo'] {
  if (!logo?.url) return null

  return {
    // A folha abre em outra aba (about:blank): endereco relativo dependeria da
    // base herdada, e um caminho completo funciona em qualquer navegador.
    url: logo.url.startsWith('/') ? `${window.location.origin}${logo.url}` : logo.url,
    posicao: logo.posicao,
    tamanho: logo.tamanho,
    opacidade: logo.opacidade,
  }
}

/** Campo em branco vira `null`: no papel ele some, em vez de virar rotulo vazio. */
function paraApresentacao(dados: DadosDaApresentacao, logo: LogoDaConta | null): Apresentacao {
  return {
    cliente: dados.cliente.trim() || null,
    corretor: dados.corretor.trim() || null,
    creci: dados.creci.trim() || null,
    logo: marcaParaOPapel(logo),
  }
}

/**
 * Pergunta os dados e so entao exporta.
 *
 * A tela chama `pedir(...)` no clique do "Exportar PDF" e renderiza `modal`
 * junto do resto — duas linhas em cada ponto de exportacao, sem repetir
 * formulario nenhum.
 */
export function usePedirApresentacao() {
  const { dados, lembrar, logo } = useContext(ContextoApresentacao)
  const [pendente, setPendente] = useState<{ gerar: (apresentacao: Apresentacao) => void } | null>(null)

  const pedir = useCallback((gerar: (apresentacao: Apresentacao) => void) => setPendente({ gerar }), [])

  const modal = pendente ? (
    <FormDadosApresentacao
      inicial={dados}
      temLogo={Boolean(logo?.url)}
      onCancelar={() => setPendente(null)}
      onConfirmar={(escolhidos) => {
        lembrar(escolhidos)
        setPendente(null)
        pendente.gerar(paraApresentacao(escolhidos, logo))
      }}
    />
  ) : null

  return { pedir, modal }
}

const ID_FORM = 'form-dados-apresentacao'

function FormDadosApresentacao({
  inicial,
  temLogo,
  onCancelar,
  onConfirmar,
}: {
  inicial: DadosDaApresentacao
  temLogo: boolean
  onCancelar: () => void
  onConfirmar: (dados: DadosDaApresentacao) => void
}) {
  const [dados, setDados] = useState<DadosDaApresentacao>(inicial)

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    onConfirmar(dados)
  }

  const mudar = (campo: keyof DadosDaApresentacao) => (valor: string) =>
    setDados((atual) => ({ ...atual, [campo]: valor }))

  return (
    <Modal
      titulo="Dados da apresentação"
      subtitulo="Entram no cabeçalho do PDF. Tudo é opcional — o que ficar em branco não aparece no papel."
      onFechar={onCancelar}
      rodape={
        <>
          <button type="button" className="btn btn--fantasma" onClick={onCancelar}>
            Cancelar
          </button>
          <div className="direita">
            <button type="submit" form={ID_FORM} className="btn btn--primario">
              <Icone nome="lista" tamanho={15} />
              Gerar PDF
            </button>
          </div>
        </>
      }
    >
      {/* O botao mora no rodape do modal, fora deste form: `form=` e o que
          liga os dois e faz o Enter enviar de dentro de qualquer campo. */}
      <form id={ID_FORM} onSubmit={enviar}>
        <div className="grade grade--2">
          <Campo rotulo="Nome do cliente" dica="opcional" className="col-inteira">
            <input
              className="entrada"
              value={dados.cliente}
              onChange={(evento) => mudar('cliente')(evento.target.value)}
              placeholder="Para quem é esta apresentação"
              autoFocus
            />
          </Campo>

          <Campo rotulo="Corretor" dica="quem assina">
            <input
              className="entrada"
              value={dados.corretor}
              onChange={(evento) => mudar('corretor')(evento.target.value)}
            />
          </Campo>

          {/* Sai no papel exatamente como digitado — sem máscara: cada
              conselho regional escreve o número de um jeito. */}
          <Campo rotulo="CRECI" dica="como aparece no papel">
            <input
              className="entrada"
              value={dados.creci}
              onChange={(evento) => mudar('creci')(evento.target.value)}
              placeholder="CRECI/RS 00000-F"
            />
          </Campo>
        </div>

        <p className="campo__dica">
          <Icone nome="info" tamanho={12} />{' '}
          {temLogo
            ? 'A logo da conta entra na folha conforme a configuração em Conta e equipe.'
            : 'Envie a logo da imobiliária em Conta e equipe para ela aparecer nas exportações.'}
        </p>
      </form>
    </Modal>
  )
}

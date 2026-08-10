/**
 * TOTP (RFC 6238) — o segundo fator por aplicativo autenticador.
 *
 * Escolhido por eliminacao: SMS precisa de operadora e e-mail precisa de
 * servidor de e-mail, e o projeto nao tem nenhum dos dois. O aplicativo
 * (Google Authenticator, Authy, 1Password) funciona offline, no celular do
 * proprio usuario, sem custo nem terceiro no caminho.
 *
 * Sao poucas linhas de HMAC — e o algoritmo tem vetores de teste oficiais, que
 * e o que `testes/totp.test.js` confere.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const DIGITOS = 6
export const PASSO_SEGUNDOS = 30

/**
 * Aceita o codigo do passo anterior e do seguinte. Relogio de celular
 * atrasado alguns segundos e a causa numero um de "meu codigo nao funciona";
 * uma janela de 30s para cada lado resolve isso sem abrir a porta (ainda sao
 * 3 codigos de 1 milhao, e a tentativa e limitada).
 */
export const JANELA_PADRAO = 1

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Base32 sem "=" no fim: e o formato que os aplicativos esperam na URL. */
export function paraBase32(buffer) {
  let bits = 0
  let acumulado = 0
  let saida = ''

  for (const byte of buffer) {
    acumulado = (acumulado << 8) | byte
    bits += 8
    while (bits >= 5) {
      saida += ALFABETO_BASE32[(acumulado >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) saida += ALFABETO_BASE32[(acumulado << (5 - bits)) & 31]

  return saida
}

export function deBase32(texto) {
  const limpo = String(texto).toUpperCase().replace(/[^A-Z2-7]/g, '')
  const bytes = []
  let bits = 0
  let acumulado = 0

  for (const caractere of limpo) {
    const valor = ALFABETO_BASE32.indexOf(caractere)
    if (valor < 0) continue
    acumulado = (acumulado << 5) | valor
    bits += 5
    if (bits >= 8) {
      bytes.push((acumulado >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return Buffer.from(bytes)
}

/** 20 bytes = o tamanho do bloco do SHA-1, o que a RFC 4226 recomenda. */
export function gerarSegredo() {
  return paraBase32(randomBytes(20))
}

/** O contador de 8 bytes, big-endian, que a RFC manda passar ao HMAC. */
function contadorEmBytes(passo) {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(passo))
  return buffer
}

/** Codigo de um passo especifico — a peca que os vetores da RFC exercitam. */
export function codigoDoPasso(segredoBase32, passo, digitos = DIGITOS) {
  const hmac = createHmac('sha1', deBase32(segredoBase32)).update(contadorEmBytes(passo)).digest()

  // Truncagem dinamica: os 4 bits finais dizem de onde ler os 4 bytes do
  // codigo. E assim que a RFC evita usar sempre o mesmo pedaco do hash.
  const inicio = hmac[hmac.length - 1] & 0x0f
  const trecho =
    ((hmac[inicio] & 0x7f) << 24) | (hmac[inicio + 1] << 16) | (hmac[inicio + 2] << 8) | hmac[inicio + 3]

  return String(trecho % 10 ** digitos).padStart(digitos, '0')
}

export function passoAtual(agoraMs = Date.now()) {
  return Math.floor(agoraMs / 1000 / PASSO_SEGUNDOS)
}

export function gerarCodigo(segredoBase32, agoraMs = Date.now()) {
  return codigoDoPasso(segredoBase32, passoAtual(agoraMs))
}

/**
 * Confere o codigo digitado e devolve o passo que casou (ou `null`).
 *
 * Devolver o passo — em vez de um booleano — e o que permite ao chamador
 * gravar `usuarios.totp_passo` e recusar o MESMO codigo na segunda vez: dentro
 * dos 30 segundos de vida dele, quem espiou a tela entraria junto.
 */
export function conferirCodigo(segredoBase32, codigo, { agoraMs = Date.now(), janela = JANELA_PADRAO, ultimoPasso = null } = {}) {
  const digitado = String(codigo ?? '').replace(/\D/g, '')
  if (digitado.length !== DIGITOS) return null

  const atual = passoAtual(agoraMs)

  for (let deslocamento = -janela; deslocamento <= janela; deslocamento += 1) {
    const passo = atual + deslocamento
    if (ultimoPasso !== null && passo <= ultimoPasso) continue

    const esperado = Buffer.from(codigoDoPasso(segredoBase32, passo))
    const recebido = Buffer.from(digitado)
    if (esperado.length === recebido.length && timingSafeEqual(esperado, recebido)) return passo
  }

  return null
}

/**
 * A URL que vira o QR Code. O rotulo aparece na lista do aplicativo, entao
 * carrega o nome do sistema e o e-mail — quem usa o autenticador para varios
 * servicos precisa distinguir qual e qual.
 */
export function urlOtpauth({ segredo, email, emissor = 'Compara Interativa' }) {
  const rotulo = encodeURIComponent(`${emissor}:${email}`)
  const parametros = new URLSearchParams({
    secret: segredo,
    issuer: emissor,
    algorithm: 'SHA1',
    digits: String(DIGITOS),
    period: String(PASSO_SEGUNDOS),
  })
  return `otpauth://totp/${rotulo}?${parametros}`
}

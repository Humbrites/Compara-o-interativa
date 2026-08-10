/**
 * Vetores oficiais da RFC 6238 (apendice B) — a unica forma honesta de dizer
 * que a nossa implementacao de TOTP e a mesma que o Google Authenticator usa.
 * Se um destes falhar, o cliente nao consegue entrar e nao ha log que explique.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { codigoDoPasso, conferirCodigo, deBase32, paraBase32, passoAtual, urlOtpauth } from '../src/totp.js'

// "12345678901234567890" em ASCII, que e o segredo do apendice B para SHA-1.
const SEGREDO = paraBase32(Buffer.from('12345678901234567890', 'ascii'))

test('base32 casa com o segredo da RFC', () => {
  assert.equal(SEGREDO, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  assert.equal(deBase32(SEGREDO).toString('ascii'), '12345678901234567890')
})

test('vetores de teste da RFC 6238 (SHA-1, 8 digitos)', () => {
  const casos = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ]

  for (const [segundos, esperado] of casos) {
    const passo = Math.floor(segundos / 30)
    assert.equal(codigoDoPasso(SEGREDO, passo, 8), esperado, `t=${segundos}`)
  }
})

test('codigo de 6 digitos e o mesmo numero truncado', () => {
  const passo = Math.floor(59 / 30)
  assert.equal(codigoDoPasso(SEGREDO, passo, 6), '287082')
})

test('aceita o codigo do passo vizinho (relogio do celular atrasado)', () => {
  const agoraMs = 1234567890 * 1000
  const atual = passoAtual(agoraMs)

  for (const deslocamento of [-1, 0, 1]) {
    const codigo = codigoDoPasso(SEGREDO, atual + deslocamento)
    assert.equal(conferirCodigo(SEGREDO, codigo, { agoraMs }), atual + deslocamento, `deslocamento ${deslocamento}`)
  }

  // Fora da janela nao entra.
  assert.equal(conferirCodigo(SEGREDO, codigoDoPasso(SEGREDO, atual + 2), { agoraMs }), null)
})

test('o mesmo codigo nao entra duas vezes', () => {
  const agoraMs = 1234567890 * 1000
  const atual = passoAtual(agoraMs)
  const codigo = codigoDoPasso(SEGREDO, atual)

  assert.equal(conferirCodigo(SEGREDO, codigo, { agoraMs }), atual)
  // Gravado o passo, a repeticao dentro dos mesmos 30s e recusada: quem viu a
  // tela por cima do ombro nao entra junto.
  assert.equal(conferirCodigo(SEGREDO, codigo, { agoraMs, ultimoPasso: atual }), null)
})

test('codigo malformado nao passa', () => {
  const agoraMs = Date.now()
  for (const invalido of ['', '12345', '1234567', 'abcdef', null, undefined]) {
    assert.equal(conferirCodigo(SEGREDO, invalido, { agoraMs }), null, String(invalido))
  }
})

test('url do otpauth carrega emissor e e-mail', () => {
  const url = urlOtpauth({ segredo: SEGREDO, email: 'ana@exemplo.com.br' })
  assert.match(url, /^otpauth:\/\/totp\//)
  assert.ok(url.includes(encodeURIComponent('Compara Interativa:ana@exemplo.com.br')))
  assert.ok(url.includes(`secret=${SEGREDO}`))
  assert.ok(url.includes('period=30'))
})

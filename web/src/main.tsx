import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Quem manda na tela agora e o portao: sem sessao, ninguem chega no App.
import { Portao } from './Portao'
import './styles/app.css'
import './styles/modulos.css'
import './styles/acesso.css'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Elemento #root nao encontrado')

createRoot(raiz).render(
  <StrictMode>
    <Portao />
  </StrictMode>,
)

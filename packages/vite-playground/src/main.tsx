import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'
import './index.css'
import studio from '@theatre/studio'
import {getProject} from '@theatre/core'

const sheet = getProject('id2').sheet('sheeet')
studio.initialize()
studio.ui.restore()

sheet.object('obj', {x: 1, y: 2, color: 'e'})

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root') as HTMLElement,
)

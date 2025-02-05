import type {IExtension} from '@theatre/studio'
import studio from '@theatre/studio'
import '@theatre/core'
import {extensionButton} from '../../shared/utils/useExtensionButton'

const ext1: IExtension = {
  id: '@theatre/hello-world-extension',
  toolbars: {},
  panes: [],
}

studio.initialize({usePersistentStorage: false})

let currentStep = -1

extensionButton(
  'Forward',
  () => {
    if (currentStep < steps.length - 1) {
      currentStep++
      steps[currentStep]()
    }
  },
  '>',
)

const steps = [
  function step0() {
    studio.extend(
      {
        ...ext1,
        panes: [
          {
            class: 'pane1',
            mount: ({paneId, node}) => {
              const el = document.createElement('div')
              el.innerHTML = 'pane1-config1'
              node.appendChild(el)
              return function unmount() {
                node.removeChild(el)
                console.log('unmount pane1-config1')
              }
            },
          },
        ],
      },

      {__experimental_reconfigure: true},
    )
    studio.createPane('pane1')
  },
  function step1() {
    studio.extend(
      {
        ...ext1,
        panes: [
          {
            class: 'pane1',
            mount: ({paneId, node}) => {
              const el = document.createElement('div')
              el.innerHTML = 'pane1-config2'
              node.appendChild(el)
              return function unmount() {
                node.removeChild(el)
                console.log('unmount pane1-config2')
              }
            },
          },
        ],
      },

      {__experimental_reconfigure: true},
    )
  },
  function step2() {
    studio.extend(
      {
        ...ext1,
        panes: [],
      },

      {__experimental_reconfigure: true},
    )
  },
  function step3() {
    steps[1]()
  },
]

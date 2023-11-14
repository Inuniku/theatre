import {createContext, useContext} from 'react'

export type GraphEditorContextProps = {
  unitSpaceToScaledSpaceMultiplier: number
  graphEditorVerticalSpace: number
  minY: number
  maxY: number
}

const context = createContext<GraphEditorContextProps>({
  unitSpaceToScaledSpaceMultiplier: 1,
  graphEditorVerticalSpace: 0.01,
  minY: -0.1,
  maxY: 0.1,
})
export const GraphEditorContextProvider = context.Provider

export const useGraphEditorContext = () => useContext(context)

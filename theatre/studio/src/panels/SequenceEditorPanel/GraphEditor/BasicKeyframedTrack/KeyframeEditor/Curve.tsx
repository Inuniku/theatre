import {valueInProp} from '@theatre/shared/propTypes/utils'
import getStudio from '@theatre/studio/getStudio'
import useContextMenu from '@theatre/studio/uiComponents/simpleContextMenu/useContextMenu'
import useRefAndState from '@theatre/studio/utils/useRefAndState'
import React from 'react'
import styled from 'styled-components'
import type KeyframeEditor from './KeyframeEditor'
import {useGraphEditorContext} from '@theatre/studio\panels\SequenceEditorPanel\GraphEditor\GraphEditorContext'

const SVGPath = styled.path`
  stroke-width: 2;
  stroke: var(--main-color);
  fill: none;
  vector-effect: non-scaling-stroke;
`

type IProps = Parameters<typeof KeyframeEditor>[0]

// for keyframe.type === 'hold'
const pathForHoldType = `M 0 0 L 1 0 L 1 1`

const Curve: React.FC<IProps> = (props) => {
  const {index, trackData} = props
  const cur = trackData.keyframes[index]
  const next = trackData.keyframes[index + 1]

  const [nodeRef, node] = useRefAndState<SVGPathElement | null>(null)

  const [contextMenu] = useConnectorContextMenu(node, props)

  const curValue = props.isScalar
    ? (valueInProp(cur.value, props.propConfig) as number)
    : 0
  const nextValue = props.isScalar
    ? (valueInProp(next.value, props.propConfig) as number)
    : 1
  const leftYInExtremumSpace = props.extremumSpace.fromValueSpace(curValue)
  const rightYInExtremumSpace = props.extremumSpace.fromValueSpace(nextValue)

  const t1InExtremumSpace = props.extremumSpace.fromValueSpace(
    curValue + cur.tangents[3],
  )
  const t2InExtremumSpace = props.extremumSpace.fromValueSpace(
    nextValue + next.tangents[1],
  )

  const {unitSpaceToScaledSpaceMultiplier, graphEditorVerticalSpace} =
    useGraphEditorContext()

  const x1 = cur.position * unitSpaceToScaledSpaceMultiplier
  const x2 = next.position * unitSpaceToScaledSpaceMultiplier
  const y1 = graphEditorVerticalSpace * (1 - leftYInExtremumSpace)
  const y2 = graphEditorVerticalSpace * (1 - rightYInExtremumSpace)

  const h1x = x1 + cur.tangents[2] * unitSpaceToScaledSpaceMultiplier
  const h2x = x2 + next.tangents[0] * unitSpaceToScaledSpaceMultiplier

  const h1y = graphEditorVerticalSpace * (1 - t1InExtremumSpace)
  const h2y = graphEditorVerticalSpace * (1 - t2InExtremumSpace)

  const pathD = `M ${x1} ${y1} C ${h1x} ${h1y} ${h2x} ${h2y} ${x2} ${y2}`

  return (
    <>
      <SVGPath
        ref={nodeRef}
        d={!cur.type || cur.type === 'bezier' ? pathD : pathForHoldType}
      />
      {contextMenu}
    </>
  )
}

export default Curve

/**
 * Assuming a box such that: `{x: 0, y: 0, width: 1px, height: 1px}`
 * and given the desired coordinates of:
 * `{x: xInUnitSpace, y: yInExtremumSpace, width: widthInUnitSpace, height: heightInExtremumSpace}`,
 * `transformBox()` returns a CSS transform that transforms the box into its right dimensions
 * in the GraphEditor space.
 */
export function transformBox(
  xInUnitSpace: number,
  yInExtremumSpace: number,
  widthInUnitSpace: number,
  heightInExtremumSpace: number,
): string {
  const translateX = `calc(var(--unitSpaceToScaledSpaceMultiplier) * ${xInUnitSpace}px)`

  const translateY = `calc((var(--graphEditorVerticalSpace) - var(--graphEditorVerticalSpace) * ${yInExtremumSpace}) * 1px)`

  if (widthInUnitSpace === 0) {
    widthInUnitSpace = 0.0001
  }

  const scaleX = `calc(var(--unitSpaceToScaledSpaceMultiplier) * ${widthInUnitSpace})`

  if (heightInExtremumSpace === 0) {
    heightInExtremumSpace = 0.001
  }

  const scaleY = `calc(var(--graphEditorVerticalSpace) * ${
    heightInExtremumSpace * -1
  })`

  return `translate(${translateX}, ${translateY}) scale(${scaleX}, ${scaleY})`
}

function useConnectorContextMenu(node: SVGElement | null, props: IProps) {
  const {index, trackData} = props
  const cur = trackData.keyframes[index]
  const next = trackData.keyframes[index + 1]

  return useContextMenu(node, {
    menuItems: () => {
      return [
        {
          label: 'Delete',
          callback: () => {
            getStudio()!.transaction(({stateEditors}) => {
              const {deleteKeyframes} =
                stateEditors.coreByProject.historic.sheetsById.sequence

              deleteKeyframes({
                ...props.sheetObject.address,
                trackId: props.trackId,
                keyframeIds: [cur.id, next.id],
              })
            })
          },
        },
      ]
    },
  })
}

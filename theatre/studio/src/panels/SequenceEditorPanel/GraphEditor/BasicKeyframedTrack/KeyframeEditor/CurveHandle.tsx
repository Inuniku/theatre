import getStudio from '@theatre/studio/getStudio'
import type {CommitOrDiscard} from '@theatre/studio/StudioStore/StudioStore'
import useContextMenu from '@theatre/studio/uiComponents/simpleContextMenu/useContextMenu'
import useDrag from '@theatre/studio/uiComponents/useDrag'
import useRefAndState from '@theatre/studio/utils/useRefAndState'
import {val} from '@theatre/dataverse'
import React, {useMemo, useRef} from 'react'
import styled from 'styled-components'
import {transformBox} from './Curve'
import type KeyframeEditor from './KeyframeEditor'
import {pointerEventsAutoInNormalMode} from '@theatre/studio/css'

export const dotSize = 6

const Circle = styled.circle<{type: string}>`
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
  fill: ${({type}) => (type === 'auto' ? 'none' : 'var(--main-color)')};
  stroke: var(--main-color);
  r: 2px;
  pointer-events: none;
`

const HitZone = styled.circle`
  stroke-width: 6px;
  vector-effect: non-scaling-stroke;
  r: 6px;
  fill: transparent;
  cursor: move;
  ${pointerEventsAutoInNormalMode};
  &:hover {
  }
  &:hover + ${Circle} {
    r: 6px;
  }
`

const Line = styled.path`
  stroke-width: 1;
  stroke: var(--main-color);
  /* stroke: gray; */
  fill: none;
  vector-effect: non-scaling-stroke;
`

type Which = 'left' | 'right'

type IProps = Parameters<typeof KeyframeEditor>[0] & {which: Which}

const CurveHandle: React.FC<IProps> = (props) => {
  const [ref, node] = useRefAndState<SVGCircleElement | null>(null)

  const {index, trackData} = props
  const cur = trackData.keyframes[index]
  const next = trackData.keyframes[index + 1]

  const [contextMenu] = useOurContextMenu(node, props)
  useOurDrags(node, props)

  const posTangent = props.which === 'left' ? cur.tangents[2] : next.tangents[0]

  const posInUnitSpace =
    (props.which === 'left' ? cur.position : next.position) + posTangent

  const curValue = props.isScalar ? (cur.value as number) : 0
  const nextValue = props.isScalar ? (next.value as number) : 1

  const valTangent = props.which === 'left' ? cur.tangents[3] : next.tangents[1]

  const value = (props.which === 'left' ? curValue : nextValue) + valTangent

  const valInExtremumSpace = props.extremumSpace.fromValueSpace(value)

  const heightInExtremumSpace =
    valInExtremumSpace -
    props.extremumSpace.fromValueSpace(
      props.which === 'left' ? curValue : nextValue,
    )

  const lineTransform = transformBox(
    props.which === 'left' ? cur.position : next.position,
    props.extremumSpace.fromValueSpace(
      props.which === 'left' ? curValue : nextValue,
    ),
    posInUnitSpace - (props.which === 'left' ? cur.position : next.position),
    heightInExtremumSpace,
  )

  return (
    <g>
      <HitZone
        ref={ref}
        style={{
          // @ts-ignore
          cx: `calc(var(--unitSpaceToScaledSpaceMultiplier) * ${posInUnitSpace} * 1px)`,
          cy: `calc((var(--graphEditorVerticalSpace) - var(--graphEditorVerticalSpace) * ${valInExtremumSpace}) * 1px)`,
        }}
      ></HitZone>
      <Circle
        style={{
          // @ts-ignore
          cx: `calc(var(--unitSpaceToScaledSpaceMultiplier) * ${posInUnitSpace} * 1px)`,
          cy: `calc((var(--graphEditorVerticalSpace) - var(--graphEditorVerticalSpace) * ${valInExtremumSpace}) * 1px)`,
        }}
      ></Circle>
      <Line
        d="M 0 0 L 1 1"
        style={{
          transform: lineTransform,
        }}
      />
      {contextMenu}
    </g>
  )
}

export default CurveHandle

function useOurDrags(node: SVGCircleElement | null, props: IProps): void {
  const propsRef = useRef(props)
  propsRef.current = props

  const handlers = useMemo<Parameters<typeof useDrag>[1]>(() => {
    return {
      debugName: 'CurveHandler/useOurDrags',
      lockCSSCursorTo: 'move',
      onDragStart() {
        let tempTransaction: CommitOrDiscard | undefined

        const propsAtStartOfDrag = propsRef.current

        const scaledToUnitSpace = val(
          propsAtStartOfDrag.layoutP.scaledSpace.toUnitSpace,
        )
        const verticalToExtremumSpace = val(
          propsAtStartOfDrag.layoutP.graphEditorVerticalSpace.toExtremumSpace,
        )

        const unlockExtremums = propsAtStartOfDrag.extremumSpace.lock()

        return {
          onDrag(dxInScaledSpace, dy) {
            if (tempTransaction) {
              tempTransaction.discard()
              tempTransaction = undefined
            }

            const {index, trackData} = propsAtStartOfDrag
            const cur = trackData.keyframes[index]
            const next = trackData.keyframes[index + 1]

            const dPosInUnitSpace = scaledToUnitSpace(dxInScaledSpace)
            let dPosInKeyframeDiffSpace =
              dPosInUnitSpace / (next.position - cur.position)

            const dyInVerticalSpace = -dy
            const dYInExtremumSpace = verticalToExtremumSpace(dyInVerticalSpace)

            const dYInValueSpace =
              propsAtStartOfDrag.extremumSpace.deltaToValueSpace(
                dYInExtremumSpace,
              )

            console.log(
              dPosInUnitSpace,
              dYInValueSpace,
              cur.tangents[0],
              cur.tangents[1],
              cur.tangents[2],
              cur.tangents[3],
            )

            const curValue = props.isScalar ? (cur.value as number) : 0
            const nextValue = props.isScalar ? (next.value as number) : 1
            const dyInKeyframeDiffSpace =
              dYInValueSpace / (nextValue - curValue)

            if (propsAtStartOfDrag.which === 'left') {
              const tangentX = cur.tangents[2] + dPosInUnitSpace
              const tangentY = cur.tangents[3] + dYInValueSpace

              tempTransaction = getStudio()!.tempTransaction(
                ({stateEditors}) => {
                  stateEditors.coreByProject.historic.sheetsById.sequence.replaceKeyframes(
                    {
                      ...propsAtStartOfDrag.sheetObject.address,
                      snappingFunction: (a) => a,
                      trackId: propsAtStartOfDrag.trackId,
                      keyframes: [
                        {
                          ...cur,
                          tangents: [
                            cur.tangents[0],
                            cur.tangents[1],
                            tangentX,
                            tangentY,
                          ],
                        },
                      ],
                    },
                  )
                },
              )
            } else {
              const tangentX = next.tangents[0] + dPosInUnitSpace
              const tangentY = next.tangents[1] + dYInValueSpace

              tempTransaction = getStudio()!.tempTransaction(
                ({stateEditors}) => {
                  stateEditors.coreByProject.historic.sheetsById.sequence.replaceKeyframes(
                    {
                      ...propsAtStartOfDrag.sheetObject.address,
                      trackId: propsAtStartOfDrag.trackId,
                      snappingFunction: (a) => a,
                      keyframes: [
                        {
                          ...next,
                          tangents: [
                            tangentX,
                            tangentY,
                            next.tangents[2],
                            next.tangents[3],
                          ],
                        },
                      ],
                    },
                  )
                },
              )
            }
          },
          onDragEnd(dragHappened) {
            unlockExtremums()
            if (dragHappened) {
              if (tempTransaction) {
                tempTransaction.commit()
              }
            } else {
              if (tempTransaction) {
                tempTransaction.discard()
              }
            }
          },
        }
      },
    }
  }, [])

  useDrag(node, handlers)
}

type Which2 = 'h1' | 'h2'

type IProps2 = Parameters<typeof KeyframeEditor>[0] & {which: Which2}

const CurveHandle2: React.FC<IProps2> = (props) => {
  const [ref, node] = useRefAndState<SVGCircleElement | null>(null)

  const {index, trackData} = props
  const cur = trackData.keyframes[index]

  // const [contextMenu] = useOurContextMenu(node, props)
  useOurDrags2(node, props)

  const posTangent = props.which === 'h1' ? cur.tangents[0] : cur.tangents[2]

  const posInUnitSpace = cur.position + posTangent

  const curValue = props.isScalar ? (cur.value as number) : 0

  const valTangent = props.which === 'h1' ? cur.tangents[1] : cur.tangents[3]

  const value = curValue + valTangent

  const valInExtremumSpace = props.extremumSpace.fromValueSpace(value)

  const heightInExtremumSpace =
    valInExtremumSpace - props.extremumSpace.fromValueSpace(curValue)

  const lineTransform = transformBox(
    cur.position,
    props.extremumSpace.fromValueSpace(curValue),
    posInUnitSpace - cur.position,
    heightInExtremumSpace,
  )

  const type = props.which === 'h1' ? cur.tangentIn : cur.tangentOut
  return (
    <g>
      <HitZone
        ref={ref}
        style={{
          // @ts-ignore
          cx: `calc(var(--unitSpaceToScaledSpaceMultiplier) * ${posInUnitSpace} * 1px)`,
          cy: `calc((var(--graphEditorVerticalSpace) - var(--graphEditorVerticalSpace) * ${valInExtremumSpace}) * 1px)`,
        }}
      ></HitZone>
      <Circle
        style={{
          // @ts-ignore
          cx: `calc(var(--unitSpaceToScaledSpaceMultiplier) * ${posInUnitSpace} * 1px)`,
          cy: `calc((var(--graphEditorVerticalSpace) - var(--graphEditorVerticalSpace) * ${valInExtremumSpace}) * 1px)`,
        }}
        type={type}
      ></Circle>
      <Line
        d="M 0 0 L 1 1"
        style={{
          transform: lineTransform,
        }}
      />
      {/*       {contextMenu} */}
    </g>
  )
}

export {CurveHandle2}

function useOurDrags2(node: SVGCircleElement | null, props: IProps2): void {
  const propsRef = useRef(props)
  propsRef.current = props

  const handlers = useMemo<Parameters<typeof useDrag>[1]>(() => {
    return {
      debugName: 'CurveHandler/useOurDrags',
      lockCSSCursorTo: 'move',
      onDragStart() {
        let tempTransaction: CommitOrDiscard | undefined

        const propsAtStartOfDrag = propsRef.current

        const scaledToUnitSpace = val(
          propsAtStartOfDrag.layoutP.scaledSpace.toUnitSpace,
        )
        const verticalToExtremumSpace = val(
          propsAtStartOfDrag.layoutP.graphEditorVerticalSpace.toExtremumSpace,
        )

        const unlockExtremums = propsAtStartOfDrag.extremumSpace.lock()

        return {
          onDrag(dxInScaledSpace, dy) {
            if (tempTransaction) {
              tempTransaction.discard()
              tempTransaction = undefined
            }

            const {index, trackData} = propsAtStartOfDrag
            const cur = trackData.keyframes[index]

            const dPosInUnitSpace = scaledToUnitSpace(dxInScaledSpace)

            const dyInVerticalSpace = -dy
            const dYInExtremumSpace = verticalToExtremumSpace(dyInVerticalSpace)

            const dYInValueSpace =
              propsAtStartOfDrag.extremumSpace.deltaToValueSpace(
                dYInExtremumSpace,
              )

            const tangents = [
              cur.tangents[0],
              cur.tangents[1],
              cur.tangents[2],
              cur.tangents[3],
            ] as [number, number, number, number]

            const offset = props.which === 'h1' ? 0 : 2

            tangents[offset] = tangents[offset] + dPosInUnitSpace
            tangents[offset + 1] = tangents[offset + 1] + dYInValueSpace

            tempTransaction = getStudio()!.tempTransaction(({stateEditors}) => {
              stateEditors.coreByProject.historic.sheetsById.sequence.updateTangent(
                {
                  ...propsAtStartOfDrag.sheetObject.address,
                  snappingFunction: (a) => a,
                  trackId: propsAtStartOfDrag.trackId,
                  keyFrameIndex: index,
                  tangent: props.which === 'h1' ? 'left' : 'right',
                  position: [tangents[offset], tangents[offset + 1]],
                },
              )
            })
          },
          onDragEnd(dragHappened) {
            unlockExtremums()
            if (dragHappened) {
              if (tempTransaction) {
                tempTransaction.commit()
              }
            } else {
              if (tempTransaction) {
                tempTransaction.discard()
              }
            }
          },
        }
      },
    }
  }, [])

  useDrag(node, handlers)
}

function useOurContextMenu(node: SVGCircleElement | null, props: IProps) {
  return useContextMenu(node, {
    menuItems: () => {
      return [
        {
          label: 'Delete',
          callback: () => {
            getStudio()!.transaction(({stateEditors}) => {
              stateEditors.coreByProject.historic.sheetsById.sequence.deleteKeyframes(
                {
                  ...props.sheetObject.address,
                  keyframeIds: [props.keyframe.id],
                  trackId: props.trackId,
                },
              )
            })
          },
        },
      ]
    },
  })
}

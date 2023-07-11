declare module React {
  export type FCWithChildren<P = {}> = React.FC<PropsWithChildren<P>>
}

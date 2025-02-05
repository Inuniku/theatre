import {privateAPI, setPrivateAPI} from '@theatre/core/privateAPIs'
import Project from '@theatre/core/projects/Project'
import type {ISheet} from '@theatre/core/sheets/TheatreSheet'

import type {ProjectAddress} from '@theatre/sync-server/state/types'
import type {Asset, File} from '@theatre/utils/types'
import type {
  ProjectId,
  SheetId,
  SheetInstanceId,
} from '@theatre/sync-server/state/types/core'
import {validateInstanceId} from '@theatre/utils/sanitizers'
import {validateAndSanitiseSlashedPathOrThrow} from '@theatre/utils/slashedPaths'
import type {$IntentionalAny} from '@theatre/utils/types'
import {notify} from '@theatre/core/coreExports'

/**
 * A project's config object (currently the only point of configuration is the project's state)
 */
export type IProjectConfig = {
  /**
   * The state of the project, as [exported](https://www.theatrejs.com/docs/latest/manual/projects#state) by the studio.
   */
  state?: $IntentionalAny
  assets?: {
    baseUrl?: string
  }
}

// export type IProjectConfigExperiments = {
//   /**
//    * Defaults to using global `console` with style args.
//    *
//    * (TODO: check for browser environment before using style args)
//    */
//   logger?: ITheatreLoggerConfig
//   /**
//    * Defaults:
//    *  * `production` builds: console - error
//    *  * `development` builds: console - error, warning
//    */
//   logging?: ITheatreLoggingConfig
// }

/**
 * A Theatre.js project
 */
export interface IProject {
  readonly type: 'Theatre_Project_PublicAPI'
  /**
   * If `@theatre/studio` is used, this promise would resolve when studio has loaded
   * the state of the project into memory.
   *
   * If `@theatre/studio` is not used, this promise is already resolved.
   */
  readonly ready: Promise<void>
  /**
   * Shows whether the project is ready to be used.
   * Better to use {@link IProject.ready}, which is a promise that would
   * resolve when the project is ready.
   */
  readonly isReady: boolean
  /**
   * The project's address
   */
  readonly address: ProjectAddress

  /**
   * Creates a Sheet under the project
   * @param sheetId - Sheets are identified by their `sheetId`, which must be a string longer than 3 characters
   * @param instanceId - Optionally provide an `instanceId` if you want to create multiple instances of the same Sheet
   * @returns The newly created Sheet
   *
   * **Docs: https://www.theatrejs.com/docs/latest/manual/sheets**
   */
  sheet(sheetId: string, instanceId?: string): ISheet

  /**
   * Returns the URL for an asset.
   *
   * @param asset - The asset to get the URL for
   * @returns The URL for the asset, or `undefined` if the asset is not found
   */
  getAssetUrl(asset: Asset | File): string | undefined
}

export default class TheatreProject implements IProject {
  get type(): 'Theatre_Project_PublicAPI' {
    return 'Theatre_Project_PublicAPI'
  }
  /**
   * @internal
   */
  constructor(id: string, config: IProjectConfig = {}) {
    setPrivateAPI(this, new Project(id as ProjectId, config, this))
  }

  get ready(): Promise<void> {
    return privateAPI(this).ready
  }

  get isReady(): boolean {
    return privateAPI(this).isReady()
  }

  get address(): ProjectAddress {
    return {...privateAPI(this).address}
  }

  getAssetUrl(asset: Asset): string | undefined {
    // probably should put this in project.getAssetUrl but this will do for now
    if (!this.isReady) {
      console.error(
        'Calling `project.getAssetUrl()` before `project.ready` is resolved, will always return `undefined`. ' +
          'Either use `project.ready.then(() => project.getAssetUrl())` or `await project.ready` before calling `project.getAssetUrl()`.',
      )
      return undefined
    }

    return asset.id
      ? privateAPI(this).assetStorage.getAssetUrl(asset.id)
      : undefined
  }

  sheet(sheetId: string, instanceId: string = 'default'): ISheet {
    const sanitizedPath = validateAndSanitiseSlashedPathOrThrow(
      sheetId,
      'project.sheet',
      notify.warning,
    )

    if (process.env.NODE_ENV !== 'production') {
      validateInstanceId(
        instanceId,
        'instanceId in project.sheet(sheetId, instanceId)',
        true,
      )
    }

    return privateAPI(this).getOrCreateSheet(
      sanitizedPath as SheetId,
      instanceId as SheetInstanceId,
    ).publicApi
  }
}

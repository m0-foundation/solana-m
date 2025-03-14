export * from './EarnManager'
export * from './Earner'
export * from './Global'

import { EarnManager } from './EarnManager'
import { Earner } from './Earner'
import { Global } from './Global'

export const accountProviders = { EarnManager, Earner, Global }

import type { Bindings } from '../src/types'

// Augment the Cloudflare namespace so `env` from 'cloudflare:test' is typed
declare global {
  namespace Cloudflare {
    interface Env extends Bindings {}
  }
}

declare module 'vitest' {
  export interface ProvidedContext {
    migrationStatements: string[]
  }
}

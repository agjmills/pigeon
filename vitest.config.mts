import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Split SQL into individual statements, respecting BEGIN...END trigger blocks.
 * Runs in Node context where we have full string processing.
 */
function splitSQL(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let inBlock = false

  for (let line of sql.split('\n')) {
    // Strip inline comments (but not inside strings — good enough for DDL)
    line = line.replace(/\s*--.*$/, '')
    const trimmed = line.trim()
    if (!trimmed) continue
    current += (current ? '\n' : '') + line
    if (/\bBEGIN\b/i.test(trimmed)) inBlock = true
    if (inBlock && /^END;?\s*$/i.test(trimmed)) {
      inBlock = false
      statements.push(current.replace(/;\s*$/, ''))
      current = ''
    } else if (!inBlock && trimmed.endsWith(';')) {
      statements.push(current.replace(/;\s*$/, ''))
      current = ''
    }
  }
  if (current.trim()) {
    const cleaned = current.replace(/;\s*$/, '').trim()
    if (cleaned) statements.push(cleaned)
  }
  return statements
}

function readMigrationStatements(): string[] {
  const dir = path.resolve('migrations')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  const allStatements: string[] = []
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf-8')
    allStatements.push(...splitSQL(sql))
  }
  return allStatements
}

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.test.toml' },
    }),
  ],
  test: {
    provide: {
      migrationStatements: readMigrationStatements(),
    },
  },
})

declare module 'vitest' {
  export interface ProvidedContext {
    migrationStatements: string[]
  }
}

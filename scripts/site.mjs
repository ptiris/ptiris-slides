import { readFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'

export const root = fileURLToPath(new URL('../', import.meta.url))

export async function readSite() {
  const site = JSON.parse(await readFile(resolve(root, 'site.json'), 'utf8'))
  if (typeof site.title !== 'string' || !site.title.trim())
    throw new Error('site.json needs a title.')
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(site.base))
    throw new Error('site.json base must be a path with leading and trailing slashes.')
  if (!Array.isArray(site.decks) || !site.decks.length)
    throw new Error('Register at least one presentation in site.json.')
  const slugs = new Set()
  for (const deck of site.decks) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(deck.slug) || slugs.has(deck.slug))
      throw new Error(`Invalid or duplicate presentation slug: ${deck.slug}`)
    if (typeof deck.title !== 'string' || !deck.title.trim())
      throw new Error(`Missing title for ${deck.slug}.`)
    if (deck.description !== undefined && typeof deck.description !== 'string')
      throw new Error(`Invalid description for ${deck.slug}.`)
    slugs.add(deck.slug)
    await access(resolve(root, 'decks', deck.slug, 'slides.md'))
    await access(resolve(root, 'decks', deck.slug, 'package.json'))
  }
  return site
}

export function runDeck(command, slug, args = []) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
      'run', command, '--workspace', `./decks/${slug}`, '--', ...args,
    ], { cwd: root, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${slug}: ${command} exited with ${signal ?? code}.`))
    })
  })
}

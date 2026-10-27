import { readSite, runDeck } from './site.mjs'

const [command, slug, ...args] = process.argv.slice(2)
const site = await readSite()
if (!['dev', 'export'].includes(command) || !site.decks.some(deck => deck.slug === slug)) {
  console.error(`Usage: npm run ${command ?? 'dev'} -- <slug> [Slidev options]`)
  console.error(`Available presentations: ${site.decks.map(deck => deck.slug).join(', ')}`)
  process.exit(1)
}
await runDeck(command, slug, args)

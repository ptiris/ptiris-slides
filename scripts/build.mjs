import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { root, readSite, runDeck } from './site.mjs'

const site = await readSite()
const output = resolve(root, 'dist')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })

for (const deck of site.decks) {
  await runDeck('build', deck.slug, [
    '--base', `${site.base}${deck.slug}/`,
    '--router-mode', 'hash',
    '--out', resolve(output, deck.slug),
  ])
}

const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])
const entries = site.decks.map(deck => `
    <li><a href="${escape(site.base)}${deck.slug}/">
      <h2>${escape(deck.title)}</h2>
      <p>${escape(deck.description ?? '')}</p>
      <span class="open">查看 Slides <span aria-hidden="true">→</span></span>
    </a></li>`).join('')

await writeFile(resolve(output, 'index.html'), `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(site.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #fafaf8; color: #252829; font-family: system-ui, -apple-system, "PingFang SC", sans-serif; }
    main { max-width: 920px; margin: 0 auto; padding: 92px 32px 48px; }
    h1 { margin: 0 0 64px; font-size: clamp(32px, 6vw, 48px); font-weight: 600; letter-spacing: -.035em; }
    ul { padding: 0; margin: 0; list-style: none; border-top: 1px solid #c8cece; }
    li { border-bottom: 1px solid #c8cece; }
    li a { display: block; padding: 32px 0; color: inherit; text-decoration: none; }
    h2 { margin: 0 0 12px; font-size: 24px; font-weight: 550; }
    p { margin: 0; color: #626a6c; font-size: 16px; line-height: 1.8; }
    .open { display: inline-block; margin-top: 24px; color: #276079; font-size: 15px; }
    a:hover h2, a:focus-visible h2 { color: #276079; }
    a:focus-visible { outline: 2px solid #276079; outline-offset: 8px; }
    footer { margin-top: 48px; font-size: 14px; }
    footer a { color: #626a6c; text-underline-offset: 4px; }
    @media (max-width: 540px) { main { padding: 56px 24px 32px; } h1 { margin-bottom: 40px; } h2 { font-size: 21px; } }
  </style>
</head>
<body>
  <main>
    <header><h1>${escape(site.title)}</h1></header>
    <ul aria-label="报告列表">${entries}
    </ul>
    <footer><a href="https://github.com/ptiris/ptiris-slides">GitHub</a></footer>
  </main>
</body>
</html>
`)
await writeFile(resolve(output, '.nojekyll'), '')
console.log(`Built ${site.decks.length} presentation(s) and the index in dist/.`)

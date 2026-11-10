#!/usr/bin/env node
// motrac-docusign-vendor <dist-map>
//
// Voor een backend die NIET gebundeld wordt en waar de server zelf `npm install`
// draait (zoals mit-rental: dist/ + een uitgeklede package.json). Die server kan
// niet bij een private GitHub-repo, dus de git-afhankelijkheid moet vóór de upload
// in de bundel. Dit script:
//
//   1. kopieert dit pakket (src/, types/, sql/, package.json) naar
//      <dist>/vendor/motrac-docusign/  — niet onder node_modules, want
//      dashboard-deploy.mjs slaat mappen met die naam over;
//   2. zet in <dist>/package.json de afhankelijkheid op
//      "file:./vendor/motrac-docusign", zodat `npm install` op de server hem lokaal
//      vindt. Het pakket heeft zelf geen afhankelijkheden.
//
// Een backend die met esbuild bundelt (zoals mit-contractenbeheer) heeft dit niet
// nodig: de bundel bevat de code al.
//
// Alleen Node-ingebouwde modules.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PAKKET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NAAM = '@motrac/docusign'
const MEE = ['src', 'types', 'sql', 'package.json', 'README.md', 'CHANGELOG.md']

async function main() {
  const doel = process.argv[2]
  if (!doel) {
    console.error('Gebruik: motrac-docusign-vendor <dist-map>')
    process.exit(2)
  }
  const dist = path.resolve(doel)
  const distPackage = path.join(dist, 'package.json')
  let pkg
  try {
    pkg = JSON.parse(await fs.readFile(distPackage, 'utf8'))
  } catch {
    throw new Error(`${distPackage} bestaat niet of is geen JSON. Draai dit na de eigen build-stap die dist/ maakt.`)
  }

  const vendor = path.join(dist, 'vendor', 'motrac-docusign')
  await fs.rm(vendor, { recursive: true, force: true })
  await fs.mkdir(vendor, { recursive: true })
  for (const naam of MEE) {
    const bron = path.join(PAKKET, naam)
    try {
      await fs.cp(bron, path.join(vendor, naam), { recursive: true })
    } catch (e) {
      if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT') throw e
    }
  }

  // De vendored package.json zonder scripts en devDependencies: op de server
  // valt er niets te bouwen.
  const eigen = JSON.parse(await fs.readFile(path.join(vendor, 'package.json'), 'utf8'))
  delete eigen.scripts
  delete eigen.devDependencies
  delete eigen.bin
  await fs.writeFile(path.join(vendor, 'package.json'), `${JSON.stringify(eigen, null, 2)}\n`)

  pkg.dependencies = { ...(pkg.dependencies ?? {}), [NAAM]: 'file:./vendor/motrac-docusign' }
  await fs.writeFile(distPackage, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`${NAAM}@${eigen.version} → ${path.relative(process.cwd(), vendor) || vendor}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

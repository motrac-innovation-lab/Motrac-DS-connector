// bin/vendor.mjs: het pakket in dist/vendor/ en de afhankelijkheid op file:.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const BIN = fileURLToPath(new URL('../bin/vendor.mjs', import.meta.url))

test('kopieert het pakket naar dist/vendor en zet de afhankelijkheid op file:', async () => {
  const dist = await fs.mkdtemp(path.join(os.tmpdir(), 'vendor-'))
  try {
    await fs.writeFile(
      path.join(dist, 'package.json'),
      JSON.stringify({ name: 'app', type: 'module', dependencies: { express: '^4', '@motrac/docusign': 'git+https://github.com/motrac-innovation-lab/Motrac-DS-connector.git#v1.0.0' } }),
    )
    execFileSync(process.execPath, [BIN, dist], { stdio: 'pipe' })

    const pkg = JSON.parse(await fs.readFile(path.join(dist, 'package.json'), 'utf8'))
    assert.deepEqual(pkg.dependencies, { express: '^4', '@motrac/docusign': 'file:./vendor/motrac-docusign' })

    const vendor = path.join(dist, 'vendor', 'motrac-docusign')
    const eigen = JSON.parse(await fs.readFile(path.join(vendor, 'package.json'), 'utf8'))
    assert.equal(eigen.name, '@motrac/docusign')
    assert.equal(eigen.devDependencies, undefined)
    assert.equal(eigen.scripts, undefined)
    await fs.access(path.join(vendor, 'src', 'index.js'))
    await fs.access(path.join(vendor, 'sql', 'docusign_webhook_event.sql'))

    // De gekopieerde code laadt zelfstandig.
    const mod = await import(path.join(vendor, 'src', 'index.js'))
    assert.equal(typeof mod.maakDocusign, 'function')

    // Nogmaals draaien is veilig.
    execFileSync(process.execPath, [BIN, dist], { stdio: 'pipe' })
  } finally {
    await fs.rm(dist, { recursive: true, force: true })
  }
})

test('zonder dist/package.json: een duidelijke fout', async () => {
  const leeg = await fs.mkdtemp(path.join(os.tmpdir(), 'vendor-'))
  try {
    assert.throws(() => execFileSync(process.execPath, [BIN, leeg], { stdio: 'pipe' }), (e) => /package\.json bestaat niet/.test(String(/** @type {any} */ (e).stderr)))
  } finally {
    await fs.rm(leeg, { recursive: true, force: true })
  }
})

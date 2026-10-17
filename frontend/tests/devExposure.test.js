import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

for (const project of ['frontend', 'admin']) {
  test(`${project} Vite keeps shared UI working while denying backend file access`, { timeout: 20000 }, async t => {
    const root = fileURLToPath(new URL(`../../${project}/`, import.meta.url))
    const require = createRequire(path.join(root, 'package.json'))
    const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
    const server = await createServer({
      root,
      configFile: path.join(root, 'vite.config.js'),
      logLevel: 'silent',
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { port: 0, strictPort: false }
    })
    t.after(async () => {
      await server.close()
      assert.equal(server.httpServer.listening, false)
    })
    assert.equal(server.config.server.host, 'localhost')
    assert.equal(server.config.preview.host, 'localhost')
    assert.equal(server.config.preview.strictPort, true)
    const repository = path.resolve(root, '..')
    assert(!server.config.server.fs.allow.includes(repository.replaceAll('\\', '/')))
    await server.listen()
    const base = `http://localhost:${server.httpServer.address().port}`
    assert.equal((await fetch(base + '/src/main.jsx')).status, 200)
    const sharedFile = path.resolve(root, '../shared/loginNavigation.js').replaceAll('\\', '/')
    assert.equal((await fetch(base + '/@fs/' + sharedFile)).status, 200)
    const loginFile = path.resolve(root, '../shared/LoginFlow.jsx').replaceAll('\\', '/')
    assert.equal((await fetch(base + '/@fs/' + loginFile)).status, 200)
    for (const resource of ['LoginIcons.js', 'Foundation.css', 'assets/login_students.png', 'assets/fonts/ibm-plex-sans-latin-variable.woff2']) {
      const sharedResource = path.resolve(root, '../shared', resource).replaceAll('\\', '/')
      assert.equal((await fetch(base + '/@fs/' + sharedResource)).status, 200)
    }
    if (project === 'admin') {
      const frontendFile = path.resolve(root, '../frontend/src/main.jsx').replaceAll('\\', '/')
      assert.equal((await fetch(base + '/@fs/' + frontendFile)).status, 403)
    }
    const backendFile = path.resolve(root, '../backend/server.js').replaceAll('\\', '/')
    assert.equal((await fetch(base + '/@fs/' + backendFile)).status, 403)
  })
}

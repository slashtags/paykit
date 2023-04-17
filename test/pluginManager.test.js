const { test } = require('brittle')
const sinon = require('sinon')

const { PluginManager, ERRORS } = require('../src/pluginManager.js')

const storage = require('./fixtures/storageInstance.js')

const { pluginConfig } = require('./fixtures/config.js')
const pluginAStub = require('./fixtures/pluginA/main.js')
const pluginBStub = require('./fixtures/pluginB/main.js')

test('constructor', t => {
  const pluginManager = new PluginManager()

  t.alike(pluginManager.plugins, {})
})

test('load plugins', async t => {
  const pluginManager = new PluginManager()
  const validateManifestSpy = sinon.spy(pluginManager, 'validateManifest')
  const {
    active: activeA,
    manifest: manifestA,
    plugin: pluginA
  } = await pluginManager.loadPlugin(pluginConfig.plugins[0], storage)

  t.alike(pluginManager.plugins.testA, {
    manifest: manifestA,
    plugin: pluginA,
    active: activeA
  })

  t.is(pluginAStub.init.callCount, 1)
  t.alike(pluginAStub.init.getCall(0).args, [storage])

  t.is(pluginAStub.getmanifest.callCount, 1)
  t.is(pluginBStub.init.callCount, 0)
  t.is(pluginBStub.getmanifest.callCount, 0)
  t.is(validateManifestSpy.callCount, 1)

  t.is(typeof pluginA.stop, 'function')
  t.ok(activeA)

  const {
    active: activeB,
    manifest: manifestB,
    plugin: pluginB
  } = await pluginManager.loadPlugin(pluginConfig.plugins[1], storage)

  t.alike(pluginManager.plugins.testB, {
    manifest: manifestB,
    plugin: pluginB,
    active: activeB
  })

  t.is(pluginAStub.init.callCount, 1)
  t.is(pluginAStub.getmanifest.callCount, 1)
  t.is(pluginBStub.init.callCount, 1)
  t.alike(pluginBStub.init.getCall(0).args, [storage])
  t.is(pluginBStub.getmanifest.callCount, 1)
  t.is(validateManifestSpy.callCount, 2)

  t.is(typeof pluginB.stop, 'function')
  t.ok(activeB)

  t.teardown(() => {
    pluginAStub.init.resetHistory()
    pluginAStub.getmanifest.resetHistory()

    pluginBStub.init.resetHistory()
    pluginBStub.getmanifest.resetHistory()

    validateManifestSpy.restore()
  })
})

test('plugin load init - error handling', async t => {
  const pluginManager = new PluginManager()

  sinon.replace(pluginAStub, 'init', sinon.fake.throws(new Error('test error')))
  await t.exception(
    async () => await pluginManager.loadPlugin(pluginConfig.plugins[0], storage),
    ERRORS.PLUGIN.INIT('test error')
  )

  t.teardown(() => sinon.restore())
})

test('plugin load getmanifest - error handling', async t => {
  const pluginManager = new PluginManager()

  sinon.replace(pluginAStub, 'getmanifest', sinon.fake.throws(new Error('test error')))
  await t.exception(
    async () => await pluginManager.loadPlugin(pluginConfig.plugins[0], storage),
    ERRORS.PLUGIN.GET_MANIFEST('test error')
  )

  t.teardown(() => sinon.restore())
})

test('plugin dispatch - error handling', async t => {
  const pluginManager = new PluginManager()

  const p = await pluginManager.loadPlugin(pluginConfig.plugins[0], storage)
  sinon.replace(p.plugin, 'onEvent', sinon.fake.throws(new Error('test error')))
  await t.execution(async () => await pluginManager.dispatchEvent('testEvent', {}))

  t.teardown(() => sinon.restore())
})

test('plugin stop - error handling', async t => {
  const pluginManager = new PluginManager()

  const p = await pluginManager.loadPlugin(pluginConfig.plugins[0], storage)
  sinon.replace(p.plugin, 'stop', sinon.fake.throws(new Error('test error')))
  await t.exception(
    async () => await pluginManager.stopPlugin('testA'),
    ERRORS.PLUGIN.STOP('test error')
  )

  t.teardown(() => sinon.restore())
})

test('load duplicate plugin', async t => {
  const pluginManager = new PluginManager()
  await pluginManager.loadPlugin(pluginConfig.plugins[0], storage)

  await t.exception(
    async () => await pluginManager.loadPlugin(pluginConfig.plugins[0], storage),
    ERRORS.CONFLICT
  )

  t.teardown(() => {
    pluginAStub.init.resetHistory()
    pluginAStub.getmanifest.resetHistory()
  })
})

test('load nonexisting plugin', async t => {
  const pluginManager = new PluginManager()
  await t.exception(
    async () => await pluginManager.loadPlugin(pluginConfig.plugins[2], storage),
    ERRORS.FAILED_TO_LOAD(pluginConfig.plugins[2])
  )
})

test('stop plugin', async (t) => {
  const pluginManager = new PluginManager()
  const p = await pluginManager.loadPlugin(pluginConfig.plugins[0], storage)

  await pluginManager.stopPlugin('testA')

  t.is(p.active, false)
  t.is(p.plugin.stop.callCount, 1)

  t.teardown(() => {
    pluginAStub.init.resetHistory()
    pluginAStub.getmanifest.resetHistory()

    p.plugin.stop.resetHistory()
  })
})

test('removePlugin', async (t) => {
  const pluginManager = new PluginManager()
  const a = await pluginManager.loadPlugin(pluginConfig.plugins[0], storage)

  t.is(pluginManager.removePlugin('testA'), false)
  t.is(a.active, true)

  await pluginManager.stopPlugin('testA')
  t.is(a.active, false)

  t.is(pluginManager.removePlugin('testA'), true)
  t.absent(pluginManager.plugins.testA)

  t.teardown(() => {
    pluginAStub.init.resetHistory()
    pluginAStub.getmanifest.resetHistory()
  })
})

test('getPlugins', async (t) => {
  const pluginManager = new PluginManager()
  t.alike(pluginManager.getPlugins(), {})

  const pluginA = await pluginManager.loadPlugin(pluginConfig.plugins[0], storage)
  const pluginB = await pluginManager.loadPlugin(pluginConfig.plugins[1], storage)

  t.alike(pluginManager.getPlugins(), { testA: pluginA, testB: pluginB })
  t.alike(pluginManager.getPlugins(false), {})

  await pluginManager.stopPlugin('testA')
  t.is(pluginA.active, false)

  t.alike(pluginManager.getPlugins(true), { testB: pluginB })
  t.alike(pluginManager.getPlugins(false), { testA: pluginA })

  t.teardown(() => {
    pluginAStub.init.resetHistory()
    pluginAStub.getmanifest.resetHistory()

    pluginBStub.init.resetHistory()
    pluginBStub.getmanifest.resetHistory()
  })
})

test('dispatchEvent', async (t) => {
  const pluginManager = new PluginManager()
  const pluginA = await pluginManager.loadPlugin(pluginConfig.plugins[0], storage)
  const pluginB = await pluginManager.loadPlugin(pluginConfig.plugins[1], storage)

  await pluginManager.dispatchEvent('event1', { data: 'both' })

  t.is(pluginA.plugin.onEvent.callCount, 1)
  t.is(pluginB.plugin.onEvent.callCount, 1)
  t.alike(pluginB.plugin.onEvent.getCall(0).args, ['event1', { data: 'both' }])

  await pluginManager.stopPlugin('testA')
  t.is(pluginA.active, false)
  // b is not subscribed to event2
  await pluginManager.dispatchEvent('event2', { data: 'nobody' })

  t.is(pluginA.plugin.onEvent.callCount, 1)
  t.is(pluginB.plugin.onEvent.callCount, 1)

  await pluginManager.dispatchEvent('event1', { data: 'onlyB' })

  t.is(pluginA.plugin.onEvent.callCount, 1)
  t.is(pluginB.plugin.onEvent.callCount, 2)
  t.alike(pluginB.plugin.onEvent.getCall(1).args, ['event1', { data: 'onlyB' }])

  t.teardown(() => {
    pluginAStub.init.resetHistory()
    pluginAStub.getmanifest.resetHistory()

    pluginBStub.init.resetHistory()
    pluginBStub.getmanifest.resetHistory()

    pluginA.plugin.onEvent.resetHistory()
    pluginB.plugin.onEvent.resetHistory()
  })
})

test('getRPCRegistry', async (t) => {
  const pluginManager = new PluginManager()
  const pluginA = await pluginManager.loadPlugin(pluginConfig.plugins[0], storage)
  const pluginB = await pluginManager.loadPlugin(pluginConfig.plugins[1], storage)

  t.alike(pluginManager.getRPCRegistry(), {
    'testA/stop': pluginA.plugin.stop,
    'testA/pay': pluginA.plugin.pay,

    'testB/stop': pluginB.plugin.stop,
    'testB/start': pluginB.plugin.start,
    'testB/pay': pluginB.plugin.pay
  })

  t.teardown(() => {
    pluginAStub.init.resetHistory()
    pluginAStub.getmanifest.resetHistory()

    pluginBStub.init.resetHistory()
    pluginBStub.getmanifest.resetHistory()

    pluginA.plugin.onEvent.resetHistory()
    pluginB.plugin.onEvent.resetHistory()
  })
})

test('validateManifest', async (t) => {
  const pluginManager = new PluginManager()
  const pluginA = await pluginManager.loadPlugin(pluginConfig.plugins[0], storage)

  const validateNameSpy = sinon.spy(pluginManager, 'validateName')
  const validateRPCSpy = sinon.spy(pluginManager, 'validateRPC')
  const validateEventsSpy = sinon.spy(pluginManager, 'validateEvents')

  t.execution(pluginManager.validateManifest({
    name: 'testA',
    rpc: ['stop'],
    events: ['watch', 'event1', 'event2']
  }, pluginA.plugin))

  t.is(validateNameSpy.callCount, 1)
  t.is(validateRPCSpy.callCount, 1)
  t.is(validateEventsSpy.callCount, 1)

  t.teardown(() => {
    validateNameSpy.restore()
    validateRPCSpy.restore()
    validateEventsSpy.restore()
  })
})

test('validateName', (t) => {
  const pluginManager = new PluginManager()
  t.exception(
    () => pluginManager.validateName({}, 'test prefix'),
    ERRORS.NAME.MISSING('test prefix')
  )

  t.exception(
    () => pluginManager.validateName({ name: 1 }, 'test prefix'),
    ERRORS.NAME.NOT_STRING('test prefix')
  )
})

test('validateRPC', async (t) => {
  const pluginManager = new PluginManager()
  const pluginA = await pluginManager.loadPlugin(pluginConfig.plugins[0], storage)

  t.execution(pluginManager.validateRPC({}, pluginA.plugin, 'test prefix'))

  t.exception(
    () => pluginManager.validateRPC({ rpc: 1 }, pluginA.pluginA, 'test prefix'),
    ERRORS.RPC.NOT_ARRAY('test prefix')
  )

  t.exception(
    () => pluginManager.validateRPC({ rpc: ['stop', 'stOp'] }, pluginA.plugin, 'test prefix'),
    ERRORS.RPC.NOT_UNIQ('test prefix')
  )

  t.exception(
    () => pluginManager.validateRPC({ rpc: ['stop', 1] }, pluginA.plugin, 'test prefix'),
    ERRORS.RPC.NOT_STRING('test prefix', 1)
  )

  t.exception(
    () => pluginManager.validateRPC({ rpc: ['stop', 'start'] }, pluginA.plugin, 'test prefix'),
    ERRORS.RPC.NOT_IMPLEMENTED('test prefix', 'start')
  )

  t.exception(
    () => pluginManager.validateRPC(
      { type: 'payment', rpc: ['stop', 'start'] },
      pluginA.plugin,
      'test prefix'
    ),
    ERRORS.RPC.MISSING_PAY('test prefix')
  )

  t.execution(pluginManager.validateRPC(pluginA.manifest, pluginA.plugin, 'test prefix'))
})

test('validateEvents', async (t) => {
  const pluginManager = new PluginManager()
  const pluginA = await pluginManager.loadPlugin(pluginConfig.plugins[0], storage)

  t.execution(pluginManager.validateEvents({}, pluginA.plugin, 'test prefix'))

  t.exception(
    () => pluginManager.validateEvents({ events: 1 }, pluginA.plugin, 'test prefix'),
    ERRORS.EVENTS.NOT_ARRAY('test prefix')
  )

  t.exception(
    () => pluginManager.validateEvents({ events: ['test', 1] }, pluginA.plugin, 'test prefix'),
    ERRORS.EVENTS.NOT_STRING('test prefix', 1)
  )

  t.exception(
    () => pluginManager.validateEvents({ events: ['test1', 'test2'] }, pluginA.plugin, 'test prefix'),
    ERRORS.EVENTS.MISSING_WATCH('test prefix')
  )

  t.execution(pluginManager.validateEvents({ events: ['watch', 'test'] }, pluginA.plugin, 'test prefix'))
})

test('gracefulThrow', async (t) => {
  const pluginManager = new PluginManager()
  const a = await pluginManager.loadPlugin(pluginConfig.plugins[0], storage)
  const b = await pluginManager.loadPlugin(pluginConfig.plugins[1], storage)

  await t.exception(async () => await pluginManager.gracefulThrow('test error'), 'test error')

  t.is(a.plugin.stop.callCount, 1)
  t.is(b.plugin.stop.callCount, 1)

  t.is(a.active, false)
  t.is(b.active, false)

  t.teardown(() => {
    pluginAStub.init.resetHistory()
    pluginAStub.getmanifest.resetHistory()

    pluginBStub.init.resetHistory()
    pluginBStub.getmanifest.resetHistory()

    a.plugin.stop.resetHistory()
    b.plugin.stop.resetHistory()
  })
})

const { test } = require('brittle')
const sinon = require('sinon')

const { PaymentState, PAYMENT_STATE, PLUGIN_STATE, ERRORS } = require('../../src/payments/PaymentState')
const update = sinon.stub()
const uninitializedPayment = {
  update,
  db: { ready: true }
}

test('PaymentState.validate', t => {
  t.exception(() => PaymentState.validate(), ERRORS.PAYMENT_REQUIRED)
  t.exception(() => PaymentState.validate({}), ERRORS.DB_REQUIRED)

  t.execution(() => PaymentState.validate(uninitializedPayment))
})

test('PaymentState.constructor', t => {
  const pS = new PaymentState(uninitializedPayment)

  t.is(pS.internalState, PAYMENT_STATE.INITIAL)
  t.alike(pS.pendingPlugins, [])
  t.alike(pS.triedPlugins, [])
  t.is(pS.currentPlugin, null)
  t.is(pS.completedByPlugin, null)
})

test('PaymentState.assignPendingPlugins', t => {
  const pS = new PaymentState(uninitializedPayment)
  pS.assignPendingPlugins(['plugin0', 'plugin1', 'plugin2'])
  t.alike(pS.pendingPlugins, ['plugin0', 'plugin1', 'plugin2'])
})

test('PaymentState.serialize', t => {
  const pS = new PaymentState(uninitializedPayment)
  t.alike(pS.serialize(), {
    internalState: PAYMENT_STATE.INITIAL,
    pendingPlugins: [],
    triedPlugins: [],
    currentPlugin: {},
    completedByPlugin: {}
  })
})

test('PaymentState.currentState', t => {
  let pS = new PaymentState(uninitializedPayment)
  t.is(pS.currentState(), PAYMENT_STATE.INITIAL)

  pS = new PaymentState(uninitializedPayment)
  pS.internalState = PAYMENT_STATE.IN_PROGRESS
  t.is(pS.currentState(), PAYMENT_STATE.IN_PROGRESS)
})

test('PaymentState.isInitial', t => {
  let pS = new PaymentState(uninitializedPayment)
  t.is(pS.isInitial(), true)
  pS = new PaymentState(uninitializedPayment)
  pS.internalState = PAYMENT_STATE.IN_PROGRESS
  t.is(pS.isInitial(), false)
})

test('PaymentState.isInProgress', t => {
  let pS = new PaymentState(uninitializedPayment)
  t.is(pS.isInProgress(), false)
  pS = new PaymentState(uninitializedPayment)
  pS.internalState = PAYMENT_STATE.IN_PROGRESS
  t.is(pS.isInProgress(), true)
})

test('PaymentState.isCompleted', t => {
  let pS = new PaymentState(uninitializedPayment)
  t.is(pS.isCompleted(), false)
  pS = new PaymentState(uninitializedPayment)
  pS.internalState = PAYMENT_STATE.COMPLETED
  t.is(pS.isCompleted(), true)
})

test('PaymentState.isFailed', t => {
  let pS = new PaymentState(uninitializedPayment)
  t.is(pS.isFailed(), false)
  pS = new PaymentState(uninitializedPayment)
  pS.internalState = PAYMENT_STATE.FAILED
  t.is(pS.isFailed(), true)
})

test('PaymentState.isCancelled', t => {
  let pS = new PaymentState(uninitializedPayment)
  t.is(pS.isCancelled(), false)
  pS = new PaymentState(uninitializedPayment)
  pS.internalState = PAYMENT_STATE.CANCELLED
  t.is(pS.isCancelled(), true)
})

test('PaymentState.isFinal', t => {
  let pS = new PaymentState(uninitializedPayment)
  t.is(pS.isFinal(), false)
  pS = new PaymentState(uninitializedPayment)
  pS.internalState = PAYMENT_STATE.COMPLETED
  t.is(pS.isFinal(), true)
  pS = new PaymentState(uninitializedPayment)
  pS.internalState = PAYMENT_STATE.FAILED
  t.is(pS.isFinal(), true)
  pS = new PaymentState(uninitializedPayment)
  pS.internalState = PAYMENT_STATE.CANCELLED
  t.is(pS.isFinal(), true)
})

test('PaymentState.cancel', async t => {
  const pS = new PaymentState(uninitializedPayment)
  await pS.cancel()

  t.is(pS.internalState, PAYMENT_STATE.CANCELLED)
  t.is(update.callCount, 1)

  await t.exception(async () => await pS.cancel(), ERRORS.INVALID_STATE(PAYMENT_STATE.CANCELLED))

  t.teardown(() => update.resetHistory())
})

test('PaymentState.failCurrentPlugin', async t => {
  const pS = new PaymentState(uninitializedPayment)
  await t.exception(async () => await pS.failCurrentPlugin(), ERRORS.INVALID_STATE(PAYMENT_STATE.INITIAL))

  pS.internalState = PAYMENT_STATE.IN_PROGRESS
  await t.exception(async () => await pS.failCurrentPlugin(), 'No current plugin')

  pS.currentPlugin = { name: 'plugin0', startAt: Date.now() }
  await pS.failCurrentPlugin()

  t.is(pS.internalState, PAYMENT_STATE.IN_PROGRESS)
  t.is(pS.currentPlugin, null)
  t.is(pS.completedByPlugin, null)
  t.is(pS.triedPlugins.length, 1)
  t.is(pS.triedPlugins[0].name, 'plugin0')
  t.ok(pS.triedPlugins[0].startAt <= Date.now())
  t.ok(pS.triedPlugins[0].endAt <= Date.now())
  t.is(pS.triedPlugins[0].state, PLUGIN_STATE.FAILED)
  t.is(update.callCount, 1)

  t.teardown(() => update.resetHistory())
})

test('PaymentState.fail', async t => {
  let pS
  const initializedPayment = {
    update,
    db: { ready: true },
    pendingPlugins: ['plugin0', 'plugin1', 'plugin2', 'plugin3'],
    triedPlugins: [],
    currentPlugin: null,
    completedByPlugin: null
  }

  pS = new PaymentState(initializedPayment)
  await t.exception(async () => await pS.fail(), ERRORS.INVALID_STATE(PAYMENT_STATE.INITIAL))

  pS.internalState = PAYMENT_STATE.IN_PROGRESS
  pS.currentPlugin = { name: 'pluginX', startAt: Date.now() }
  await pS.fail()

  t.is(update.callCount, 2)
  t.is(pS.internalState, PAYMENT_STATE.FAILED)
  t.is(pS.currentPlugin, null)
  t.is(pS.completedByPlugin, null)
  t.is(pS.triedPlugins.length, 1)
  t.is(pS.triedPlugins[0].name, 'pluginX')
  t.ok(pS.triedPlugins[0].startAt <= Date.now())
  t.ok(pS.triedPlugins[0].endAt <= Date.now())
  t.is(pS.triedPlugins[0].state, PLUGIN_STATE.FAILED)

  pS = new PaymentState(initializedPayment)
  pS.internalState = PAYMENT_STATE.IN_PROGRESS
  await pS.fail()

  t.is(pS.internalState, PAYMENT_STATE.FAILED)
  t.is(update.callCount, 3)

  await t.exception(async () => await pS.fail(), ERRORS.INVALID_STATE(PAYMENT_STATE.FAILED))

  pS = new PaymentState(uninitializedPayment)
  await t.exception(async () => await pS.fail(), ERRORS.INVALID_STATE(PAYMENT_STATE.INITIAL))

  t.teardown(() => update.resetHistory())
})

test('PaymentState.tryNext', async t => {
  const initializedPayment = {
    update,
    db: { ready: true },
    pendingPlugins: ['plugin0', 'plugin1', 'plugin2', 'plugin3'],
    triedPlugins: [],
    currentPlugin: null,
    completedByPlugin: null
  }

  const pS = new PaymentState(initializedPayment)
  t.alike(pS.pendingPlugins, ['plugin0', 'plugin1', 'plugin2', 'plugin3'])
  t.alike(pS.triedPlugins, [])
  t.is(pS.currentPlugin, null)
  t.is(pS.completedByPlugin, null)
  t.is(update.callCount, 0)
  t.is(pS.internalState, PAYMENT_STATE.INITIAL)

  await t.exception(async () => await pS.tryNext(), ERRORS.INVALID_STATE(PAYMENT_STATE.INITIAL))
  pS.internalState = PAYMENT_STATE.IN_PROGRESS

  const start0 = Date.now()
  await pS.tryNext()

  t.alike(pS.pendingPlugins, ['plugin1', 'plugin2', 'plugin3'])
  t.is(pS.currentPlugin.name, 'plugin0')
  t.ok(pS.currentPlugin.startAt >= start0)
  t.ok(pS.currentPlugin.startAt <= Date.now())
  t.alike(pS.triedPlugins, [])
  t.is(pS.completedByPlugin, null)
  t.is(update.callCount, 1)
  t.is(pS.internalState, PAYMENT_STATE.IN_PROGRESS)

  await t.exception(async () => await pS.tryNext(), ERRORS.PLUGIN_IN_PROGRESS('plugin0'))
  await pS.failCurrentPlugin()
  t.is(update.callCount, 2)

  const start1 = Date.now()
  await pS.tryNext()

  t.alike(pS.pendingPlugins, ['plugin2', 'plugin3'])
  t.is(pS.currentPlugin.name, 'plugin1')
  t.ok(pS.currentPlugin.startAt >= start1)
  t.ok(pS.currentPlugin.startAt <= Date.now())
  t.is(pS.triedPlugins.length, 1)
  t.is(pS.triedPlugins[0].name, 'plugin0')
  t.ok(pS.triedPlugins[0].startAt >= start0)
  t.ok(pS.triedPlugins[0].endAt <= start1)
  t.is(pS.completedByPlugin, null)
  t.is(update.callCount, 3)
  t.is(pS.internalState, PAYMENT_STATE.IN_PROGRESS)

  t.teardown(() => update.resetHistory())
})

test('PaymentState.process', async t => {
  const initializedPayment = {
    update,
    db: { ready: true },
    pendingPlugins: ['plugin0', 'plugin1', 'plugin2', 'plugin3'],
    triedPlugins: [],
    currentPlugin: null,
    completedByPlugin: null
  }

  const pS = new PaymentState(initializedPayment)
  t.alike(pS.pendingPlugins, ['plugin0', 'plugin1', 'plugin2', 'plugin3'])
  t.alike(pS.triedPlugins, [])
  t.is(pS.currentPlugin, null)
  t.is(pS.completedByPlugin, null)
  t.is(update.callCount, 0)
  t.is(pS.internalState, PAYMENT_STATE.INITIAL)

  const start0 = Date.now()
  await pS.process()

  t.alike(pS.pendingPlugins, ['plugin1', 'plugin2', 'plugin3'])
  t.is(pS.currentPlugin.name, 'plugin0')
  t.ok(pS.currentPlugin.startAt >= start0)
  t.ok(pS.currentPlugin.startAt <= Date.now())
  t.is(pS.currentPlugin.state, PLUGIN_STATE.SUBMITTED)
  t.alike(pS.triedPlugins, [])
  t.is(pS.completedByPlugin, null)
  t.is(update.callCount, 2)
  t.is(pS.internalState, PAYMENT_STATE.IN_PROGRESS)

  await t.exception(async () => await pS.process(), ERRORS.PLUGIN_IN_PROGRESS('plugin0'))
  await pS.failCurrentPlugin()
  t.is(update.callCount, 3)

  const start1 = Date.now()
  await pS.process()

  t.alike(pS.pendingPlugins, ['plugin2', 'plugin3'])
  t.is(pS.currentPlugin.name, 'plugin1')
  t.ok(pS.currentPlugin.startAt >= start1)
  t.ok(pS.currentPlugin.startAt <= Date.now())
  t.is(pS.currentPlugin.state, PLUGIN_STATE.SUBMITTED)
  t.is(pS.triedPlugins.length, 1)
  t.is(pS.triedPlugins[0].name, 'plugin0')
  t.ok(pS.triedPlugins[0].startAt >= start0)
  t.ok(pS.triedPlugins[0].endAt <= start1)
  t.is(pS.triedPlugins[0].state, PLUGIN_STATE.FAILED)
  t.is(pS.completedByPlugin, null)
  t.is(update.callCount, 4)
  t.is(pS.internalState, PAYMENT_STATE.IN_PROGRESS)

  await t.exception(async () => await pS.process(), ERRORS.PLUGIN_IN_PROGRESS('plugin1'))
  await pS.failCurrentPlugin()
  t.is(update.callCount, 5)

  const start2 = Date.now()
  await pS.process()

  t.alike(pS.pendingPlugins, ['plugin3'])
  t.is(pS.currentPlugin.name, 'plugin2')
  t.ok(pS.currentPlugin.startAt >= start2)
  t.ok(pS.currentPlugin.startAt <= Date.now())
  t.is(pS.currentPlugin.state, PLUGIN_STATE.SUBMITTED)
  t.is(pS.triedPlugins.length, 2)
  t.is(pS.triedPlugins[0].name, 'plugin0')
  t.ok(pS.triedPlugins[0].startAt >= start0)
  t.ok(pS.triedPlugins[0].endAt <= start1)
  t.is(pS.triedPlugins[0].state, PLUGIN_STATE.FAILED)
  t.is(pS.triedPlugins[1].name, 'plugin1')
  t.ok(pS.triedPlugins[1].startAt >= start1)
  t.ok(pS.triedPlugins[1].endAt <= start2)
  t.is(pS.triedPlugins[1].state, PLUGIN_STATE.FAILED)
  t.is(pS.completedByPlugin, null)
  t.is(update.callCount, 6)
  t.is(pS.internalState, PAYMENT_STATE.IN_PROGRESS)

  await t.exception(async () => await pS.process(), ERRORS.PLUGIN_IN_PROGRESS('plugin2'))
  await pS.failCurrentPlugin()
  t.is(update.callCount, 7)

  const start3 = Date.now()
  await pS.process()

  t.alike(pS.pendingPlugins, [])
  t.is(pS.currentPlugin.name, 'plugin3')
  t.ok(pS.currentPlugin.startAt >= start3)
  t.ok(pS.currentPlugin.startAt <= Date.now())
  t.is(pS.currentPlugin.state, PLUGIN_STATE.SUBMITTED)
  t.is(pS.triedPlugins.length, 3)
  t.is(pS.triedPlugins[0].name, 'plugin0')
  t.ok(pS.triedPlugins[0].startAt >= start0)
  t.ok(pS.triedPlugins[0].endAt <= start1)
  t.is(pS.triedPlugins[0].state, PLUGIN_STATE.FAILED)
  t.is(pS.triedPlugins[1].name, 'plugin1')
  t.ok(pS.triedPlugins[1].startAt >= start1)
  t.ok(pS.triedPlugins[1].endAt <= start2)
  t.is(pS.triedPlugins[1].state, PLUGIN_STATE.FAILED)
  t.is(pS.triedPlugins[2].name, 'plugin2')
  t.ok(pS.triedPlugins[2].startAt >= start2)
  t.ok(pS.triedPlugins[2].endAt <= start3)
  t.is(pS.triedPlugins[2].state, PLUGIN_STATE.FAILED)
  t.is(pS.completedByPlugin, null)
  t.is(update.callCount, 8)
  t.is(pS.internalState, PAYMENT_STATE.IN_PROGRESS)

  await t.exception(async () => await pS.process(), ERRORS.PLUGIN_IN_PROGRESS('plugin3'))
  await pS.failCurrentPlugin()
  t.is(update.callCount, 9)

  const start4 = Date.now()
  await pS.process()

  t.alike(pS.pendingPlugins, [])
  t.is(pS.currentPlugin, null)
  t.is(pS.triedPlugins.length, 4)
  t.is(pS.triedPlugins[0].name, 'plugin0')
  t.ok(pS.triedPlugins[0].startAt >= start0)
  t.ok(pS.triedPlugins[0].endAt <= start1)
  t.is(pS.triedPlugins[0].state, PLUGIN_STATE.FAILED)
  t.is(pS.triedPlugins[1].name, 'plugin1')
  t.ok(pS.triedPlugins[1].startAt >= start1)
  t.ok(pS.triedPlugins[1].endAt <= start2)
  t.is(pS.triedPlugins[1].state, PLUGIN_STATE.FAILED)
  t.is(pS.triedPlugins[2].name, 'plugin2')
  t.ok(pS.triedPlugins[2].startAt >= start2)
  t.ok(pS.triedPlugins[2].endAt <= start3)
  t.is(pS.triedPlugins[2].state, PLUGIN_STATE.FAILED)
  t.is(pS.triedPlugins[3].name, 'plugin3')
  t.ok(pS.triedPlugins[3].startAt >= start3)
  t.ok(pS.triedPlugins[3].endAt <= start4)
  t.is(pS.triedPlugins[3].state, PLUGIN_STATE.FAILED)
  t.is(pS.completedByPlugin, null)
  t.is(update.callCount, 10)
  t.is(pS.internalState, PAYMENT_STATE.FAILED)

  t.teardown(() => update.resetHistory())
})

test('PaymentState.complete', async t => {
  const initializedPayment = {
    update,
    db: { ready: true },
    pendingPlugins: ['plugin0', 'plugin1', 'plugin2', 'plugin3'],
    triedPlugins: [],
    currentPlugin: null,
    completedByPlugin: null
  }

  const pS = new PaymentState(initializedPayment)

  await t.exception(async () => await pS.complete(), ERRORS.INVALID_PAYMENT_STATE)

  await pS.process()

  t.is(pS.internalState, PAYMENT_STATE.IN_PROGRESS)
  t.is(update.callCount, 2)
  t.is(pS.currentPlugin.name, 'plugin0')
  t.ok(pS.currentPlugin.startAt <= Date.now())
  t.is(pS.currentPlugin.state, PLUGIN_STATE.SUBMITTED)
  t.is(pS.completedByPlugin, null)

  await pS.complete()

  t.is(pS.internalState, PAYMENT_STATE.COMPLETED)
  t.is(update.callCount, 3)
  t.is(pS.currentPlugin, null)
  t.is(pS.completedByPlugin.name, 'plugin0')
  t.ok(pS.completedByPlugin.startAt <= Date.now())
  t.ok(pS.completedByPlugin.endAt <= Date.now())
  t.is(pS.completedByPlugin.state, PLUGIN_STATE.SUCCESS)

  t.teardown(() => update.resetHistory())
})

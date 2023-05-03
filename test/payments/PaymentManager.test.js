const sinon = require('sinon')
const proxyquire = require('proxyquire')

const { test } = require('brittle')

const { DB } = require('../../src/DB')

const { config } = require('../fixtures/config')
const { paymentParams } = require('../fixtures/paymentParams')

const { PaymentManager } = require('../../src/payments/PaymentManager')
const { Payment } = require('../../src/payments/Payment')

test('PaymentManager: constructor', async t => {
  const db = new DB()
  const paymentManager = new PaymentManager(config, db)

  t.alike(paymentManager.db, db)
  t.alike(paymentManager.config, config)
  t.is(paymentManager.ready, false)
})

test('PaymentManager: init', async t => {
  const db = new DB()
  const paymentManager = new PaymentManager(config, db)
  const init = sinon.stub(db, 'init').resolves()

  await paymentManager.init()

  t.is(paymentManager.ready, true)
  t.is(init.calledOnce, true)

  t.teardown(() => sinon.restore())
})

test('PaymentManager: createPaymentOrder', async t => {
  const db = new DB()

  const paymentManager = new PaymentManager(config, db)
  await paymentManager.init()

  const paymentOrder = await paymentManager.createPaymentOrder(paymentParams)

  const got = await db.get(paymentOrder.id)
  t.alike(got, paymentOrder)
})

test('PaymentManager: sendPayment', async t => {
  const p2shStub = require('../fixtures/p2sh/main.js')

  const db = new DB()
  const paymentManager = new PaymentManager(config, db)
  await paymentManager.init()

  const paymentOrder = await paymentManager.createPaymentOrder(paymentParams)

  await paymentManager.sendPayment(paymentOrder.id)

  t.ok(p2shStub.init.calledOnce)
  t.ok(p2shStub.init.getCall(0).returnValue.pay.calledOnce)
})

test('PaymentManager: receivePayments', async t => {
  const validConfig = { ...config }
  validConfig.plugins = {
    p2sh: config.plugins.p2sh,
    p2tr: config.plugins.p2tr
  }

  const db = new DB()
  const paymentManager = new PaymentManager(validConfig, db)
  await paymentManager.init()
  const url = await paymentManager.receivePayments()

  // FIXME: hardcoded in SlashtagsAccessObject for now
  t.is(url, 'randomDriveKey')
})

test('PaymentManager: entryPointForPlugin waiting for client', async t => {
  const db = new DB()
  await db.init()

  const paymentManager = new PaymentManager(config, db)
  await paymentManager.init()

  const paymentOrder = await paymentManager.createPaymentOrder(paymentParams)
  const payments = await db.getPayments(paymentOrder.id)

  const stub = sinon.replace(paymentManager, 'userNotificationEndpoint', sinon.fake())

  await paymentManager.entryPointForPlugin(new Payment(payments[0], db, config))

  t.is(stub.calledOnce, true)

  t.teardown(() => sinon.restore())
})

test('PaymentManager: entryPointForUser', async t => {
  const updatePaymentStub = sinon.stub().resolves()

  const { PaymentManager } = proxyquire('../../src/payments/PaymentManager', {
    '../plugins/PluginManager': {
      PluginManager: class PluginManager {
        constructor () { this.ready = true }
        async loadPlugin () {
          return {
            plugin: {
              async updatePayment (args) { return await updatePaymentStub(args) }
            }
          }
        }
      }
    }
  })
  const db = new DB()
  const paymentManager = new PaymentManager(config, db)
  await paymentManager.init()

  const data = { pluginName: 'p2sh', foo: 'bar' }
  await paymentManager.entryPointForUser(data)

  t.ok(updatePaymentStub.calledOnce)
  t.alike(updatePaymentStub.getCall(0).args[0], data)

  t.teardown(() => sinon.restore())
})

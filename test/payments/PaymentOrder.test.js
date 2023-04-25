const { test } = require('brittle')
const sinon = require('sinon')
const proxyquire = require('proxyquire')
const { DB } = require('../../src/DB')

const { PAYMENT_STATE } = require('../../src/payments/Payment')

const { orderParams } = require('../fixtures/paymentParams')

const { PaymentOrder, ORDER_TYPE, ORDER_STATE, ERROR } = require('../../src/payments/PaymentOrder')

test('PaymentOrder - contructor (default type)', async t => {
  const db = new DB()
  await db.init()

  const orderConfig = { sendingPriority: ['p2sh', 'lightning'] }

  const paymentOrder = new PaymentOrder(orderParams, orderConfig, db)
  t.is(paymentOrder.orderParams, orderParams)
  t.is(paymentOrder.orderConfig, orderConfig)
  t.is(paymentOrder.db, db)
  t.is(paymentOrder.clientOrderId, orderParams.clientOrderId)
  t.is(paymentOrder.type, orderParams.type || ORDER_TYPE.ONE_TIME)
  t.alike(paymentOrder.payments, [])
  t.is(paymentOrder.frequency, null)
})

test('PaymentOrder - contructor (one time)', async t => {
  const db = new DB()
  await db.init()

  const params = { ...orderParams, type: ORDER_TYPE.ONE_TIME }

  const orderConfig = { sendingPriority: ['p2sh', 'lightning'] }

  const paymentOrder = new PaymentOrder(params, orderConfig, db)
  t.is(paymentOrder.orderParams, params)
  t.is(paymentOrder.orderConfig, orderConfig)
  t.is(paymentOrder.db, db)
  t.is(paymentOrder.clientOrderId, params.clientOrderId)
  t.is(paymentOrder.type, params.type || ORDER_TYPE.ONE_TIME)
  t.alike(paymentOrder.payments, [])

  t.is(paymentOrder.frequency, null)

  t.is(paymentOrder.state, ORDER_STATE.CREATED)

  t.is(paymentOrder.amount, params.amount)
  t.is(paymentOrder.currency, params.currency || 'BTC')
  t.is(paymentOrder.denomination, params.denomination || 'BASE')
  t.is(paymentOrder.targetURL, params.targetURL)
  t.is(paymentOrder.memo, params.memo || '')
})

test('PaymentOrder - contructor (reccuring)', async t => {
  const db = new DB()
  await db.init()

  const params = { ...orderParams, type: ORDER_TYPE.RECCURING }

  const orderConfig = { sendingPriority: ['p2sh', 'lightning'] }

  t.exception(() => {
    new PaymentOrder(params, orderConfig, db) // eslint-disable-line
  }, ERROR.NOT_IMPLEMENTED)
})

test('PaymentOrder - init', async t => {
  const paymentInstanceStub = {
    init: sinon.stub().resolves(),
    save: sinon.stub().resolves()
  }
  const paymentClassStub = sinon.stub().returns(paymentInstanceStub)

  const { PaymentOrder } = proxyquire('../../src/payments/PaymentOrder', {
    './Payment': {
      Payment: paymentClassStub
    }
  })

  const db = new DB()
  await db.init()

  const params = { ...orderParams, type: ORDER_TYPE.ONE_TIME }
  const orderConfig = { sendingPriority: ['p2sh', 'lightning'] }

  const paymentOrder = new PaymentOrder(params, orderConfig, db)
  t.absent(paymentOrder.id)
  await paymentOrder.init()

  t.is(paymentClassStub.callCount, 1)
  t.alike(paymentClassStub.args[0][0], { ...params, orderId: paymentOrder.id })
  t.alike(paymentClassStub.args[0][1].spendingPriority, orderConfig.spendingPriority)
  t.alike(paymentClassStub.args[0][2], db)
  t.is(paymentInstanceStub.init.callCount, 1)
  t.alike(paymentOrder.payments, [paymentInstanceStub])
  t.ok(paymentOrder.id)

  t.is(paymentOrder.state, ORDER_STATE.INITIALIZED)
})

test('serialize', async t => {
  const db = new DB()
  await db.init()

  const params = { ...orderParams, type: ORDER_TYPE.ONE_TIME }
  const orderConfig = { sendingPriority: ['p2sh', 'lightning'] }

  const paymentOrder = new PaymentOrder(params, orderConfig, db)
  const serialized = paymentOrder.serialize()
  t.alike(serialized, {
    id: null,
    clientOrderId: params.clientOrderId,
    type: params.type,
    frequency: null,
    amount: params.amount,
    currency: 'BTC',
    denomination: 'BASE',
    targetURL: params.targetURL,
    memo: '',
    sendingPriority: orderConfig.sendingPriority,
    state: ORDER_STATE.CREATED
  })
})

test('PaymentOrder - save', async t => {
  const paymentInstanceStub = {
    init: sinon.stub().resolves(),
    save: sinon.stub().resolves()
  }
  const paymentClassStub = sinon.stub().returns(paymentInstanceStub)

  const { PaymentOrder } = proxyquire('../../src/payments/PaymentOrder', {
    './Payment': {
      Payment: paymentClassStub
    }
  })

  const db = new DB()
  await db.init()

  const params = { ...orderParams, type: ORDER_TYPE.ONE_TIME }
  const orderConfig = { sendingPriority: ['p2sh', 'lightning'] }

  const paymentOrder = new PaymentOrder(params, orderConfig, db)
  await paymentOrder.init()
  await paymentOrder.save()

  t.ok(paymentOrder.id)
  t.is(paymentInstanceStub.init.callCount, 1)
  t.is(paymentInstanceStub.save.callCount, 1)
})

test('PaymentOrder - update', async t => {
  const paymentInstanceStub = {
    init: sinon.stub().resolves(),
    save: sinon.stub().resolves()
  }
  const paymentClassStub = sinon.stub().returns(paymentInstanceStub)

  const { PaymentOrder } = proxyquire('../../src/payments/PaymentOrder', {
    './Payment': {
      Payment: paymentClassStub
    }
  })

  const db = new DB()
  await db.init()

  const params = { ...orderParams, type: ORDER_TYPE.ONE_TIME }
  const orderConfig = { sendingPriority: ['p2sh', 'lightning'] }

  const paymentOrder = new PaymentOrder(params, orderConfig, db)
  await paymentOrder.init()
  await paymentOrder.save()

  t.ok(paymentOrder.id)
  t.is(paymentInstanceStub.init.callCount, 1)
  t.is(paymentInstanceStub.save.callCount, 1)

  paymentOrder.state = ORDER_STATE.CANCELLED
  await paymentOrder.update()

  const got = await db.get(paymentOrder.id)

  t.alike(got, paymentOrder.serialize())
  t.is(paymentOrder.state, ORDER_STATE.CANCELLED)
})

test('PaymentOrder - complete', async t => {
  const paymentInstanceStub = {
    init: sinon.stub().resolves(),
    save: sinon.stub().resolves()
  }
  const paymentClassStub = sinon.stub().returns(paymentInstanceStub)

  const { PaymentOrder } = proxyquire('../../src/payments/PaymentOrder', {
    './Payment': {
      Payment: paymentClassStub
    }
  })

  const db = new DB()
  await db.init()

  const params = { ...orderParams, type: ORDER_TYPE.ONE_TIME }
  const orderConfig = { sendingPriority: ['p2sh', 'lightning'] }

  const paymentOrder = new PaymentOrder(params, orderConfig, db)
  await paymentOrder.init()
  await paymentOrder.save()

  t.ok(paymentOrder.id)
  t.is(paymentInstanceStub.init.callCount, 1)
  t.is(paymentInstanceStub.save.callCount, 1)

  paymentOrder.state = ORDER_STATE.CANCELLED
  await paymentOrder.update()

  await t.exception(async () => {
    await paymentOrder.complete()
  }, ERROR.ORDER_CANCELLED)

  paymentOrder.state = ORDER_STATE.PROCESSING
  await paymentOrder.update()

  paymentOrder.payments[0].state = PAYMENT_STATE.COMPLETED

  await paymentOrder.complete()
  t.is(paymentOrder.state, ORDER_STATE.COMPLETED)
})

test('PaymentOrder - cancel', async t => {
  const paymentInstanceStub = {
    init: sinon.stub().resolves(),
    save: sinon.stub().resolves(),
    cancel: sinon.stub().resolves()
  }
  const paymentClassStub = sinon.stub().returns(paymentInstanceStub)

  const { PaymentOrder } = proxyquire('../../src/payments/PaymentOrder', {
    './Payment': {
      Payment: paymentClassStub
    }
  })

  const db = new DB()
  await db.init()

  const params = { ...orderParams, type: ORDER_TYPE.ONE_TIME }
  const orderConfig = { sendingPriority: ['p2sh', 'lightning'] }

  const paymentOrder = new PaymentOrder(params, orderConfig, db)
  await paymentOrder.init()
  await paymentOrder.save()

  t.ok(paymentOrder.id)
  t.is(paymentInstanceStub.init.callCount, 1)
  t.is(paymentInstanceStub.save.callCount, 1)

  await paymentOrder.cancel()

  t.is(paymentOrder.state, ORDER_STATE.CANCELLED)
  t.is(paymentInstanceStub.cancel.callCount, 1)
})

test('PaymentOrder - process', async t => {
  const paymentInstanceStub = {
    init: sinon.stub().resolves(),
    save: sinon.stub().resolves(),
    process: sinon.stub().resolves('payment')
  }
  const paymentClassStub = sinon.stub().returns(paymentInstanceStub)

  const { PaymentOrder } = proxyquire('../../src/payments/PaymentOrder', {
    './Payment': {
      Payment: paymentClassStub
    }
  })

  const db = new DB()
  await db.init()

  const params = { ...orderParams, type: ORDER_TYPE.ONE_TIME }
  const orderConfig = { sendingPriority: ['p2sh', 'lightning'] }

  const paymentOrder = new PaymentOrder(params, orderConfig, db)
  await paymentOrder.init()
  await paymentOrder.save()

  t.ok(paymentOrder.id)
  t.is(paymentInstanceStub.init.callCount, 1)
  t.is(paymentInstanceStub.save.callCount, 1)

  const payment = await paymentOrder.process()

  t.is(paymentOrder.state, ORDER_STATE.PROCESSING)
  t.is(paymentInstanceStub.process.callCount, 1)
  t.is(payment, 'payment')
})

test('PaymentOrder - find', async t => {
  const paymentInstanceStub = {
    init: sinon.stub().resolves(),
    save: sinon.stub().resolves()
  }
  const paymentClassStub = sinon.stub().returns(paymentInstanceStub)

  const { PaymentOrder } = proxyquire('../../src/payments/PaymentOrder', {
    './Payment': {
      Payment: paymentClassStub
    }
  })

  const db = new DB()
  await db.init()

  const params = { ...orderParams, type: ORDER_TYPE.ONE_TIME }
  const orderConfig = { sendingPriority: ['p2sh', 'lightning'] }

  const paymentOrder = new PaymentOrder(params, orderConfig, db)
  await paymentOrder.init()
  const id = paymentOrder.id
  await paymentOrder.save()

  const got = await PaymentOrder.find(id, db)
  t.alike(got.serialize(), paymentOrder.serialize())
})
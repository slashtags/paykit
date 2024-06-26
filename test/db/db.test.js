const { test } = require('brittle')
const { v4: uuidv4 } = require('uuid')

const { DB } = require('../../src/DB/index.js')
const { dropTables } = require('../helpers')

function createPayment () {
  return {
    id: uuidv4(),
    orderId: uuidv4(),
    clientOrderId: uuidv4(),
    counterpartyURL: 'slash:XXXXXXX',
    memo: 'test memo',
    sendingPriority: ['p2sh', 'p2tr'],
    createdAt: Date.now() - 100000,
    executeAt: Date.now() + 100000,
    direction: 'OUT',
    amount: '100',
    currency: 'BTC',
    denomination: 'BASE',
    internalState: 'pending',
    pendingPlugins: ['p2sh'],
    triedPlugins: [
      {
        name: 'p2tr',
        startAt: Date.now() - 1000,
        state: 'failed',
        endAt: Date.now() - 100
      }
    ],
    currentPlugin: {},
    completedByPlugin: {}
  }
}

function createOrder () {
  return {
    id: uuidv4(),
    clientOrderId: uuidv4(),
    state: 'initialized',
    frequency: 1,
    counterpartyURL: 'slash:kx7uuapc1gshfprg1hkethco8fuz7gue19u3od1i5xbhs84mhiho',
    memo: '',
    sendingPriority: ['p2sh', 'p2tr'],
    amount: '1',
    currency: 'BTC',
    denomination: 'BASE',
    createdAt: Date.now() - 100000,
    firstPaymentAt: Date.now() + 100000
  }
}

function comparePayments (t, a, b) {
  t.is(a.id, b.id)
  t.is(a.orderId, b.orderId)
  t.is(a.clientOrderId, b.clientOrderId)
  t.is(a.counterpartyURL, b.counterpartyURL)
  t.is(a.memo, b.memo)
  t.is(a.amount, b.amount)
  t.is(a.denomination, b.denomination)
  t.is(a.currency, b.currency)
  t.is(a.internalState, b.internalState)
  t.is(a.direction, b.direction)
  t.is(a.createdAt, b.createdAt)
  t.is(a.executeAt, b.executeAt)

  t.alike(a.sendingPriority, b.sendingPriority)
  t.alike(a.pendingPlugins, b.pendingPlugins)
  t.alike(a.triedPlugins, b.triedPlugins)
  t.alike(a.currentPlugin, b.currentPlugin)
  t.alike(a.completedByPlugin, b.completedByPlugin)
}

function compareOrders (t, a, b) {
  t.is(a.id, b.id)
  t.is(a.clientOrderId, b.clientOrderId)
  t.is(a.counterpartyURL, b.counterpartyURL)
  t.is(a.memo, b.memo)
  t.is(a.amount, b.amount)
  t.is(a.denomination, b.denomination)
  t.is(a.currency, b.currency)
  t.is(a.state, b.state)
  t.is(a.createdAt, b.createdAt)
  t.is(a.firstPaymentAt, b.firstPaymentAt)
  if (a.lastPaymentAt || b.lastPaymentAt) t.is(a.lastPaymentAt, b.lastPaymentAt)

  t.alike(a.sendingPriority, b.sendingPriority)
}

test('constructor', async (t) => {
  const db = new DB({ name: 'test', path: './test_db' })

  t.ok(db.db)
})

test('db.saveOutgoingPayment', async (t) => {
  const payment = createPayment()

  const db = new DB({ name: 'test', path: './test_db' })

  await db.saveOutgoingPayment(payment)
  const res = await db.getOutgoingPayment(payment.id)

  comparePayments(t, res, payment)

  await t.teardown(async () => {
    await dropTables(db)
  })
})

test('db.getOutgoingPayment', async (t) => {
  const payment1 = createPayment()
  const payment2 = createPayment()

  const db = new DB({ name: 'test', path: './test_db' })

  await db.saveOutgoingPayment(payment1)
  await db.saveOutgoingPayment(payment2)

  const res1 = await db.getOutgoingPayment(payment1.id)
  const res2 = await db.getOutgoingPayment(payment2.id)

  comparePayments(t, res1, payment1)
  comparePayments(t, res2, payment2)

  await t.teardown(async () => {
    await dropTables(db)
  })
})

test('db.updateOutgoingPayment', async (t) => {
  const payment = createPayment()

  const db = new DB({ name: 'test', path: './test_db' })
  await db.saveOutgoingPayment(payment)

  const res = await db.getOutgoingPayment(payment.id)

  comparePayments(t, res, payment)

  await db.updateOutgoingPayment(payment.id, { internalState: 'completed' })

  const updated = await db.getOutgoingPayment(payment.id)

  t.is(updated.internalState, 'completed')
  t.is(updated.id, payment.id)

  await t.teardown(async () => {
    await dropTables(db)
  })
})

test('db.getOutgoingPayment - removed', async (t) => {
  const payment1 = createPayment()
  const payment2 = createPayment()

  const db = new DB({ name: 'test', path: './test_db' })

  await db.saveOutgoingPayment(payment1)
  await db.saveOutgoingPayment(payment2)

  await db.updateOutgoingPayment(payment1.id, { removed: true })

  const res1 = await db.getOutgoingPayment(payment1.id)
  const res2 = await db.getOutgoingPayment(payment2.id)

  t.absent(res1, undefined)
  comparePayments(t, res2, payment2)

  const resA = await db.getOutgoingPayment(payment1.id, { removed: '*' })
  const resR = await db.getOutgoingPayment(payment1.id, { removed: true })

  comparePayments(t, resA, resR)

  await t.teardown(async () => {
    await dropTables(db)
  })
})

test('db.getOutgoingPayments', async (t) => {
  const payment1 = createPayment()
  const payment2 = createPayment()
  const payment3 = createPayment()

  const db = new DB({ name: 'test', path: './test_db' })

  await db.saveOutgoingPayment(payment1)
  await db.saveOutgoingPayment(payment2)
  await db.saveOutgoingPayment(payment3)

  await db.updateOutgoingPayment(payment2.id, { internalState: 'completed', direction: 'incomming' })
  const res = await db.getOutgoingPayments({ internalState: 'pending', memo: 'test memo' })

  t.is(res.length, 3)
  t.is(res.find((r) => r.id === payment1.id).id, payment1.id)
  t.is(res.find((r) => r.id === payment3.id).id, payment3.id)

  await t.teardown(async () => {
    await dropTables(db)
  })
})

test('db.saveOrder', async (t) => {
  const order = createOrder()

  const db = new DB({ name: 'test', path: './test_db' })

  await db.saveOrder(order)
  const res = await db.getOrder(order.id)

  compareOrders(t, res, order)

  await t.teardown(async () => {
    await dropTables(db)
  })
})

test('db.getOrder', async (t) => {
  const order1 = createOrder()
  const order2 = createOrder()

  const db = new DB({ name: 'test', path: './test_db' })

  await db.saveOrder(order1)
  await db.saveOrder(order2)

  const res1 = await db.getOrder(order1.id)
  const res2 = await db.getOrder(order2.id)

  compareOrders(t, res1, order1)
  compareOrders(t, res2, order2)

  await t.teardown(async () => {
    await dropTables(db)
  })
})

test('db.updateOrder', async (t) => {
  const order = createOrder()

  const db = new DB({ name: 'test', path: './test_db' })
  await db.saveOrder(order)

  const res = await db.getOrder(order.id)

  compareOrders(t, res, order)

  await db.updateOrder(order.id, { state: 'completed' })

  const updated = await db.getOrder(order.id)

  t.is(updated.state, 'completed')
  t.is(updated.id, order.id)

  await t.teardown(async () => {
    await dropTables(db)
  })
})

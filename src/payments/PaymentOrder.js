const logger = require('slashtags-logger')('Paykit', 'payment-order')

const { v4: uuidv4 } = require('uuid')

const { PaymentObject, ERRORS: PaymentErrors } = require('./PaymentObject')
const { PaymentAmount } = require('./PaymentAmount')
/**
 * Payment Order class
 * @class PaymentOrder - This class is used to create a payments
 * @property {string} id - Order id
 * @property {string} clientOrderId - Client order id
 * @property {string} state - Order state
 * @property {number} frequency - Order frequency in milliseconds, 0 for one time order
 * @property {PaymentObject[]} payments - Payments associated with this order
 * @property {PaymentAmount} amount - Payment amount
 * @property {string} counterpartyURL - Counterparty URL
 * @property {string} memo - Memo
 * @property {string} sendingPriority - Sending priority
 * @property {object} orderParams - Order params
 * @property {object} db - Database
 * @property {object} TransportConnector - transportConnector
 * @property {Date} createdAt - Order creation timestamp
 * @property {Date} firstPaymentAt - Order execution timestamp
 * @property {Date} lastPaymentAt - Last payment timestamp
 */

const CONFIG = {
  MIN_FREQUENCY: 1, // 1 ms
  BATCH_SIZE: 100 // 100 payments
}

class PaymentOrder {
  static generateId () {
    return uuidv4()
  }

  /**
   * @method validateInput - Validate order params
   * @param {object} orderParams - Order params
   * @returns {void}
   * @throws {Error} - Throws error if order params are invalid
   */
  static validateInput (orderParams) {
    logger.debug(`Validating order params ${JSON.stringify(orderParams)}`)
    if (!orderParams) throw new Error(ERRORS.NO_ORDER_PARAMS)

    PaymentOrder.validateFrequency(orderParams)
    PaymentOrder.validateTimestamps(orderParams)

    if (!orderParams.counterpartyURL) throw new Error(PaymentErrors.COUTNERPARTY_REQUIRED)
  }

  /**
   * @method validateFrequency - Validate order frequency
   * @param {object} orderParams - Order params
   * @returns {void}
   * @throws {Error} - Throws error if order frequency is invalid
   */
  static validateFrequency (orderParams) {
    if (!orderParams.frequency) return

    const frequency = parseFloat(orderParams.frequency)
    if (frequency === 0) return

    if (isNaN(frequency)) throw new Error(ERRORS.INVALID_FREQUENCY(orderParams.frequency))
    if (frequency < CONFIG.MIN_FREQUENCY) throw new Error(ERRORS.INVALID_FREQUENCY(orderParams.frequency))
  }

  /**
   * @method validateTimestamps - Validate order timestamps
   * @param {object} orderParams - Order params
   * @returns {void}
   * @throws {Error} - Throws error if order timestamps are invalid
   */
  static validateTimestamps (orderParams) {
    PaymentOrder.validateTimestamp(orderParams, 'createdAt')
    PaymentOrder.validateTimestamp(orderParams, 'firstPaymentAt')
    PaymentOrder.validateTimestamp(orderParams, 'lastPaymentAt')
  }

  static validateTimestamp (orderParams, timestampName) {
    if (!orderParams[timestampName]) return

    const timestamp = new Date(orderParams[timestampName])
    if (isNaN(timestamp.getTime())) throw new Error(ERRORS.INVALID_TIMESTAMP(timestampName, orderParams[timestampName]))
  }

  /**
   * @constructor - PaymentOrder constructor
   * @param {object} orderParams - Order params
   * @param {object} db - Database
   * @returns {PaymentOrder}
   */
  constructor (orderParams, db, transportConnector) {
    logger.info('Creating payment order')
    logger.debug(`Creating payment order with ${JSON.stringify(orderParams)}`)

    PaymentOrder.validateInput(orderParams)

    this.orderParams = orderParams
    this.db = db
    this.transportConnector = transportConnector

    this.id = orderParams.id || null
    this.clientOrderId = orderParams.clientOrderId

    this.state = orderParams.state || ORDER_STATE.CREATED

    this.createdAt = orderParams.createdAt || Date.now()
    this.firstPaymentAt = orderParams.firstPaymentAt || Date.now()
    this.lastPaymentAt = orderParams.lastPaymentAt || null

    this.frequency = orderParams.frequency ? parseFloat(orderParams.frequency) : 0
    if (this.frequency === 0) {
      this.lastPaymentAt = this.firstPaymentAt
    }

    this.payments = []

    this.amount = new PaymentAmount(orderParams)
    this.counterpartyURL = orderParams.counterpartyURL
    this.memo = orderParams.memo || ''
    this.sendingPriority = orderParams.sendingPriority

    this.logger = {
      debug: (msg) => { logger.debug.extend(JSON.stringify(this.serialize()))({ msg }) },
      info: (msg) => { logger.info.extend(JSON.stringify(this.serialize()))({ msg }) }
    }
  }

  /**
   * @method init - Initialize order and create payments
   * @returns {Promise<void>}
   */
  async init () {
    this.logger.info('Initializing payment order')
    this.id = PaymentOrder.generateId()
    this.state = ORDER_STATE.INITIALIZED

    this.frequency === 0 ? this.createPaymentObjects(1) : this.createPaymentForRecurringOrder()

    await this.save()
  }

  /**
   * Create recurring order
   * @returns {void}
   */
  createPaymentForRecurringOrder () {
    this.logger.debug('Initializing recurring payment order')
    // For permanently recurring payments we will create them in batches of 100
    let counter
    if (this.lastPaymentAt) {
      counter = Math.floor((this.lastPaymentAt - this.firstPaymentAt) / this.frequency)
    } else {
      counter = CONFIG.BATCH_SIZE
    }

    this.createPaymentObjects(counter)
  }

  /**
   * Create payments
   * @param {number} counter - Number of payments to create
   * @returns {void}
   */
  createPaymentObjects (counter) {
    this.logger.info(`Creating ${counter} payments`)
    for (let i = 0; i < counter; i++) {
      this.payments.push(new PaymentObject({
        ...this.orderParams,
        executeAt: this.firstPaymentAt + this.frequency * i,
        orderId: this.id
      }, this.db, this.transportConnector))
    }
  }

  /**
   * @method process - Process order
   * @returns {Promise<PaymentObject>}
   */
  async process () {
    this.logger.info('Processing payment order')
    if (!this.canProcess()) throw new Error(ERRORS.CAN_NOT_PROCESS_ORDER)

    const paymentInProgress = this.getPaymentInProgress()
    if (paymentInProgress) return await paymentInProgress.process()

    const payment = await this.getFirstOutstandingPayment()
    if (!payment) return await this.complete()

    this.logger.debug(`Processing payment ${payment.id}`)

    return await this.processPayment(payment)
  }

  /**
   * Checks if order is ready to be processed
   * @method canProcess
   * @returns {boolean}
   */
  canProcess () {
    // NOTE: stop processing subscription is one payment failed
    const failedPayments = this.payments.find((payment) => payment.isFailed())
    if (failedPayments) return false

    return this.state === ORDER_STATE.INITIALIZED || this.state === ORDER_STATE.PROCESSING
  }

  /**
   * @method processPayment - Process payment
   * @param {PaymentObject} payment - Payment to process
   * @returns {Promise<PaymentObject>}
   */
  async processPayment (payment) {
    if (payment.executeAt > Date.now()) return payment

    await payment.init()
    if (!payment.id) await payment.save()
    await payment.update()

    if (this.state !== ORDER_STATE.PROCESSING) {
      this.state = ORDER_STATE.PROCESSING
      await this.update()
    }

    return await payment.process()
  }

  /**
   * @method getFirstOutstandingPayment - Get first outstanding payment
   * @returns {PaymentObject}
   */
  async getFirstOutstandingPayment () {
    this.logger.debug('Getting first outstanding payment')
    const payment = this.payments.find((payment) => !payment.isFinal())
    if (payment) return payment

    if (this.frequency === 0) return null
    if (this.lastPaymentAt && this.lastPaymentAt < Date.now()) return null

    await this.createPaymentForRecurringOrder()
    await this.update()

    return this.payments.find((payment) => !payment.isFinal())
  }

  /**
   * @method getPaymentInProgress - Get payment in progress
   * @returns {PaymentObject}
   */
  getPaymentInProgress () {
    return this.payments.find((payment) => payment.isInProgress())
  }

  /**
   * @method complete - Complete order
   * @throws {Error} - If order is already completed
   * @throws {Error} - If order is cancelled
   * @returns {Promise<PaymentObject>} - Last payment
   */
  async complete () {
    this.logger.debug('Completing payment order')
    if (this.state === ORDER_STATE.CANCELLED) throw new Error(ERRORS.ORDER_CANCELLED)
    if (this.state === ORDER_STATE.COMPLETED) throw new Error(ERRORS.ORDER_COMPLETED)

    if (this.payments.every((payment) => payment.internalState.isFinal())) {
      this.state = ORDER_STATE.COMPLETED
      await this.update()
    } else {
      throw new Error(ERRORS.OUTSTANDING_PAYMENTS)
    }

    return this.payments[this.payments.length - 1]
  }

  /**
   * @method cancel - Cancel order and all outstanding payments
   * @throws {Error} - If order is already completed
   * @returns {Promise<void>}
   */
  async cancel () {
    this.logger.debug('Cancelling payment order')
    if (this.state === ORDER_STATE.COMPLETED) throw new Error(ERRORS.ORDER_COMPLETED)

    for (const payment of this.payments) {
      if (payment.isFinal()) continue

      await payment.cancel()
    }

    this.state = ORDER_STATE.CANCELLED
    await this.db.updateOrder (this.id, { state: this.state })
  }

  /**
   * Returns string representation of payment state used for logging
   */
  [Symbol.for('nodejs.util.inspect.custom')] () {
    return JSON.stringify(this.serialize())
  }

  /**
   * @method serialize - serialize order
   * @returns {Object}
   */
  serialize () {
    return {
      id: this.id,
      clientOrderId: this.clientOrderId,
      state: this.state,
      frequency: this.frequency,

      counterpartyURL: this.counterpartyURL,
      memo: this.memo,
      sendingPriority: this.sendingPriority,
      ...this.amount.serialize(),

      createdAt: this.createdAt,
      firstPaymentAt: this.firstPaymentAt,
      lastPaymentAt: this.lastPaymentAt
    }
  }

  /**
   * @method save - Save order with all corresponding payments to db, also used to add new payments to existing order
   * @returns {Promise<void>}
   */
  async save () {
    this.logger.debug('Saving payment order')
    const orderObject = this.serialize()
    for (const payment of this.payments) {
      await payment.save()
    }
    await this.db.saveOrder(orderObject)
  }

  /**
   * @method update - Update order in db if persist is true, order will be saved to db,
   * if persist is false, it will return { statement,  params }
   * @returns {Promise<Database| { statement: string, params: object }>}
   */
  async update (persist = true) {
    this.logger.debug('Updating payment order')

    const serialized = this.serialize()
    PaymentOrder.validateInput(serialized)

    return await this.db.updateOrder(this.id, serialized, persist)
  }

  /**
   * @static find - Find order by id in db
   * @param {string} id - Order id
   * @param {DB} db - DB instance
   * @param {TransportConnector} transportConnector - TransportConnector instance
   * @returns {Promise<PaymentOrder>}
   */
  static async find (id, db, transportConnector) {
    const orderParams = await db.getOrder(id)
    if (!orderParams) throw new Error(ERRORS.ORDER_NOT_FOUND(id))

    const paymentOrder = new PaymentOrder(orderParams, db)
    paymentOrder.payments = (await db.getOutgoingPayments({ orderId: id })).map(p => new PaymentObject(p, db, transportConnector))

    return paymentOrder
  }
}

/**
 * @typedef {Obejct} ERRROS
 * @property {string} NOT_IMPLEMENTED
 * @property {string} ORDER_PARAMS_REQUIRED
 * @property {string} ORDER_AMOUNT_REQUIRED
 * @property {string} ORDER_COUNTERPARTY_URL_REQUIRED
 * @property {string} ORDER_CLIENT_ORDER_ID_REQUIRED
 * @property {string} ORDER_CONFIG_REQUIRED
 * @property {string} ORDER_CONFIG_SENDING_PARTY_REQUIRED
 * @property {string} DB_REQUIRED
 * @property {string} OUTSTANDING_PAYMENTS
 * @property {string} ORDER_CANCELLED
 * @property {string} ORDER_COMPLETED
 * @property {string} CAN_NOT_PROCESS_ORDER
 * @property {function} ORDER_NOT_FOUND
 * @property {function} INVALID_FREQUENCY
 * @property {function} INVALID_TIMESTAMP
 */
const ERRORS = {
  NOT_IMPLEMENTED: 'Not implemented',
  ORDER_PARAMS_REQUIRED: 'Order params are required',
  ORDER_AMOUNT_REQUIRED: 'Order amount is required',
  ORDER_COUNTERPARTY_URL_REQUIRED: 'Order coutnerparty url is required',
  ORDER_CLIENT_ORDER_ID_REQUIRED: 'Order client order id is required',
  ORDER_CONFIG_REQUIRED: 'Order config is required',
  ORDER_CONFIG_SENDING_PARTY_REQUIRED: 'Order config sending party is required',
  DB_REQUIRED: 'DB is required',
  OUTSTANDING_PAYMENTS: 'There are outstanding payments',
  ORDER_CANCELLED: 'Order is cancelled',
  ORDER_COMPLETED: 'Order is completed',
  CAN_NOT_PROCESS_ORDER: 'Can not process order',
  ORDER_NOT_FOUND: (id) => `Order with id ${id} not found`,
  INVALID_FREQUENCY: (frequency) => `Invalid frequency ${frequency}`,
  INVALID_TIMESTAMP: (tsName, value) => `Invalid timestamp ${tsName}: ${value}`
}

/**
 * @typedef {Object} ORDER_STATE
 * @property {string} CREATED
 * @property {string} INITIALIZED
 * @property {string} PROCESSING
 * @property {string} COMPLETED
 * @property {string} CANCELLED
 */
const ORDER_STATE = {
  CREATED: 'created',
  INITIALIZED: 'initialized',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
}

module.exports = { PaymentOrder, ORDER_STATE, ERRORS }

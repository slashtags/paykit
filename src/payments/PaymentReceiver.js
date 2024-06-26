const { v4: uuidv4 } = require('uuid')

const { PaymentIncoming, PAYMENT_STATE } = require('./PaymentIncoming')
const { PaymentAmount } = require('./PaymentAmount')
const { SLASHPAY_PATH } = require('../transport')
/**
 * PaymentReceiver is a class which is responsible for making plugins to receive payments
 * @class PaymentReceiver
 */
class PaymentReceiver {
  /**
   * @constructor PaymentReceiver
   * @param {DB} db - instance of a database
   * @param {PluginManager} pluginManager - instance of a plugin manager
   * @param {RemoteStorage} storage - instance of a local storage (e.g. HyperDrive)
   * @param {Function} notificationCallback - callback which is called when payment is received
   */
  constructor (db, pluginManager, storage, notificationCallback) {
    this.db = db // internal state storage
    this.storage = storage // internal public interface
    this.notificationCallback = notificationCallback
    this.pluginManager = pluginManager
    this.ready = false
  }

  /**
   * Initialize, get ready to receive payments at returned URL
   * @param {PaymentAmount} [amount] - amount of money to receive
   * @returns {Promise<String>} - url to local drive where slashpay.json file is located
   */
  async init () {
    const paymentPluginNames = this.getListOfSupportedPaymentMethods()
    const { id, slashpayFile } = await this.generateSlashpayContent(paymentPluginNames)
    const url = await this.storage.create(SLASHPAY_PATH, slashpayFile, { awaitRelaySync: true })

    const payload = { id, notificationCallback: this.notificationCallback.bind(this) }

    await this.pluginManager.dispatchEvent('receivePayment', payload)
    this.ready = true

    return url
  }

  /**
   * Create private payment endpoints which are encrypted
   * @param {string} clientOrderId - invoice clientOrderId
   * @param {PaymentAmount} expectedAmount - expectedAmount of money to receive
   * @returns {Promise<String>} - url to local drive where slashpay.json file is located
  */
  async createInvoice (clientOrderId, expectedAmount) {
    const paymentPluginNames = this.getListOfSupportedPaymentMethods()
    const { slashpayFile, id } = await this.generateSlashpayContent(paymentPluginNames, clientOrderId)

    const url = await this.storage.create(`slashpay/${clientOrderId}/slashpay.json`, slashpayFile, { encrypt: true, awaitRelaySync: true })

    const payload = {
      id,
      clientOrderId,
      notificationCallback: this.notificationCallback.bind(this)
    }
    const serializedAmount = expectedAmount.serialize()
    payload.expectedAmount = serializedAmount.amount
    payload.expectedCurrency = serializedAmount.currency
    payload.expectedDenomination = serializedAmount.denomination

    await this.pluginManager.dispatchEvent('receivePayment', payload)
    this.ready = true

    await this.createPayment(payload, true)

    return url
  }

  /**
   * Sotres payload (generated by plugin) data in to file
   * @param {Object} payload - payload to receive payment
   */
  async createPaymentFile (payload, path = `/public/slashpay/${payload.pluginName}/slashpay.json`) {
    const opts = { awaitRelaySync: true }

    if (payload.isPersonalPayment) {
      if (!payload.clientOrderId) throw new Error(ERRORS.PAYLOAD_CLIENT_ORDER_ID_IS_MISSING)

      opts.encrypt = true
      path = `/slashpay/${payload.clientOrderId}/${payload.pluginName}/slashpay.json`
    }

    await this.storage.create(path, payload.data, opts)
  }

  /**
   * Callback which is called by plugin when payment is received
   * @param {Object} payload - payment object
   * @returns {Promise<void>}
   */
  async handleNewPayment (payload, regenerateSlashpay = true) {
    let result
    let amountDue = null
    if (payload.isPersonalPayment) {
      const { paymentObject, missingAmount } = await this.updatePayment(payload)
      result = paymentObject
      amountDue = missingAmount
    } else {
      // id here is not really needed and cause troubles when receiving payment in two different plugins
      // TODO: consider not generating id for non-personal payments
      delete payload.id
      result = await this.createPayment(payload)
    }

    // TODO: if regenerateSlashpay is true or if amount was not specified
    // if amount was specified and does not match - do not regenerate
    if (regenerateSlashpay) {
      await this.init()
    }

    if (payload.isPersonalPayment && amountDue) {
      result.amountDue = amountDue
      result.invoiceURL = await this.createInvoice(payload.clientOrderId, amountDue)
    }

    // TODO: send different notifications is amount was specified but was not matched
    await this.notificationCallback(result)
  }

  async updatePayment (payload) {
    const paymentObject = await this.db.getIncomingPayment(payload.id)
    if (!paymentObject) throw new Error('PAYMENT_OBJECT_NOT_FOUND')

    if (paymentObject.expectedCurrency !== payload.currency) throw new Error('PAYMENT_CURRENCY_MISMATCH')
    // XXX: conversion might be supported in the future
    if (paymentObject.expectedDenomination !== payload.denomination) throw new Error('PAYMENT_DENOMINATION_MISMATCH')

    const update = {
      receivedByPlugins: [...paymentObject.receivedByPlugins, {
        name: payload.pluginName,
        state: payload.state,
        amount: payload.amount,
        rawData: payload.rawData,
        receivedAt: Date.now()
      }]
    }

    if (payload.amount === paymentObject.expectedAmount) {
      update.amount = payload.amount
    }

    let missingAmount = null
    const totalReceivedAmount = update.receivedByPlugins.reduce((acc, { amount }) => acc + parseInt(amount), 0)
    if (totalReceivedAmount >= parseInt(paymentObject.expectedAmount)) {
      update.internalState = PAYMENT_STATE.COMPLETED
    } else {
      missingAmount = new PaymentAmount({
        amount: (parseInt(paymentObject.expectedAmount) - totalReceivedAmount).toString()
      })
      update.internalState = PAYMENT_STATE.IN_PROGRESS
    }

    await this.db.updateIncomingPayment(payload.id, update)
    const res = await this.db.getIncomingPayment(payload.id)

    return { paymentObject: res, missingAmount }
  }

  async createPayment (payload, initial = false) {
    const input = {
      id: payload.id || uuidv4(),

      // FROM PAYLOAD
      clientOrderId: payload.clientOrderId,
      memo: payload.memo || '' // send it in payload
    }

    if (initial) {
      input.expectedAmount = payload.expectedAmount
      input.expectedDenomination = payload.expectedDenomination || 'BASE'
      input.expectedCurrency = payload.expectedCurrency || 'BTC'
      input.receivedByPlugins = []
    } else {
      input.receivedByPlugins = [{
        name: payload.pluginName,
        state: payload.state,
        amount: payload.amount,
        rawData: payload.rawData,
        receivedAt: Date.now()
      }]
      input.internalState = PAYMENT_STATE.COMPLETED
    }

    if (!payload.isPersonalPayment && !initial) {
      input.amount = payload.amount
      input.denomination = payload.denomination || 'BASE'
      input.currency = payload.currency || 'BTC'
    }

    const paymentObject = new PaymentIncoming(input, this.db)
    await paymentObject.save()

    return paymentObject
  }

  /**
   * @method generateSlashpayContent
   * @param {Array<String>} paymentPluginNames - list of payment plugin names
   * @param {string} [clientOrderId] - id of invoice
   * @returns {Object} - content of slashpay.json file
   */
  async generateSlashpayContent (paymentPluginNames, clientOrderId) {
    const slashpayFile = { paymentEndpoints: {} }
    const opts = {}
    if (clientOrderId) {
      opts.encrypt = true
    }

    for (const name of paymentPluginNames) {
      slashpayFile.paymentEndpoints[name] = await this.storage.getUrl(...this.getUrlParams(name, clientOrderId), opts)
    }

    return {
      id: uuidv4(), // this is id of payment forwarded to plugin and back
      slashpayFile
    }
  }

  getUrlParams (name, clientOrderId) {
    let p
    const opts = {}
    if (!clientOrderId) {
      clientOrderId = uuidv4()
      p = `/public/slashpay/${name}/slashpay.json`
    } else {
      p = `/slashpay/${clientOrderId}/${name}/slashpay.json`
      opts.encrypt = true
    }
    return [p, opts]
  }

  /**
   * @method getListOfSupportedPaymentMethods
   * @returns {Array<String>} - list of payment plugin names
   */
  getListOfSupportedPaymentMethods () {
    return Object.entries(this.pluginManager.getPlugins(true))
      .filter(([_name, { manifest }]) => manifest.type === 'payment')
      .map(([name, _plugin]) => name)
  }
}

const ERRORS = {
  PAYMENT_RECEIVER_NOT_READY: 'PAYMENT_RECEIVER_NOT_READY',
  PAYLOAD_CLIENT_ORDER_ID_IS_MISSING: 'CLIENT_ORDER_ID_IS_MISSING',
  PAYMENT_OBJECT_NOT_FOUND: 'PAYMENT_OBJECT_NOT_FOUND'
}

module.exports = {
  PaymentReceiver,
  ERRORS
}

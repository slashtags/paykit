const { PluginManager } = require('../plugins/PluginManager')

const { Payment } = require('./Payment')
const { PaymentOrder } = require('./PaymentOrder')
const { PaymentSender } = require('./PaymentSender')
const { PaymentReceiver } = require('./PaymentReceiver')

const { SlashtagsAccessObject } = require('../SlashtagsAccessObject')

/**
 * @class PaymentManager - main class for payment management. Use this class to create, submit, receive and interact
 * with payments. It an implementation of a Facade Pattern. It hides all the complexity of the payment process.
 *
 * @param {Object} config - configuration object
 * @param {Object} config.db - configuration object for database
 * @param {String} config.db.path - path to the database
 * @property {Object} config - configuration object
 * @property {Database} db - instance of Database class
 * @property {Boolean} ready - flag to indicate if the payment manager is ready
 */
class PaymentManager {
  /**
   * @constructor
   * @param {Object} config - configuration object
   */
  constructor (config, db) {
    this.config = config
    this.db = db
    this.ready = false
  }

  /**
   * Initialize the payment manager
   * @returns {Promise<void>}
   */
  async init () {
    await this.db.init()
    this.ready = true
  }

  /**
   * Create a payment
   * @param {Object} paymentObject - payment object
   * @returns {Promise<PaymentOrder>} - instance of Payment class
   */
  async createPaymentOrder (paymentObject) {
    const paymentOrder = new PaymentOrder(paymentObject, this.db)
    await paymentOrder.init()

    return paymentOrder.serialize()
  }

  /**
   * Send a payment
   * @param {string} id - paymentOrder id
   * @returns {Promise<void>} - payment id
   */
  async sendPayment (id) {
    const pluginManager = new PluginManager(this.config)
    const paymentOrder = await PaymentOrder.find(id, this.db)
    const paymentSender = new PaymentSender(paymentOrder, pluginManager, this.entryPointForPlugin)
    await paymentSender.submit()
  }

  /**
   * Receive payments
   * @returns {Promise<string>}
   */
  // FIXME: enable handling of multiple drives. First guess is to to create one receiver per drive
  async receivePayments () {
    const storage = new SlashtagsAccessObject()
    await storage.init()

    const pluginManager = new PluginManager(this.config)

    await Promise.all(Object.keys(this.config.plugins).map(async (name) => {
      return await pluginManager.loadPlugin(name, storage)
    }))

    const paymentReceiver = new PaymentReceiver(this.db, pluginManager, storage, this.entryPointForPlugin)
    return await paymentReceiver.init()
  }

  /*
   * NOTE: things below right now are implemented as callback functions
   * but may alternatively be implemented as URLs for RPC APIs
   */

  /**
   * Entry point for plugins to send data to the payment manager
   * @param {Object} payload - payload object
   * @property {String} payload.pluginName - name of the plugin
   * @property {String} payload.paymentId - id of the payment
   * @property {String} payload.state - state of the payment
   * @property {String} payload.data - data to be sent to the payment manager
   * @returns {Promise<void>}
   */
  async entryPointForPlugin (payload) {
    if (payload instanceof Payment) {
      return await this.userNotificationEndpoint(payload)
    }

    // TODO: some other cases / default case?
  }

  /**
   * Entry point for users to send data to the payment manager which will be forwarded to plugin
   * @param {Object} data - data object
   * @param {String} data.paymentId - id of the related payment
   * @returns {Promise<void>}
   */
  // FIXME: this should go through PaymentSender for its update callbacks handling
  async entryPointForUser (data) {
    const pluginManager = new PluginManager(this.config)
    const { plugin } = await pluginManager.loadPlugin(data.pluginName)
    // TODO check if plugin active exists
    await plugin.updatePayment(data)
  }

  /**
   * Entry point for plugin to send notification to the user
   * @param {Object} payment - payment object
   * @returns {Promise<void>}
   */
  async userNotificationEndpoint (payment) {
    console.log('askClient', payment)
  }
}

module.exports = {
  PaymentManager
}

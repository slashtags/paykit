const { ERRORS: ORDER_ERRORS } = require('./PaymentOrder')
/**
 * PaymentSender - class for processing outgoing payment orders
 * @class PaymentSender
 */
class PaymentSender {
  /**
   * Creates an instance of PaymentSender.
   * @constructor PaymentSender
   * @param {PaymentOrder} paymentOrder
   * @param {PluginManager} pluginManager
   * @param {Function} entryPointForPlugin - callback to be called by plugin
   */
  constructor (paymentOrder, pluginManager, entryPointForPlugin) {
    this.paymentOrder = paymentOrder
    this.pluginManager = pluginManager
    this.entryPointForPlugin = entryPointForPlugin
  }

  /**
   * Submit payment to plugin
   * @method submit
   * @returns {Promise<void>}
   * @throws {Error} - if no plugins for making payment are available
   */
  // FIXME: should also accept id for private payments
  async submit () {
    const payment = await this.paymentOrder.process()

    const { plugin, manifest: { name } } = await this.getCurrentPlugin(payment)

    const serialized = payment.serialize()
    const payload = {
      id: serialized.id, // for identification upon feedback
      orderId: serialized.orderId, // for identification upon feedback
      memo: serialized.memo, // memo - nice to have
      amount: serialized.amount,
      currency: serialized.currency,
      denomination: serialized.denomination
    }

    const { paymentEndpoints } = await payment.transportConnector.readRemote(payment.counterpartyURL)
    const paymentUrl = paymentEndpoints[name]
    const target = await payment.transportConnector.readRemote(paymentUrl)
    if (!target) {
      payment.pluginUpdate = {
        pluginState: PLUGIN_STATES.FAILED,
        message: ERRORS.PAYMENT_TARGET_NOT_FOUND
      }
      return await this.handleFailure(payment)
    }

    await plugin.pay({
      target,
      payload,
      notificationCallback: this.stateUpdateCallback.bind(this)
    })
  }

  /**
   * Update payment - forwards data to plugin
   * @method updatePayment
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async updatePayment (data) {
    const payment = await this.paymentOrder.getPaymentInProgress()
    const { plugin } = await this.getCurrentPlugin(payment)

    await plugin.updatePayment(data)
  }

  /**
   * Get plugin currently handling payment
   * @method getCurrentPlugin
   * @param {PaymentObject} payment
   * @returns {Promise<Plugin>} plugin
   */
  async getCurrentPlugin (payment) {
    const currentPlugin = payment.getCurrentPlugin()

    if (!currentPlugin) throw new Error(ERRORS.NO_PLUGINS_AVAILABLE)

    const loaded = this.pluginManager.plugins[currentPlugin.name]
    if (loaded) {
      // XXX: this should never happen
      if (!loaded.active) throw new Error('Plugin is not active')

      return loaded
    } else {
      return await this.pluginManager.loadPlugin(currentPlugin.name)
    }
  }

  /**
   * Update payment state upon request of plugin sent to PaymentManager
   * @method stateUpdateCallback
   * @param {PaymentStateUpdate} update (must contain pluginState)
   * @returns {Promise<void>}
   */
  async stateUpdateCallback (update) {
    // XXX: this may be a bottle neck as it assumes that there is only one payment in progress at time
    const payment = this.paymentOrder.getPaymentInProgress()
    // XXX: this should never happen
    if (!payment) throw new Error('No payment in process')

    payment.pluginUpdate = update
    await payment.update()
    await this.handlePluginState(payment)
  }

  /**
   * Handle plugin state
   * @method handlePluginState
   * @param {PaymentObject} payment
   * @returns {Promise<void>}
   */
  async handlePluginState (payment) {
    // TODO: use constants for plugin states
    if (payment.pluginUpdate.pluginState === 'failed') {
      await this.handleFailure(payment)
    } else if (payment.pluginUpdate.pluginState === 'success') {
      await this.handleSuccess(payment)
    } else {
      // XXX: intermediate state which requires action from user
      await this.entryPointForPlugin(payment)
    }
  }

  /**
   * Handle payment failure
   * @method handleFailure
   * @param {PaymentObject} payment
   * @returns {Promise<void>}
   */
  async handleFailure (payment) {
    await payment.failCurrentPlugin()
    await this.entryPointForPlugin(payment.pluginUpdate) // report failed payment to user
    try {
      await this.submit() // retry with next plugin
    } catch (e) {
      if (e.message === ERRORS.NO_PLUGINS_AVAILABLE) return await this.entryPointForPlugin(e)

      throw e
    }
  }

  /**
   * Handle payment success
   * @method handleSuccess
   * @param {PaymentObject} payment
   * @returns {Promise<void>}
   */
  async handleSuccess (payment) {
    await payment.complete()
    // XXX: notifications for high frequency payments will be too much
    await this.entryPointForPlugin(payment)

    try {
      await this.paymentOrder.complete()
    } catch (e) {
      if (e.message === ORDER_ERRORS.OUTSTANDING_PAYMENTS) {
        // RECURRING PAYMENT territory
        await this.submit()

        await this.entryPointForPlugin({
          type: 'payment_order_partially_complete', // TODO: make this a constant
          data: this.paymentOrder
        })
        return
      }
      throw e
    }
  }
}

/**
 * @typedef {Object} ERRORS
 * @property {String} NO_PLUGINS_AVAILABLE
 * @property {String} PAYMENT_TARGET_NOT_FOUND
 */
const ERRORS = {
  NO_PLUGINS_AVAILABLE: 'No plugins available for making payment',
  PAYMENT_TARGET_NOT_FOUND: 'Payment target not found'
}

/**
 * @typedef {Object} PLUGIN_STATES
 * @property {String} FAILED
 * @property {String} SUCCESS
 */
const PLUGIN_STATES = {
  FAILED: 'failed',
  SUCCESS: 'success'
}

module.exports = {
  PaymentSender,
  PLUGIN_STATES,
  ERRORS
}

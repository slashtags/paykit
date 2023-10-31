const path = require('path')
const { v4: uuidv4 } = require('uuid')

const { PaymentObject, PAYMENT_DIRECTION, PAYMENT_STATE } = require('./PaymentObject')
const { SLASHPAY_PATH } = require('../slashtags')
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

  // TODO: make sure slashtags-data works with full spectrum of  private/public vs persisted/ephemeral

  /**
   * Initialize, get ready to receive payments at returned URL
   * @param {PaymentAmount} [amount] - amount of money to receive
   * @returns {Promise<String>} - url to local drive where slashpay.json file is located
   */
  async init (amount) {
    const paymentPluginNames = this.getListOfSupportedPaymentMethods()
    const { id, slashpayFile } = this.generateSlashpayContent(paymentPluginNames, amount)
    const url = await this.storage.create(SLASHPAY_PATH, slashpayFile)

    const payload = { id, notificationCallback: this.notificationCallback.bind(this) }

    if (amount) {
      payload.amount = amount.serialize()
    }

    await this.pluginManager.dispatchEvent('receivePayment', payload)

    // XXX what if some plugins failed to initialize?
    // we need some kind of a mechanism to track their readiness
    // this can be done via tracking list of plugins which were included into
    // slashpay.json file and return list as a result of this method
    // then each plugin should report its readiness via RPC notification endpoint
    // paymentPluginNames.forEach((name) => {
    //   this.pluginManager.plugins[name].readyToReceivePayments = false
    // })

    this.ready = true

    return url
  }

  /**
   * Callback which is called by plugin when payment is received
   * @param {Object} payload - payment object
   * @returns {Promise<void>}
   */
  async handleNewPayment (payload, regenerateSlashpay = true) {
    const paymentObject = new PaymentObject({
      orderId: uuidv4(),
      sendingPriority: [payload.pluginName],
      direction: PAYMENT_DIRECTION.IN,
      internalState: PAYMENT_STATE.COMPLETED,

      counterpartyURL: await this.storage.getUrl(), // we cant really know this so it may always be receiver

      completedByPlugin: {
        name: payload.pluginName,
        state: 'success', // XXX should I read it from plugin?
        startAt: Date.now(),
        endAt: Date.now()
      },

      // FROM PAYLOAD
      amount: payload.amount, // send it in payload
      memo: payload.memo || '', // send it in payload
      denomination: payload.denomination || 'BASE',
      currency: payload.currency || 'BTC',
      clientOrderId: payload.clientOrderId // send in payload
    }, this.db)
    await paymentObject.save()

    if (regenerateSlashpay) {
      await this.init()
    }

    await this.notificationCallback(paymentObject)
  }

  /**
   * @method generateSlashpayContent
   * @param {Array<String>} paymentPluginNames - list of payment plugin names
   * @param {PaymentAmount} [amount] - amount of money to receive
   * @returns {Object} - content of slashpay.json file
   */
  generateSlashpayContent (paymentPluginNames, amount) {
    const slashpayFile = { paymentEndpoints: {} }
    const id = uuidv4()

    paymentPluginNames.forEach((name) => {
      // FIXME: this implementation allows only one private payment at time
      // change structure of slashpay.json to allow multiple private payments
      // Something like this will do:
      /*
        {
          "paymentEndpoints": {
            "public": {
              "bolt11":"/public/slashpay/bolt11/slashpay.json",
              "onchain":"/public/slashpay/onchain/slashpay.json"
            },
            "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF": {
              "paymentEndpoints": {
                  "bolt11":"/FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF/slashpay/bolt11/slashpay.json",
                  "onchain":"/FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF/slashpay/onchain/slashpay.json"
              }
            }
          }
        }
      */
      slashpayFile.paymentEndpoints[name] = amount
        ? path.join('/', id, 'slashpay', name, 'slashpay.json')
        : path.join('/public/slashpay', name, 'slashpay.json')
    })

    return {
      slashpayFile,
      id
    }
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
  PAYMENT_RECEIVER_NOT_READY: 'PAYMENT_RECEIVER_NOT_READY'
}

module.exports = {
  PaymentReceiver,
  ERRORS
}

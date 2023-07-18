const config = require('./config.js')
const { LndConnect } = require('./LndConnect.js')

const pluginName = 'bolt11'

function getWatcher (config) {
  console.log('get wather')
  const lnd = config.config ? config : new LndConnect(config)

  return async ({ amount, notificationCallback }) => {
    console.log('wather itself')
    const outputs = {}

    const callback = async (receipt) => {
      await notificationCallback({
        pluginName,
        type: 'payment_new',
        data: receipt,
        amountWasSpecified: !!amount
      })
    }

    const invoice = await lnd.generateInvoice({ tokens: amount })
    outputs.bolt11 = invoice.data
    lnd.subscribeToInvoice(invoice.id, callback)

    await notificationCallback({
      id: invoice.id,
      pluginName,
      type: 'ready_to_recieve',
      data: outputs,
      amountWasSpecified: !!amount
    })
  }
}

function getPayer (config) {
  const lnd = config.config ? config : new LndConnect(config)

  return async ({ bolt11, notificationCallback, amount = null }) => {
    const res = await lnd.payInvoice({ request: bolt11, tokens: amount })

    await notificationCallback({
      id: res.id,
      pluginName,
      type: '', // XXX
      pluginState: res.error ? 'failed' : 'success', // XXX do better
      data: res
    })
  }
}

module.exports = {
  getmanifest: () => {
    return {
      name: pluginName, // FIXME
      type: 'payment',
      description: 'Slashpay bitcoin l2 payments',
      rpc: ['pay'],
      events: ['receivePayment']
    }
  },
  init: () => {
    console.log(pluginName, 'init')

    return {
      pay: getPayer(config),
      receivePayment: getWatcher(config)
    }
  },
}
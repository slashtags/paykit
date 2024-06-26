export type PayloadType = {
    /**
     * - payment_new
     */
    PAYMENT_NEW: string;
    /**
     * - payment_update
     */
    PAYMENT_UPDATE: string;
    /**
     * - payment_order_completed
     */
    PAYMENT_ORDER_COMPLETED: string;
    /**
     * - ready_to_receive
     */
    READY_TO_RECEIVE: string;
};
export type Errors = {
    /**
     * - Missing config
     */
    MISSING_CONFIG: string;
    /**
     * - Missing db
     */
    MISSING_DB: string;
    /**
     * - Missing TransportConnector
     */
    MISSING_TRANSPORT_CONNECTOR: string;
};
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
export class PaymentManager {
    /**
     * @constructor
     * @param {Object} config - configuration object
     * @param {any} db - instance of Database class
     * @param {TransportConnector} transportConnector - instance of TransportConnector class
     * @param {Function} notificationCallback - callback function for user notifications
     */
    constructor({ config, db, transportConnector, notificationCallback }: any);
    config: any;
    db: any;
    transportConnector: any;
    pluginManager: PluginManager;
    notificationCallback: any;
    ready: boolean;
    /**
     * Initialize the payment manager
     * @returns {Promise<void>}
     */
    init(): Promise<void>;
    /**
     * Create a payment
     * @param {Object} paymentObject - payment object
     * @returns {Promise<PaymentOrder>} - instance of Payment class
     */
    createPaymentOrder(paymentObject: any): Promise<PaymentOrder>;
    /**
     * Send a payment
     * @param {string} id - paymentOrder id
     * @returns {Promise<void>} - payment id
     */
    sendPayment(id: string): Promise<void>;
    /**
     * Create a personalized invoice
     * @param {string} clientOrderId - client defined invoice id
     * @param {string} amount - amount to be paid (base denomination of the default currency)
     * @returns {Promise<{string}>} - invoice url
     */
    createInvoice(clientOrderId: string, amount: string, amountOpts?: {
        currency: string;
        denomination: string;
    }): Promise<{
        string;
    }>;
    /**
     * Receive payments
     * @returns {Promise<string>}
     */
    receivePayments(): Promise<string>;
    /**
     * Entry point for plugins to send data to the payment manager
     * @param {Object} payload - payload object
     * @property {String} payload.pluginName - name of the plugin
     * @property {String} payload.paymentId - id of the payment
     * @property {String} payload.state - state of the payment
     * @property {String} payload.data - data to be sent to the payment manager
     * @returns {Promise<void>}
     */
    entryPointForPlugin(payload: any): Promise<void>;
    /**
     * Handle new payment
     * @param {Object} payload - payload object
     * @returns {Promise<void>}
     */
    handleNewPayment(payload: any): Promise<void>;
    /**
     * Handle payment update
     * @param {Object} payload - payload object
     * @returns {Promise<void>}
     */
    handlePaymentUpdate(payload: any): Promise<void>;
    /**
     * Entry point for users to send data to the payment manager which will be forwarded to plugin
     * @param {Object} data - data object
     * @param {String} data.paymentId - id of the related payment
     * @returns {Promise<void>}
     */
    entryPointForUser(data: {
        paymentId: string;
    }): Promise<void>;
    /**
     * Instantiate PaymentSender for order
     * @param {String} id - paymentOrder id
     * @returns {Promise<PaymentSender>} - instance of PaymentSender class
     */
    getPaymentSender(id: string): Promise<PaymentSender>;
    /**
     * Entry point for plugin to send notification to the user
     * @param {Object} payment - payment object
     * @returns {Promise<void>}
     */
    userNotificationEndpoint(payload: any): Promise<void>;
    /**
     * Create plugin specific payment file
     * @param {Object} payload - data to be written to the payment file
     */
    createPaymentFile(payload: any): Promise<void>;
}
export namespace PAYLOAD_TYPE {
    const PAYMENT_NEW: string;
    const PAYMENT_UPDATE: string;
    const PAYMENT_ORDER_COMPLETED: string;
    const READY_TO_RECEIVE: string;
}
export namespace ERRORS {
    const MISSING_CONFIG: string;
    const MISSING_DB: string;
    const MISSING_TRANSPORT_CONNECTOR: string;
}
import { PluginManager } from "../plugins/PluginManager";
import { PaymentOrder } from "./PaymentOrder";
import { PaymentSender } from "./PaymentSender";

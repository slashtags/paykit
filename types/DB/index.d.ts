/**
 * @class DB
 * @param {Object} config
 * @param {String} config.path
 * @param {String} config.name
 */
export class DB {
    constructor(config: any);
    db: Sqlite;
    ready: boolean;
    /**
     * @method init - Initialize the database
     * @returns {Promise}
     */
    init(): Promise<any>;
    /**
     * @method savePayment - Save a payment to the database
     * @param {Object} payment
     * @param {boolean} execute - Execute the statement or return it
     * @returns {Promise<Database| { statement: string, params: object }>}
     */
    savePayment(payment: any, execute?: boolean): Promise<any>;
    /**
     * @method saveIncomingPayment - Save a payment to the database
     * @param {Object} payment
     * @param {boolean} execute - Execute the statement or return it
     * @returns {Promise<Database| { statement: string, params: object }>}
     */
    saveIncomingPayment(payment: any, execute?: boolean): Promise<any>;
    /**
     * @method getPayment - Save a payment to the database
     * @param {string} id
     * @param {Object} opts
     * @returns {Promise<PaymentObject>}
     */
    getPayment(id: string, opts?: any): Promise<PaymentObject>;
    /**
     * @method getIncomingPayment - Save a payment to the database
     * @param {string} id
     * @param {Object} opts
     * @returns {Promise<PaymentObject>}
     */
    getIncomingPayment(id: string, opts?: any): Promise<PaymentObject>;
    /**
     * @method updatePayment - Update a payment in the database
     * @param {string} id
     * @param {Object} update
     * @param {boolean} execute - Execute the statement or return it
     * @returns {Promise<Database| { statement: string, params: object }>}
     */
    updatePayment(id: string, update: any, execute?: boolean): Promise<any>;
    /**
     * @method updateIncomingPayment - Update a payment in the database
     * @param {string} id
     * @param {Object} update
     * @param {boolean} execute - Execute the statement or return it
     * @returns {Promise<Database| { statement: string, params: object }>}
     */
    updateIncomingPayment(id: string, update: any, execute?: boolean): Promise<any>;
    /**
     * @method getOutgoingPayments - Get payments from the database
     * @param {Object} opts
     * @returns {Promise<Array<PaymentObject>>}
     */
    getOutgoingPayments(opts?: any): Promise<Array<PaymentObject>>;
    /**
     * @method getIncommingPayments - Get payments from the database
     * @param {Object} opts
     * @returns {Promise<Array<PaymentObject>>}
     */
    getIncomingPayments(opts?: any): Promise<Array<PaymentObject>>;
    /**
     * @method saveOrder - Save an order to the database
     * @param {Object} order
     * @param {boolean} execute - Execute the statement or return it
     * @returns {Promise<Database| { statement: string, params: object }>}
     */
    saveOrder(order: any, execute?: boolean): Promise<any>;
    /**
     * @method getOrder - Get an order from the database
     * @param {string} id
     * @param {Object} opts
     * @returns {Promise<OrderObject>}
     */
    getOrder(id: string, opts?: any): Promise<OrderObject>;
    /**
     * @method updateOrder - Update an order in the database
     * @param {string} id
     * @param {Object} update
     * @param {boolean} execute - Execute the statement or return it
     * @returns {Promise<Database| { statement: string, params: object }>}
     */
    updateOrder(id: string, update: any, execute?: boolean): Promise<any>;
    /**
     * @method executeStatement - Execute a statement on the database
     * @param {string} statement
     * @param {Object} params
     * @param {string} method
     * @returns {Promise<Database>}
     */
    executeStatement(statement: string, params: any, method?: string): Promise<Database>;
}
export namespace ERROR {
    const NOT_READY: string;
}
import { Sqlite } from "./Sqlite.js";

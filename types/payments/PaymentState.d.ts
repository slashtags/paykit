export type PaymentState = {
    /**
     * - initial state
     */
    INITIAL: string;
    /**
     * - in progress state
     */
    IN_PROGRESS: string;
    /**
     * - completed state
     */
    COMPLETED: string;
    /**
     * - failed state
     */
    FAILED: string;
    /**
     * - cancelled state
     */
    CANCELLED: string;
};
export type ERRORS = {
    /**
     * - returns error message with invalid state
     */
    INVALID_STATE: Function;
    /**
     * - error message for pending plugins not array
     */
    PENDING_PLUGINS_NOT_ARRAY: string;
    /**
     * - returns error message with plugin name
     */
    PLUGIN_IN_PROGRESS: Function;
    /**
     * - error message for payment required
     */
    PAYMENT_REQUIRED: string;
    /**
     * - error message for db required
     */
    DB_REQUIRED: string;
    /**
     * - error message for db not ready
     */
    DB_NOT_READY: string;
};
export type PluginState = {
    /**
     * - submitted to plugin
     */
    SUBMITTED: string;
    /**
     * - failed by plugin
     */
    FAILED: string;
    /**
     * - succeeded by plugin
     */
    SUCCESS: string;
};
/**
 * PaymentState class
 * @class PaymentState
 * @property {string} internalState - internal state
 * @property {string[]} pendingPlugins - pending plugins
 * @property {StatePlugin[]} triedPlugins - tried plugins
 * @property {StatePlugin} currentPlugin - current plugin
 * @property {StatePlugin} completedByPlugin - sent by plugin
 * @property {Payment} payment - payment
 */
export class PaymentState {
    /**
     * Validates payment
     * @param {Payment} payment - payment
     * @throws {Error} - if payment is not provided
     * @throws {Error} - if payment db is not provided
     * @throws {Error} - if payment db is not ready
     * @returns {void}
     */
    static validate(payment: Payment): void;
    /**
     * @param {Payment} payment - payment
     * @property {string} [payment.internalState] - internal state
     * @property {string[]} [payment.pendingPlugins] - pending plugins
     * @property {StatePlugin[]} [payment.triedPlugins] - tried plugins
     * @property {StatePlugin} [payment.currentPlugin] - current plugin
     * @property {StatePlugin} [payment.completedByPlugin] - sent by plugin
     * @param {Object} [params] - parameters to overwrite payment
     * @property {string} [params.internalState] - internal state
     * @property {string[]} [params.pendingPlugins] - pending plugins
     * @property {StatePlugin[]} [params.triedPlugins] - tried plugins
     * @property {StatePlugin} [params.currentPlugin] - current plugin
     * @property {StatePlugin} [params.completedByPlugin] - sent by plugin
     * @throws {Error} - if payment is not provided
     */
    constructor(payment: Payment, params?: any);
    internalState: any;
    pendingPlugins: any;
    triedPlugins: any;
    currentPlugin: any;
    completedByPlugin: any;
    payment: Payment;
    logger: {
        debug: (msg: any) => void;
        info: (msg: any) => void;
    };
    /**
     * Assigns pending plugins
     * @param {string[]} pendingPlugins - pending plugins
     * @throws {Error} - if pendingPlugins is not an array
     * @returns {void}
     */
    assignPendingPlugins(pendingPlugins: string[]): void;
    /**
     * Serializes payment state
     * @returns {Object} - serialized payment state
     * @returns {string} [returns.internalState] - internal state
     * @returns {string[]} [returns.pendingPlugins] - pending plugins
     * @returns {StatePlugin[]} [returns.triedPlugins] - tried plugins
     * @returns {StatePlugin} [returns.currentPlugin] - current plugin
     * @returns {StatePlugin} [returns.completedByPlugin] - sent by plugin
     */
    serialize(): any;
    /**
     * Returns current state
     * @returns {string} - current state
     */
    currentState: () => string;
    /**
     * Returns true if current state is initial
     * @returns {boolean} - true if current state is initial
     * @returns {boolean} - false if current state is not initial
     */
    isInitial: () => boolean;
    /**
     * Returns true if current state is in progress
     * @returns {boolean} - true if current state is in progress
     * @returns {boolean} - false if current state is not in progress
     */
    isInProgress: () => boolean;
    /**
     * Returns true if current state is completed
     * @returns {boolean} - true if current state is completed
     * @returns {boolean} - false if current state is not completed
     */
    isCompleted: () => boolean;
    /**
     * Returns true if current state is failed
     * @returns {boolean} - true if current state is failed
     * @returns {boolean} - false if current state is not failed
     */
    isFailed: () => boolean;
    /**
     * Returns true if current state is cancelled
     * @returns {boolean} - true if current state is cancelled
     * @returns {boolean} - false if current state is not cancelled
     */
    isCancelled: () => boolean;
    /**
     * Returns true if current state is final
     * @returns {boolean} - true if current state is completed or failed or cancelled
     * @returns {boolean} - false if current state is not completed or failed or cancelled
     */
    isFinal: () => boolean;
    /**
     * Cancel payment - sets internal state to cancelled and updates payment in db, if persist is true
     * if persist is false, returns { statement, params } for update
     * @returns {Promise<Database| { statement: string, params: object }>}
     * @throws {Error} - if current state is not initial
     */
    cancel(persist?: boolean): Promise<Database | {
        statement: string;
        params: object;
    }>;
    /**
     * Process payment - sets internal state to in progress and updates payment in db for new payments
     * fails payment if there are no pending plugins and updates payment in db
     * tries next plugin if there are pending plugins and updates payment in db
     * @throws {Error} - if current state is not initial
     * @returns {boolean} - true if next plugin is tried
     * @returns {boolean} - false if payment is failed
     */
    process(): boolean;
    /**
     * Mark current plugin as tried with failed state
     * @returns {void}
     */
    failCurrentPlugin(): void;
    /**
     * Fail payment - sets internal state to failed and updates payment in db
     * @throws {Error} - if current state is not in progress
     * @returns {void}
     */
    fail(): void;
    /**
     * Try next plugin - sets current plugin to next pending plugin and updates payment in db
     * @throws {Error} - if current state is not in progress
     * @returns {boolean} - true if next plugin is tried
     * @returns {boolean} - false if there are no pending plugins
     */
    tryNext(): boolean;
    /**
     * Complete payment - sets internal state to completed and updates payment in db
     * @throws {Error} - if current state is not in progress
     * @returns {void}
     */
    complete(): void;
    /**
     * Marks current plugin as tried and returns it
     * @returns {StatePlugin} - completed current plugin with endAt timestamp
     */
    markCurrentPluginAsTried(state: any): StatePlugin;
}
export namespace PAYMENT_STATE {
    const INITIAL: string;
    const IN_PROGRESS: string;
    const COMPLETED: string;
    const FAILED: string;
    const CANCELLED: string;
}
export namespace PLUGIN_STATE {
    export const SUBMITTED: string;
    const FAILED_1: string;
    export { FAILED_1 as FAILED };
    export const SUCCESS: string;
}
export namespace ERRORS {
    function INVALID_STATE(s: any): string;
    const PENDING_PLUGINS_NOT_ARRAY: string;
    function PLUGIN_IN_PROGRESS(name: any): string;
    const PAYMENT_REQUIRED: string;
    const DB_REQUIRED: string;
    const DB_NOT_READY: string;
}

const EventEmitter = require("events");
const debug = require('debug')('srt-socket-async');

const { SRT } = require('./srt');
const { AsyncSRT } = require('./async-api');

/**
 * @abstract
 * An abstraction of SRT socket ownership concerns.
 * To be used as a base class for either client/server-side implementations.
 *
 * @emits created
 * @emits disposed
 */
class SRTSocketAsync extends EventEmitter {

  /**
   *
   * @param {number} port listening port number
   * @param {string} address local interface, optional, default: '0.0.0.0'
   */
  constructor(port, address = '0.0.0.0') {
    super();

    if (!Number.isInteger(port) || port <= 0 || port > 65535)
      throw new Error('Need a valid port number but got: ' + port);

    this._socket = null;
    this._port = port;
    this._address = address;
    this._asyncSrt = new AsyncSRT();
  }

  /**
   * @returns {string}
   */
  get address() { return this._address; }

  /**
   * @returns {number}
   */
  get port() { return this._port; }

  /**
   * @returns {number}
   */
  get socket() {
    return this._socket;
  }

  /**
   * Call this before `open`.
   * Call `setSocketFlags` after this.
   *
   * @return {Promise<T extends SRTSocketAsync>}
   */
  async create() {
    if (this.socket !== null) {
      throw new Error('Can not call createSocket() twice, with socket already existing');
    }
    this._socket = await this._asyncSrt.createSocket();
    this.emit('created');
    return this;
  }

  /**
   * Closes the socket and disposes of the internal async handle (in this order).
   *
   * This method will throw on any failure of underlying socket-closing
   * or async-handle disposal op. It can be retried i.e called again as needed.
   * It will result in no-op if called redundantly.
   *
   * The socket-closing succeeded state can be checked on
   * with this socket-getter `null` value.
   *
   * Error-handling is therefore expected to be performed
   * using Promise-catch or await-try-catch.
   *
   * This method detaches all event-emitter listeners.
   *
   * @returns {AsyncReaderWriter}
   * @returns {Promise<void>}
   */
  async dispose() {
    if (this.socket !== null) {
      await this._asyncSrt.close(this.socket);
      this._socket = null;
    }
    if (this._asyncSrt !== null) {
      await this._asyncSrt.dispose();
      this._asyncSrt = null;
    }
    this.emit('disposed');
    this.off();
  }

  /**
   *
   * @param {SRTSockOpt[]} opts
   * @param {SRTSockOptValue[]} values
   * @returns {Promise<SRTResult[]>}
   */
  async setSocketFlags(opts, values) {
    if (this.socket === null) {
      throw new Error('There is no socket, call create() first');
    }
    if (opts.length !== values.length)
      throw new Error('opts and values must have same length');
    const promises = opts.map((opt, index) => {
      return this._asyncSrt.setSockOpt(this.socket, opt, values[index]);
    });
    return Promise.all(promises);
  }

  /**
   * Call this after `create`.
   * Call `setSocketFlags` before calling this.
   *
   * Sub-class implementors should override `_open` method,
   * to init specific socket usage (call/listen for remote connection).
   *
   * @return {Promise<T extends SRTSocketAsync>}
   */
  open() {
    if (this.socket === null) {
      throw new Error('No socket created, did you call create() before?');
    }
    return this._open();
  }

  /**
   * @protected
   * @abstract
   * Will safely get called from open method when socket existing.
   */
  _open() {}
}

module.exports = {
  SRTSocketAsync
};

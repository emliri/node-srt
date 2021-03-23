const debug = require('debug')('srt-server');
const EventEmitter = require("events");

const { SRT } = require('./srt');
const { AsyncSRT } = require('./async-api');
const { AsyncReaderWriter } = require('./async-reader-writer');
const { SRTSocketAsync } = require('./srt-socket-async');

const DEBUG = false;

const EPOLL_PERIOD_MS_DEFAULT = 0;

const EPOLLUWAIT_TIMEOUT_MS = 0;

const SOCKET_LISTEN_BACKLOG_SIZE = 0xFFFF;

/**
 * @emits data
 * @emits closing
 * @emits closeds
 */
class SRTServerConnection extends EventEmitter {
  /**
   *
   * @param {AsyncSRT} asyncSrt
   * @param {number} fd
   */
  constructor(asyncSrt, fd) {
    super();

    this._asyncSrt = asyncSrt;
    this._fd = fd;
    this._gotFirstData = false;
  }

  /**
   * @returns {number}
   */
  get fd() {
    return this._fd;
  }

  /**
   * Will be false until *after* emit of first `data` event.
   * After that will be true.
   */
  get gotFirstData() {
    return this._gotFirstData;
  }

  /**
   * Use AsyncReaderWriter as the recommended way
   * for performing r/w ops on connections.
   * @returns {AsyncReaderWriter}
   */
  getReaderWriter() {
    return new AsyncReaderWriter(this._asyncSrt, this.fd);
  }

  /**
   * Lower-level access to async-handle read method of the client-owned socket.
   * For performing massive read-ops without worrying, rather see `getReaderWriter`.
   * @param {number} bytes
   * @returns {Promise<Buffer | SRTResult.SRT_ERROR | null>}
   */
  async read(bytes) {
    return await this._asyncSrt.read(this.fd, bytes);
  }

  /**
   *
   * Pass a packet buffer to write to the connection.
   *
   * The size of the buffer must not exceed the SRT payload MTU
   * (usually 1316 bytes).
   *
   * Otherwise the call will resolve to SRT_ERROR.
   *
   * A system-specific socket-message error message may show in logs as enabled
   * where the error is thrown (on the binding call to the native SRT API),
   * and in the async API internals as it gets propagated back from the task-runner).
   *
   * Note that any underlying data buffer passed in
   * will be *neutered* by our worker thread and
   * therefore become unusable (i.e go to detached state, `byteLengh === 0`)
   * for the calling thread of this method.
   * When consuming from a larger piece of data,
   * chunks written will need to be slice copies of the source buffer.
   *
   * @param {Buffer | Uint8Array} chunk
   */
  async write(chunk) {
    return await this._asyncSrt.write(this.fd, chunk);
  }

  /**
   * This can only get called once with any effect.
   * It will cause the internal async handle ref to be null-set.
   * This will immediatly have `isClosed()` eval to `true`,
   * causing subsequent calls to this method to be no-op, and result to null.
   *
   * The fd-closing op being async, it emits "closing" before
   * and "closed" after any success (or not).
   *
   * Any errors in the async task can be caught using promise-catch.
   *
   * The closing operation having finally succeeded can be checked
   * upon the valid of the `fd` prop (will be null after succeeded close).
   * In case any initial failure needs to be retried, we can do this
   * manually with this fd-getter, and any async handles close method.
   *
   * This method detaches all event-emitter listeners.
   *
   * @returns {Promise<SRTResult | null>}
   */
  async close() {
    if (this.isClosed()) return null;
    const asyncSrt = this._asyncSrt;
    this._asyncSrt = null;
    this.emit('closing');
    const result = await asyncSrt.close(this.fd);
    if (result === SRT.ERROR) {
      throw new Error('Failed to close connection-fd:', this.fd);
    }
    this.fd = null;
    this.emit('closed', result);
    this.removeAllListeners();
    return result;
  }

  isClosed() {
    return ! this._asyncSrt;
  }

  onData() {
    this.emit('data');
    if (!this.gotFirstData) {
      this._gotFirstData = true;
    }
  }
}

/**
 * @emits created
 * @emits opened
 * @emits connection
 * @emits disconnection
 * @emits disposed
 */
class SRTServer extends SRTSocketAsync {

  /**
   *
   * @param {number} port listening port number
   * @param {string} address local interface, optional, default: '0.0.0.0'
   * @param {number} epollPeriodMs optional, default: EPOLL_PERIOD_MS_DEFAULT
   * @returns {Promise<SRTServer>}
   */
  static create(port, address, epollPeriodMs) {
    return new SRTServer(port, address, epollPeriodMs).create();
  }

  /**
   *
   * @param {number} port listening port number
   * @param {string} address local interface, optional, default: '0.0.0.0'
   * @param {number} epollPeriodMs optional, default: EPOLL_PERIOD_MS_DEFAULT
   */
  constructor(port, address, epollPeriodMs = EPOLL_PERIOD_MS_DEFAULT) {
    super(port, address);

    this.epollPeriodMs = epollPeriodMs;

    this._epid = null;
    this._pollEventsTimer = null;
    this._connectionMap = {};

    /**
     * Needs to be set before calling `open` (any changes after it
     * wont be considered i.e are effectless).
     * @public
     * @member {number}
     */
    this.backlogSize = SOCKET_LISTEN_BACKLOG_SIZE;
  }

  /**
   * @returns {number}
   */
  get epid() { return this._epid; }

  /**
   * @returns {Promise<void>}
   */
  dispose() {
    this._clearTimers();
    return super.dispose();
  }

  create() {
    return super.create();
  }

  open() {
    return super.open();
  }

  /**
   *
   * @param {number} fd
   * @returns {SRTServerConnection | null}
   */
  getConnectionByHandle(fd) {
    return this._connectionMap[fd] || null;
  }

  /**
   * @returns {Array<SRTServerConnection>}
   */
  getAllConnections() {
    return Array.from(Object.values(this._connectionMap));
  }

  /**
   *
   * @return {Promise<SRTServer>}
   */
  async _open() {
    let result;
    result = await this.asyncSrt.bind(this.socket, this.address, this.port);
    if (result === SRT.ERROR) {
      throw new Error('SRT.bind() failed');
    }
    result = await this.asyncSrt.listen(this.socket, SOCKET_LISTEN_BACKLOG_SIZE);
    if (result === SRT.ERROR) {
      console.error(`SRT.listen() failed for address/port: ${this.address}/${this.port}`);
      throw new Error(`SRT.listen() failed for address/port: ${this.address}/${this.port}`);
    }
    result = await this.asyncSrt.epollCreate();
    if (result === SRT.ERROR) {
      throw new Error('SRT.epollCreate() failed');
    }
    this._epid = result;

    this.emit('opened');

    // we should await the epoll subscribe result before continuing
    // since it is useless to poll events otherwise
    // and we should also yield from the stack at this point
    // since the `opened` event handlers above may do whatever
    await this.asyncSrt.epollAddUsock(this._epid, this.socket, SRT.EPOLL_IN | SRT.EPOLL_ERR);

    this._pollEvents();

    return this;
  }

  /**
   * @private
   * @param {SRTEpollEvent} event
   */
  async _handleEvent(event) {
    const status = await this.asyncSrt.getSockState(event.socket);

    // our local listener socket
    if (event.socket === this.socket) {

      if (status === SRT.SRTS_LISTENING) {
        const fd = await this.asyncSrt.accept(this.socket);
        // no need to await the epoll subscribe result before continuing
        this.asyncSrt.epollAddUsock(this._epid, fd, SRT.EPOLL_IN | SRT.EPOLL_ERR);
        debug("Accepted client connection with file-descriptor:", fd);
        // create new client connection handle
        // and emit accept event
        const connection = new SRTServerConnection(this.asyncSrt, fd);
        connection.on('closing', () => {
          // remove handle
          delete this._connectionMap[fd];
        });
        this._connectionMap[fd] = connection;
        this.emit('connection', connection);
      }

    // a client socket / fd
    // check if broken or closed
    } else if (status === SRT.SRTS_BROKEN
      || status === SRT.SRTS_NONEXIST
      || status === SRT.SRTS_CLOSED) {
      const fd = event.socket;
      debug("Client disconnected on fd:", fd);
      if (this._connectionMap[fd]) {
        await this._connectionMap[fd].close();
        this.emit('disconnection', fd);
      }
    // not broken, just new data
    } else {
      const fd = event.socket;
      DEBUG && debug("Got data from connection on fd:", fd);
      const connection = this.getConnectionByHandle(fd);
      if (!connection) {
        console.warn("Got event for fd not in connections map:", fd);
        return;
      }
      connection.onData();
    }
  }

  /**
   * @private
   */
  async _pollEvents() {
    // needed for async-disposal, guard from AsyncSRT instance wiped
    if (!this.asyncSrt) {
      this._clearTimers();
      return;
    }
    const events = await this.asyncSrt.epollUWait(this._epid, EPOLLUWAIT_TIMEOUT_MS);
    events.forEach((event) => {
      this._handleEvent(event);
    });

    // clearing in case we get called multiple times
    // when already timer scheduled
    // will be no-op if timer-id invalid or old
    clearTimeout(this._pollEventsTimer);
    this._pollEventsTimer = setTimeout(this._pollEvents.bind(this), this.epollPeriodMs);
  }

  _clearTimers() {
    if (this._pollEventsTimer !== null) {
      clearTimeout(this._pollEventsTimer);
      this._pollEventsTimer = null;
    }
  }
}

module.exports = {
  SRTServerConnection,
  SRTServer
};

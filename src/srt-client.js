const { SRT } = require('./srt');
const { SRTSocketAsync } = require('./srt-socket-async');
const { AsyncReaderWriter } = require('./async-reader-writer');

class SRTClientConnection extends SRTSocketAsync {

  /**
   *
   * @param {number} port local port
   * @param {string} address local interface, optional, default: '0.0.0.0'
   * @returns {Promise<SRTClient>}
   */
  static create(port, address) {
    return new SRTClient(port, address).create();
  }

  /**
   *
   * @param {number} port local port
   * @param {string} address local interface, optional, default: '0.0.0.0'
   */
  constructor(port, address) {
    super(port, address);
  }

  /**
   * Use AsyncReaderWriter as the recommended way
   * for performing r/w ops on connections.
   * @returns {AsyncReaderWriter}
   */
  getReaderWriter() {
    return new AsyncReaderWriter(this._asyncSrt, this.socket);
  }

  /**
   * Lower-level access to async-handle read method of the client-owned socket.
   * For performing massive read-ops without worrying, rather see `getReaderWriter`.
   * @param {number} bytes
   * @returns {Promise<Buffer | SRTResult.SRT_ERROR | null>}
   */
  async read(bytes) {
    return await this._asyncSrt.read(this.socket, bytes);
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
    return await this._asyncSrt.write(this.socket, chunk);
  }

  /**
   * Call this after `create`.
   * Call `setSocketFlags` before calling this.
   *
   * @return {Promise<SRTServer>}
   */
  async _open() {
    let result = await this._asyncSrt.connect(this.socket);
    if (result === SRT.ERROR) {
      throw new Error('SRT.connect() failed');
    }
    return this;
  }
}

module.exports = {
  SRTClientConnection
}

const { SRT } = require('./src/srt');
const { AsyncSRT } = require('./src/async-api');
const { SRTReadStream } = require('./src/srt-stream-readable');
const { SRTWriteStream } = require('./src/srt-stream-writable');
const { SRTClientConnection } = require('./src/srt-client');
const { SRTServer } = require('./src/srt-server');
const { setSRTLoggingLevel } = require('./src/logging');
const {
  createAsyncWorker: createSRTAsyncWorker,
  getAsyncWorkerPath: getSRTAsyncWorkerPath
} = require('./src/async-worker-provider');

const {
  sliceBufferToChunks,
  copyChunksIntoBuffer
} = require('./src/tools');

module.exports = {
  SRT,
  AsyncSRT,
  SRTClientConnection,
  SRTServer,
  SRTReadStream,
  SRTWriteStream,
  setSRTLoggingLevel,
  isSRTInstalled() {
    return !! SRT
  },
  createSRTAsyncWorker,
  getSRTAsyncWorkerPath,
  PayloadTools: {
    sliceBufferToChunks,
    copyChunksIntoBuffer
  }
};

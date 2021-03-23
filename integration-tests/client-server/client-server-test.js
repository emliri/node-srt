const { performance } = require("perf_hooks");

const now = performance.now;

const {
  SRT, AsyncSRT, SRTServer,
  setSRTLoggingLevel,
  PayloadTools
} = require('../../index');

const {
  writeChunksWithYieldingLoop,
  writeChunksWithExplicitScheduling
} = require('../../src/async-write-modes');

const { generateRandomBuffer } = require('./random-data-gen');

const LOCAL_IFACE = '127.0.0.1';

// typical size NodeJS-internal readable grabs in binary streams
const READ_BUF_SIZE = 16 * 1024;

const PAYLOAD_MAX_BYTES_PER_PACKET = 1316; // SRT MTU

const CLIENT_WRITES_PER_TICK = 128;

async function testTransmitClientToServerLoopback(localServerPort, done,
  useExplicitScheduling) {

  const sourceDataBuf = generateRandomBuffer(60000);

  const packetDataSlicingStartTime = now();

  const chunks = PayloadTools.sliceBufferToChunks(sourceDataBuf,
    PAYLOAD_MAX_BYTES_PER_PACKET, sourceDataBuf.byteLength);

  const packetDataSlicingTimeD = now() - packetDataSlicingStartTime;
  console.log(`Pre-slicing ${sourceDataBuf.byteLength} bytes packet data (${chunks.length} chunks) took millis:`, packetDataSlicingTimeD);

  // we need two instances of task-runners here,
  // because otherwise awaiting server accept
  // result would deadlock
  // client connection tasks
  const asyncSrtServer = new SRTServer(localServerPort);

  asyncSrtServer.on('connection', (connection) => {
    onClientConnected(connection);
  });

  const asyncSrtClient = new AsyncSRT();

  const [clientSideSocket] = await Promise.all([
    asyncSrtClient.createSocket(true), // we could also use the servers async-api here equivalently.
    asyncSrtServer.create().then(s => s.open())
  ]);

  const bytesExpectedToRead = sourceDataBuf.length;

  let clientWriteStartTime;
  let clientWriteDoneTime;
  let bytesSentCount = 0;

  console.log('Got socket handles (client/server):',
    clientSideSocket, '/',
    asyncSrtServer.socket);

  function onClientConnected(connection) {
    console.log('Got new connection:', connection.fd)

    let bytesRead = 0;
    let firstByteReadTime;

    const serverConnectionAcceptTime = now();

    connection.on('data', async () => {
      if (!connection.gotFirstData) {
        onClientDataServerSide();
      }
    });

    const serverConnectionRw = connection.getReaderWriter();
    async function onClientDataServerSide() {
      const chunks = await serverConnectionRw.readChunks(
        bytesExpectedToRead,
        READ_BUF_SIZE,
        (readBuf) => {
        if (!firstByteReadTime) {
          firstByteReadTime = now();
        }
        //console.log('Read buffer of size:', readBuf.byteLength)
        bytesRead += readBuf.byteLength;
      }, (errRes) => {
        console.log('Error reading, got result:', errRes);
      });
      onReadDone(chunks);
    }

    function onReadDone(chunks) {
      const readDoneTime = now();
      const readTimeDiffMs = readDoneTime - serverConnectionAcceptTime;
      const readBandwidthEstimKbps = (8 * (bytesExpectedToRead / readTimeDiffMs))
      console.log('Done reading stream, took millis:', readTimeDiffMs, 'for kbytes:~',
      (bytesSentCount / 1000), 'of', (bytesExpectedToRead / 1000));
      console.log('Estimated read-bandwidth (kb/s):', readBandwidthEstimKbps.toFixed(3))
      console.log('First-byte-write-to-read latency millis:',
        firstByteReadTime - clientWriteStartTime)
      console.log('End-to-end transfer latency millis:', readDoneTime - clientWriteStartTime)
      console.log('Client-side writing took millis:',
        clientWriteDoneTime - clientWriteStartTime);

      expect(bytesSentCount).toEqual(bytesExpectedToRead);

      const receivedBuffer = PayloadTools.copyChunksIntoBuffer(chunks);

      expect(receivedBuffer.byteLength).toEqual(bytesSentCount);

      for (let i = 0; i < receivedBuffer.byteLength; i++) {
        expect(sourceDataBuf.readInt8(i)).toEqual(receivedBuffer.readInt8(i));
      }

      done();
    }
  }

  async function clientWriteToConnection() {

    let result = await asyncSrtClient.connect(clientSideSocket,
      LOCAL_IFACE, localServerPort);

    if (result === SRT.ERROR) {
      throw new Error('client connect failed');
    }

    console.log('connect result:', result)

    clientWriteStartTime = now();

    if (useExplicitScheduling) {
      writeChunksWithExplicitScheduling(asyncSrtClient,
        clientSideSocket, chunks, onWrite, CLIENT_WRITES_PER_TICK);
    } else {
      writeChunksWithYieldingLoop(asyncSrtClient,
        clientSideSocket, chunks, onWrite, CLIENT_WRITES_PER_TICK);
    }

    function onWrite(byteLength) {
      bytesSentCount += byteLength;
      if(bytesSentCount >= sourceDataBuf.byteLength) {
        console.log('done writing, took millis:',
          now() - clientWriteStartTime);
        clientWriteDoneTime = now();
      }
    }
  }

  await clientWriteToConnection();
}

module.exports = {
  testTransmitClientToServerLoopback
}

setSRTLoggingLevel(7);

testTransmitClientToServerLoopback(9000, () => {
  console.log('done')
});

const {
  setSRTLoggingLevel
} = require('../index');

setSRTLoggingLevel(7);

const { testTransmitClientToServerLoopback } = require('./client-server/client-server-test');

jest && jest.setTimeout(5000)

describe("SRTClient-SRTServer integration", () => {
  describe("AsyncSRT to SRTServer one-way transmission", () => {
    it("should transmit data written (yielding-loop)", done => {
      testTransmitClientToServerLoopback(9000, done, false);
    });

    it("should transmit data written (explicit-scheduling)", done => {
      testTransmitClientToServerLoopback(9001, done, true);
    });
  });
});




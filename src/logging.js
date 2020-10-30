const { SRT } = require('./srt');

let srt = null;

/**
 *
 * @param {number | SRTLoggingLevel} level
 */
function setSRTLoggingLevel(level) {
  if (!srt) {
    srt = new SRT();
  }
  srt.setLogLevel(level)
}

module.exports = {
  setSRTLoggingLevel
}

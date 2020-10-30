try {
  module.exports = require('../build/Debug/srt.node');
} catch(err) {
  module.exports = require('../build/Release/srt.node');
}

const fs = require("fs");
const path = require("path");

// NOTE: Very useful in combination with PKG executable bundler,
// see https://github.com/vercel/pkg#config
const dynLibPathDebug = path.join(__dirname, '../build/Debug/srt.node');
const dynLibPathRelease = path.join(__dirname, '../build/Release/srt.node');
const haveDebug = fs.existsSync(dynLibPathDebug);
const haveRelease = fs.existsSync(dynLibPathRelease);
function requireDebug() { return require('../build/Debug/srt.node') };
function requireRelease() { return require('../build/Release/srt.node') };

if (haveDebug) {
  module.exports = requireDebug();
} else if (haveRelease) {
  module.exports = requireRelease();
} else {
  // The whole above approach would be nice but doesn't work in a compiled module
  // where these paths have no more meaning and the exists result would always be false.
  // Therefore, ultimately we attempt our way through this try-catch fall-thru anyway.
  // The compiler will have replaced the require arg by a path that works within
  // its own module-loader, and thus it will eventually work (or not), as the above flags
  // still may be false either way.
  try {
    module.exports = requireDebug();
  } catch(err) {
    try {
      module.exports = requireRelease();
    } catch(err) {
      module.exports = {
        SRT: null
      };
    }
  }
}


const fs = require("fs");
const path = require("path");

// NOTE: Very useful in combination with PKG executable bundler,
// see https://github.com/vercel/pkg#config
const dynLibPathDebug = path.join(__dirname, '../build/Debug/srt.node');
const dynLibPathRelease = path.join(__dirname, '../build/Release/srt.node');
const haveDebug = fs.existsSync(dynLibPathDebug);
const haveRelease = fs.existsSync(dynLibPathRelease);
if (haveDebug) {
  module.exports = require(dynLibPathDebug);
} else if (haveRelease) {
  module.exports = require(dynLibPathRelease);
} else {
  module.exports = {
    SRT: null
  };
}

/**
 * @param {number} bytes Bytes length generated
 * @returns {Buffer}
 */
function generateRandomBuffer(bytes) {
  const buf = Buffer.allocUnsafe(bytes);
  for (let i = 0; i < bytes; i++) {
    const val = Math.round(0xFF * Math.random());
    buf.set([val], i);
  }
  return buf;
}

module.exports = {
  generateRandomBuffer
};

const { Worker } = require('worker_threads');
const { resolve } = require('path');

const getAsyncWorkerPath = () => resolve(__dirname, './async-worker.js');

let _createAsyncWorker = () => {
  return new Worker(getAsyncWorkerPath())
};

const createAsyncWorker = () => {
  return _createAsyncWorker();
};

createAsyncWorker.overrideModuleScopeImpl = (func) => {
  _createAsyncWorker = func;
};

module.exports = {
  createAsyncWorker,
  getAsyncWorkerPath
};

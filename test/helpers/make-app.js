'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

function makeTempStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-test-'));
  return path.join(dir, 'store.json');
}

function makeApp() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
  process.env.NODE_ENV = 'test';
  const storePath = makeTempStorePath();
  const { createStore } = require('../../server/store');
  const { createApp } = require('../../server/app');
  const store = createStore({ kind: 'json', path: storePath });
  const app = createApp({ store });
  return { app, store, storePath };
}

module.exports = { makeApp, makeTempStorePath };

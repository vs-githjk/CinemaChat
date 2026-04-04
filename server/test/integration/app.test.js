import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../app.js';

function makeEnv() {
  return {
    nodeEnv: 'test',
    port: 3001,
    clientOrigins: ['http://localhost:5173'],
    requestBodyLimit: '1mb',
  };
}

function makePool({ shouldFail = false } = {}) {
  return {
    async query(sql) {
      if (shouldFail) throw new Error('db unavailable');
      if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
      return { rows: [] };
    },
  };
}

test('GET /api/health returns ok payload', async () => {
  const app = createApp({ env: makeEnv(), pool: makePool() });
  const res = await request(app).get('/api/health');

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.env, 'test');
  assert.ok(res.body.timestamp);
});

test('GET /api/ready returns ready when DB is healthy', async () => {
  const app = createApp({ env: makeEnv(), pool: makePool() });
  const res = await request(app).get('/api/ready');

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ready');
});

test('GET /api/ready returns 503 when DB is unavailable', async () => {
  const app = createApp({ env: makeEnv(), pool: makePool({ shouldFail: true }) });
  const res = await request(app).get('/api/ready');

  assert.equal(res.status, 503);
  assert.equal(res.body.status, 'not_ready');
});

test('unknown routes return 404 json', async () => {
  const app = createApp({ env: makeEnv(), pool: makePool() });
  const res = await request(app).get('/api/does-not-exist');

  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Not found');
});

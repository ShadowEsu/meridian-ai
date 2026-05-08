'use strict';

const request = require('supertest');
const { makeApp } = require('../helpers/make-app');

describe('smoke', () => {
  it('responds to an unknown route with 404 JSON, not HTML', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/__nope__');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

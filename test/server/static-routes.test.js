'use strict';

const path = require('path');
const request = require('supertest');
const { makeApp } = require('../helpers/make-app');
const { mountStaticRoutes } = require('../../server/lib/static-routes');

describe('static routes', () => {
  function appWithStatic() {
    const { app } = makeApp();
    mountStaticRoutes(app, {
      root: path.join(__dirname, '..', '..'),
      landing: path.join(__dirname, '..', '..', 'landing'),
    });
    return app;
  }

  it('serves landing at /', async () => {
    const r = await request(appWithStatic()).get('/');
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/Meridian AI/);
  });

  it('serves dashboard at /app', async () => {
    const r = await request(appWithStatic()).get('/app');
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/Starting Meridian/);
  });

  it('redirects /home to /', async () => {
    const r = await request(appWithStatic()).get('/home');
    expect(r.status).toBe(301);
    expect(r.headers.location).toBe('/');
  });

  it('blocks /data from static exposure', async () => {
    const r = await request(appWithStatic()).get('/data/meridian-store.json');
    expect(r.status).toBe(404);
  });
});

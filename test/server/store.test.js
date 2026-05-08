'use strict';

const { createStore } = require('../../server/store');
const { makeTempStorePath } = require('../helpers/make-app');

describe('json store', () => {
  let storePath;
  let store;

  beforeEach(() => {
    storePath = makeTempStorePath();
    store = createStore({ kind: 'json', path: storePath });
  });

  it('starts with an empty users table', async () => {
    const all = await store.users.all();
    expect(all).toEqual([]);
  });

  it('addUser persists across reload', async () => {
    await store.users.add({ email: 'a@b.com', passwordHash: 'h' });
    const reloaded = createStore({ kind: 'json', path: storePath });
    const u = await reloaded.users.findByEmail('a@b.com');
    expect(u).toMatchObject({ email: 'a@b.com', passwordHash: 'h' });
    expect(u.id).toBeTypeOf('number');
  });

  it('rejects duplicate email with code DUPLICATE_EMAIL', async () => {
    await store.users.add({ email: 'a@b.com', passwordHash: 'h' });
    await expect(store.users.add({ email: 'A@B.COM', passwordHash: 'h2' }))
      .rejects.toMatchObject({ code: 'DUPLICATE_EMAIL' });
  });
});

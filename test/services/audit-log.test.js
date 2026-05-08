'use strict';
const { makeApp } = require('../helpers/make-app');
const { createAuditLog } = require('../../server/services/audit-log');

describe('audit log service', () => {
  it('appends and lists', async () => {
    const { store } = makeApp();
    const audit = createAuditLog({ store });
    await audit.append({ userId: 1, action: 'auth.login', ip: '1.2.3.4' });
    await audit.append({ userId: 1, action: 'provider_key.add', target: { id: 9 } });
    const rows = await audit.list({ userId: 1 });
    expect(rows).toHaveLength(2);
    expect(rows[0].action).toBe('provider_key.add');
  });

  it('redacts unknown fields and never logs apiKey', async () => {
    const { store } = makeApp();
    const audit = createAuditLog({ store });
    await audit.append({ userId: 1, action: 'provider_key.add', meta: { apiKey: 'sk-secret', label: 'ok' } });
    const [row] = await audit.list({ userId: 1 });
    expect(row.meta.apiKey).toBeUndefined();
    expect(row.meta.label).toBe('ok');
  });
});

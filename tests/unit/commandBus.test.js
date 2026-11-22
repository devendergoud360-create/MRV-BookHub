import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

describe('CommandBus', () => {
  it('registers and executes command', async () => {
    for (const k of Object.keys(require.cache)) if (k.includes('/MRV-BookHub/backend/services/commandBus')) delete require.cache[k];
    const bus = require('../../backend/services/commandBus.js');
    bus.register('test.echo', async (_ctx, input) => ({ ok: true, input }), { roles: ['admin'] });
    const res = await bus.execute('test.echo', { user: { id: 1 } }, { x: 1 });
    expect(res).toEqual({ ok: true, input: { x: 1 } });
    expect(bus.list().some(c => c.name === 'test.echo')).toBe(true);
  });

  it('throws on unknown command', async () => {
    const bus = require('../../backend/services/commandBus.js');
    await expect(bus.execute('missing.cmd', {}, {})).rejects.toThrow(/Unknown command/);
  });
});

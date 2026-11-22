const logger = require('./logger');

class CommandBus {
  constructor() { this.handlers = new Map(); }
  register(name, handler, meta = {}) {
    this.handlers.set(name, { handler, meta });
  }
  has(name) { return this.handlers.has(name); }
  async execute(name, context = {}, input = {}) {
    const entry = this.handlers.get(name);
    if (!entry) throw Object.assign(new Error(`Unknown command: ${name}`), { statusCode: 400 });
    logger.info(logger.events.COMMAND_EXECUTE, { command: name, actor: context.user?.id || null });
    return entry.handler(context, input);
  }
  list() { return [...this.handlers.entries()].map(([name, v]) => ({ name, ...v.meta })); }
}

module.exports = new CommandBus();

const logger = require('./logger');

class EventBus {
  constructor() { this.subscribers = new Map(); }
  subscribe(event, handler) {
    if (!this.subscribers.has(event)) this.subscribers.set(event, []);
    this.subscribers.get(event).push(handler);
    return () => this.unsubscribe(event, handler);
  }
  unsubscribe(event, handler) {
    const list = this.subscribers.get(event) || [];
    this.subscribers.set(event, list.filter((h) => h !== handler));
  }
  publish(event, payload = {}) {
    const handlers = this.subscribers.get(event) || [];
    for (const h of handlers) {
      try { h(payload, event); } catch (err) { logger.error('event.handler.error', { event, message: err.message }); }
    }
    const all = this.subscribers.get('*') || [];
    for (const h of all) {
      try { h(payload, event); } catch (err) { logger.error('event.handler.error', { event, message: err.message }); }
    }
  }
}

const bus = new EventBus();
// Structured logging subscriber (Observer pattern)
bus.subscribe('*', (payload, event) => {
  logger.info('domain.event', { event, payload });
});

module.exports = bus;

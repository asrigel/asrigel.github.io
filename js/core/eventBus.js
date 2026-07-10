export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    return () => this.off(type, listener);
  }

  off(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, payload) {
    this.listeners.get(type)?.forEach((listener) => listener(payload));
  }
}

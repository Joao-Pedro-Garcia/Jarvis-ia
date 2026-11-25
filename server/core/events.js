// Barramento de eventos do servidor (arquitetura orientada a eventos).
import { EventEmitter } from 'node:events';

export const EVENTS = Object.freeze({
  ASSISTANT_STARTED: 'ASSISTANT_STARTED',
  ASSISTANT_STOPPED: 'ASSISTANT_STOPPED',
  VOICE_RECEIVED: 'VOICE_RECEIVED',
  TEXT_RECEIVED: 'TEXT_RECEIVED',
  COMMAND_DETECTED: 'COMMAND_DETECTED',
  COMMAND_EXECUTED: 'COMMAND_EXECUTED',
  COMMAND_FAILED: 'COMMAND_FAILED',
  CONFIRMATION_REQUESTED: 'CONFIRMATION_REQUESTED',
  BIBLE_OPENED: 'BIBLE_OPENED',
  PAGE_NEXT: 'PAGE_NEXT',
  PAGE_PREVIOUS: 'PAGE_PREVIOUS',
  BIBLE_DAY_COMPLETED: 'BIBLE_DAY_COMPLETED',
  MEMORY_UPDATED: 'MEMORY_UPDATED',
  NEWS_FETCHED: 'NEWS_FETCHED',
  LLM_ERROR: 'LLM_ERROR',
  API_FAILURE: 'API_FAILURE',
  HOUSE_ACTION: 'HOUSE_ACTION',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
});

class Bus extends EventEmitter {
  emitEvent(type, payload = {}) {
    const evt = { type, payload, at: new Date().toISOString() };
    this.emit(type, evt);
    this.emit('*', evt);
    return evt;
  }
}

export const bus = new Bus();
bus.setMaxListeners(50);

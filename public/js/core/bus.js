// Barramento de eventos do cliente (arquitetura orientada a eventos).
export const EVENTS = Object.freeze({
  ASSISTANT_STARTED: 'ASSISTANT_STARTED', ASSISTANT_STOPPED: 'ASSISTANT_STOPPED',
  STATE_CHANGED: 'STATE_CHANGED',
  VOICE_RECEIVED: 'VOICE_RECEIVED', VOICE_INTERIM: 'VOICE_INTERIM',
  LISTEN_STARTED: 'LISTEN_STARTED', LISTEN_ENDED: 'LISTEN_ENDED', LISTEN_ERROR: 'LISTEN_ERROR',
  COMMAND_DETECTED: 'COMMAND_DETECTED', RESPONSE_RECEIVED: 'RESPONSE_RECEIVED',
  SPEECH_STARTED: 'SPEECH_STARTED', SPEECH_FINISHED: 'SPEECH_FINISHED', SPEECH_BOUNDARY: 'SPEECH_BOUNDARY',
  CLAP_DETECTED: 'CLAP_DETECTED', DOUBLE_CLAP: 'DOUBLE_CLAP', PALMS_DETECTED: 'PALMS_DETECTED', CLAP_LEVEL: 'CLAP_LEVEL',
  BIBLE_OPENED: 'BIBLE_OPENED', PAGE_NEXT: 'PAGE_NEXT', PAGE_PREVIOUS: 'PAGE_PREVIOUS',
  MEMORY_UPDATED: 'MEMORY_UPDATED', SETTINGS_CHANGED: 'SETTINGS_CHANGED', NET_CHANGED: 'NET_CHANGED',
  SERVER_EVENT: 'SERVER_EVENT',
});

const listeners = new Map();
export const bus = {
  on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
  emit(type, payload) {
    for (const fn of listeners.get(type) || []) { try { fn(payload); } catch (e) { console.error(e); } }
    for (const fn of listeners.get('*') || []) { try { fn({ type, payload }); } catch (e) { console.error(e); } }
  },
};

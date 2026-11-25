// Último resultado conhecido de cada componente (para o semáforo do diagnóstico).
const state = {};
export function setHealth(id, status, detail) { state[id] = { status, detail, at: new Date().toISOString() }; }
export function getHealth(id) { return state[id] || null; }

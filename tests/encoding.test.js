// Feeds em ISO-8859-1 não podem virar "esfor�o".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('encoding');
const { decodeFeed } = await import('../server/modules/news/feeds.js');
const latin = (s) => new Uint8Array(Buffer.from(s, 'latin1'));

test('feed ISO-8859-1 declarado no XML', () => {
  assert.match(decodeFeed(latin('<?xml version="1.0" encoding="ISO-8859-1"?><t>esforço inteligência</t>'), 'application/rss+xml'), /esforço inteligência/);
});
test('feed Latin-1 que mente "charset=utf-8" no cabeçalho', () => {
  assert.match(decodeFeed(latin('<t>esforço</t>'), 'text/xml; charset=utf-8'), /esforço/);
});
test('feed UTF-8 normal continua igual', () => {
  assert.equal(decodeFeed(new Uint8Array(Buffer.from('<t>ação €</t>')), 'text/xml'), '<t>ação €</t>');
});

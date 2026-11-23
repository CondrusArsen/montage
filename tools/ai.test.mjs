import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../dist/assets.mjs';
import { PROVIDERS, buildRequest, readAnswer, suggestWithAI, systemPrompt } from '../dist/ai.mjs';

const answer = JSON.stringify({
  metaphor: 'Фокус — это тишина среди шума',
  objects: [
    { id: 'headphones', role: 'main', reason: 'отсекают шум' },
    { id: 'lamp', role: 'main', reason: 'свет рабочего места' },
    { id: 'book', role: 'background', reason: 'спокойное занятие' },
  ],
});

function fakeFetch(responses, calls = []) {
  return async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    const next = responses.shift();
    return { ok: next.status < 400, status: next.status, text: async () => JSON.stringify(next.body) };
  };
}

test('the prompt lists every library object and forbids inventing new ones', () => {
  const prompt = systemPrompt(CATALOG);
  for (const asset of CATALOG) assert.match(prompt, new RegExp(`- ${asset.id} — `));
  assert.match(prompt, /только ID из списка/);
});

test('model answers are trimmed to known, unique library objects', () => {
  const result = readAnswer('Вот ответ: ' + JSON.stringify({
    metaphor: 'x',
    objects: [
      { id: 'Coin', role: 'background' }, { id: 'unicorn', role: 'main' }, { id: 'coin', role: 'main' },
      { id: 'wallet', role: 'background', reason: 'бюджет' },
    ],
  }) + ' Готово.', CATALOG);
  assert.deepEqual(result.objects.map(item => [item.id, item.role]), [['coin', 'main'], ['wallet', 'background']]);
  assert.throws(() => readAnswer('{"objects":[{"id":"unicorn"}]}', CATALOG), /нет объектов/);
  assert.throws(() => readAnswer('не JSON', CATALOG), /JSON/);
});

test('OpenAI-compatible request goes to chat/completions with the key in the header', async () => {
  const calls = [];
  const fetcher = fakeFetch([{ status: 200, body: { choices: [{ message: { content: answer } }] } }], calls);
  const result = await suggestWithAI({ provider: 'openrouter', key: 'sk-test', model: '' }, 'Найти фокус в шуме', CATALOG, { fetcher });
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer sk-test');
  assert.equal(calls[0].body.model, PROVIDERS.openrouter.model);
  assert.match(calls[0].body.messages[1].content, /Найти фокус в шуме/);
  assert.equal(result.metaphor, 'Фокус — это тишина среди шума');
  assert.deepEqual(result.objects.map(item => item.id), ['headphones', 'lamp', 'book']);
});

test('Gemini request uses generateContent, JSON output and the x-goog-api-key header', () => {
  const request = buildRequest({ provider: 'gemini', key: 'g-test', model: 'gemini-flash-latest' }, 'Бюджет', CATALOG);
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent');
  assert.equal(request.headers['x-goog-api-key'], 'g-test');
  assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
  assert.equal(request.read({ candidates: [{ content: { parts: [{ text: answer }] } }] }), answer);
});

test('a service without response_format support gets a second plain request', async () => {
  const calls = [];
  const fetcher = fakeFetch([
    { status: 400, body: { error: { message: 'response_format is not supported' } } },
    { status: 200, body: { choices: [{ message: { content: answer } }] } },
  ], calls);
  const settings = { provider: 'custom', key: '', model: 'local', endpoint: 'http://localhost:11434/v1/' };
  await suggestWithAI(settings, 'Фокус', CATALOG, { fetcher });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://localhost:11434/v1/chat/completions');
  assert.ok(calls[0].body.response_format && !calls[1].body.response_format);
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

test('a rejected key and a missing key give clear messages', async () => {
  const fetcher = fakeFetch([{ status: 401, body: { error: { message: 'bad key' } } }]);
  await assert.rejects(suggestWithAI({ provider: 'openai', key: 'wrong' }, 'x', CATALOG, { fetcher }), /отклонил ключ/);
  await assert.rejects(suggestWithAI({ provider: 'openai', key: '' }, 'x', CATALOG), /API-ключ/);
});

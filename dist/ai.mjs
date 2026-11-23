// Смысловой подбор через языковую модель. Модель только выбирает ID из библиотеки:
// геометрию она не видит и новых объектов не создаёт. Ключ хранит браузер пользователя.
import { MEANINGS } from './semantics.mjs';

export const PROVIDERS = {
  openrouter: {
    label: 'OpenRouter', short: 'OpenRouter', kind: 'openai', model: 'openrouter/auto',
    endpoint: 'https://openrouter.ai/api/v1', keys: 'https://openrouter.ai/keys',
  },
  openai: {
    label: 'OpenAI', short: 'OpenAI', kind: 'openai', model: 'gpt-5-mini',
    endpoint: 'https://api.openai.com/v1', keys: 'https://platform.openai.com/api-keys',
  },
  gemini: {
    label: 'Google Gemini', short: 'Gemini', kind: 'gemini', model: 'gemini-flash-latest',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta', keys: 'https://aistudio.google.com/apikey',
  },
  custom: {
    label: 'Свой (совместимый с OpenAI)', short: 'свой сервис', kind: 'openai', model: '',
    endpoint: 'http://localhost:11434/v1', keys: '',
  },
};

export function systemPrompt(catalog) {
  const list = catalog.map(asset => `- ${asset.id} — ${asset.label}: ${MEANINGS[asset.id] || asset.tags.join(', ')}`).join('\n');
  return `Ты арт-директор редакции. Для заголовка статьи подбираешь обложку из готовой библиотеки изометрических иллюстраций.
Новые объекты рисовать нельзя: используй только ID из списка.

Библиотека:
${list}

Как выбирать:
1. Найди метафору: какую мысль заголовка можно показать предметами. Буквальное совпадение слов не обязательно.
2. Выбери 2 главных объекта, которые вместе передают эту мысль. Первый — самый важный.
3. Добавь 1 фоновый объект, если он поддерживает настроение. Фон рисуется бледным силуэтом позади.
4. Не повторяй объекты.

Ответь только JSON без пояснений вокруг:
{"metaphor":"одно короткое предложение по-русски","objects":[{"id":"…","role":"main","reason":"до 8 слов"},{"id":"…","role":"main","reason":"…"},{"id":"…","role":"background","reason":"…"}]}`;
}

function firstJSON(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw Error('Модель ответила не в формате JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

// Проверяет ответ модели: только известные ID, без повторов, 1–4 объекта, первый всегда главный.
export function readAnswer(text, catalog) {
  const known = new Set(catalog.map(asset => asset.id));
  const data = typeof text === 'string' ? firstJSON(text) : text;
  const objects = [];
  for (const item of Array.isArray(data?.objects) ? data.objects : []) {
    const id = typeof item?.id === 'string' ? item.id.trim().toLowerCase() : '';
    if (!known.has(id) || objects.some(object => object.id === id)) continue;
    const role = item.role === 'background' && objects.length ? 'background' : 'main';
    const reason = typeof item.reason === 'string' ? item.reason.trim().slice(0, 120) : '';
    objects.push({ id, role, reason });
    if (objects.length === 4) break;
  }
  if (!objects.length) throw Error('В ответе модели нет объектов из библиотеки.');
  const metaphor = typeof data.metaphor === 'string' ? data.metaphor.trim().slice(0, 200) : '';
  return { metaphor, objects };
}

export function buildRequest(settings, title, catalog) {
  const provider = PROVIDERS[settings.provider];
  if (!provider) throw Error('Неизвестный провайдер.');
  const model = (settings.model || provider.model).trim();
  const endpoint = (settings.endpoint || provider.endpoint).trim().replace(/\/+$/, '');
  if (!model) throw Error('Укажи модель.');
  const system = systemPrompt(catalog);
  const user = `Заголовок: «${title.slice(0, 250)}»`;
  if (provider.kind === 'gemini') {
    return {
      url: `${endpoint}/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.key },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
      },
      read: data => data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '',
    };
  }
  const headers = { 'Content-Type': 'application/json' };
  if (settings.key) headers.Authorization = `Bearer ${settings.key}`;
  if (settings.provider === 'openrouter') headers['X-Title'] = 'Montage illustration studio';
  return {
    url: `${endpoint}/chat/completions`,
    headers,
    body: {
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
    },
    read: data => data?.choices?.[0]?.message?.content || '',
  };
}

async function send(request, signal, fetcher) {
  const response = await fetcher(request.url, {
    method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal,
  });
  const raw = await response.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* текст ошибки разбираем ниже */ }
  if (!response.ok) {
    const detail = data?.error?.message || data?.error || raw.slice(0, 160);
    const error = Error(response.status === 401 || response.status === 403
      ? 'Провайдер отклонил ключ. Проверь ключ и доступ к модели.'
      : `Провайдер вернул ошибку ${response.status}: ${String(detail).slice(0, 160)}`);
    error.status = response.status;
    throw error;
  }
  return request.read(data);
}

// Запрос к модели с таймаутом. Если сервис не принимает response_format, повторяем без него.
export async function suggestWithAI(settings, title, catalog, { fetcher = fetch, timeout = 25000 } = {}) {
  if (!settings?.key && settings?.provider !== 'custom') throw Error('Добавь API-ключ в настройках ИИ.');
  const request = buildRequest(settings, title, catalog);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    let text;
    try {
      text = await send(request, controller.signal, fetcher);
    } catch (error) {
      if (error.status !== 400 || !request.body.response_format) throw error;
      delete request.body.response_format;
      text = await send(request, controller.signal, fetcher);
    }
    return readAnswer(text, catalog);
  } catch (error) {
    if (error.name === 'AbortError') throw Error('Модель не ответила за 25 секунд.');
    if (error instanceof TypeError) throw Error('Нет связи с провайдером. Проверь интернет или адрес сервиса.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Pace on your Mac: a small local server that runs Pace with the Claude Agent SDK
// (Claude Code's own engine), so Pace can read, edit and run code in a folder on
// this Mac, keep resumable chats, and remember things between chats.
//
//   cd server && npm install && npm start
//
// The Pace page (served from here, or from GitHub Pages) sends what you say to
// POST /api/chat and gets the reply back as a stream of events (SSE).
// Config: ../agent/config.yaml, ../agent/versions/<version>.yaml, ../agent/prompts/.
// Per-machine data: ~/.pace/ (token, config.yaml overrides, MEMORY.md, chats/).

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const AGENT_DIR = path.join(REPO, 'agent');
const HOME = process.env.PACE_HOME || path.join(os.homedir(), '.pace');
const MEMORY_FILE = path.join(HOME, 'MEMORY.md');
const CHATS_DIR = path.join(HOME, 'chats');
const TOKEN_FILE = path.join(HOME, 'token');
const CONFIRM_TIMEOUT_MS = 5 * 60 * 1000;   // an unanswered "Allow?" counts as no
const MAX_BODY = 1024 * 1024;

// ---------------------------------------------------------------------------
// Config: agent/config.yaml, overridden by ~/.pace/config.yaml. Read on every
// chat, so a changed knob applies to the next new chat without a restart.
// ---------------------------------------------------------------------------
const expandHome = (p) => (typeof p === 'string' && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

function readYaml(file) {
  try {
    return YAML.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw new Error(file + ': ' + e.message);
  }
}

function loadConfig() {
  const base = readYaml(path.join(AGENT_DIR, 'config.yaml'));
  const local = readYaml(path.join(HOME, 'config.yaml'));
  const cfg = { ...base, ...local, lifeline: { ...(base.lifeline || {}), ...(local.lifeline || {}) } };
  const versionFile = path.join(AGENT_DIR, 'versions', (cfg.version || 'v1') + '.yaml');
  const version = readYaml(versionFile);
  if (!version.name) throw new Error('No Pace version at ' + versionFile);
  cfg.port = Number(process.env.PACE_PORT || cfg.port || 8787);
  cfg.workspace = path.resolve(expandHome(cfg.workspace || REPO));
  cfg.allowed_roots = (cfg.allowed_roots || [cfg.workspace]).map((r) => path.resolve(expandHome(r)));
  cfg.allowed_origins = cfg.allowed_origins || [];
  return { cfg, version };
}

// A chat may only work in a folder inside one of the allowed roots.
function pickFolder(cfg, wanted) {
  if (!wanted) return cfg.workspace;
  const dir = path.resolve(expandHome(String(wanted)));
  const inside = cfg.allowed_roots.some((r) => dir === r || dir.startsWith(r + path.sep));
  if (!inside) throw httpError(400, 'Pace can only work inside ' + cfg.allowed_roots.join(' or ') + '.');
  let st;
  try { st = fs.statSync(dir); } catch { throw httpError(400, 'There is no folder ' + dir + ' on the Mac.'); }
  if (!st.isDirectory()) throw httpError(400, dir + ' is not a folder.');
  return dir;
}

// ---------------------------------------------------------------------------
// Memory, per Pace: ~/.pace/MEMORY.md, loaded into every new chat and changed
// through the remember / forget tools.
// ---------------------------------------------------------------------------
const readText = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };

function memoryTools() {
  return createSdkMcpServer({
    name: 'pace',
    version: '1.0.0',
    tools: [
      tool('remember',
        'Save one durable note about Jerry or his setup (a preference, a convention, a fact) to Pace\'s memory, ' +
        'which every future chat starts with. One short sentence per note. Not for things that only matter in this chat.',
        { note: z.string().min(3).max(500) },
        async ({ note }) => {
          const line = '- ' + note.replace(/\s+/g, ' ').trim() + ' (' + new Date().toISOString().slice(0, 10) + ')\n';
          await fsp.mkdir(HOME, { recursive: true });
          await fsp.appendFile(MEMORY_FILE, line, 'utf8');
          return { content: [{ type: 'text', text: 'Saved to memory: ' + line.trim() }] };
        }),
      tool('forget',
        'Remove every note in Pace\'s memory that contains this text (case-insensitive). Removes them fully.',
        { text: z.string().min(2).max(200) },
        async ({ text }) => {
          const lines = readText(MEMORY_FILE).split('\n');
          const needle = text.toLowerCase();
          const kept = lines.filter((l) => !l.toLowerCase().includes(needle));
          const removed = lines.length - kept.length;
          if (removed) await fsp.writeFile(MEMORY_FILE, kept.join('\n'), 'utf8');
          return { content: [{ type: 'text', text: removed ? 'Removed ' + removed + ' note(s).' : 'No note contains that.' }] };
        }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Chats, per chat: the Agent SDK keeps the full conversation (resumable by its
// session id). Pace also keeps ~/.pace/chats/<id>.json with the system prompt
// it started with, a plain log, and a summary written when the chat ends.
// ---------------------------------------------------------------------------
const chatFile = (id) => path.join(CHATS_DIR, id.replace(/[^\w-]/g, '') + '.json');

function readChat(id) {
  try { return JSON.parse(fs.readFileSync(chatFile(id), 'utf8')); } catch { return null; }
}
async function writeChat(rec) {
  await fsp.mkdir(CHATS_DIR, { recursive: true });
  const tmp = chatFile(rec.id) + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(rec, null, 1), 'utf8');
  await fsp.rename(tmp, chatFile(rec.id));
}
function allChats() {
  let names = [];
  try { names = fs.readdirSync(CHATS_DIR).filter((n) => n.endsWith('.json')); } catch {}
  return names.map((n) => readChat(n.slice(0, -5))).filter(Boolean).sort((a, b) => b.updated - a.updated);
}

// The newest chat that has a summary: what a new chat calls "Last time".
function lastSummary(exceptId) {
  return allChats().find((c) => c.summary && c.id !== exceptId) || null;
}

function buildSystemPrompt(version, extra) {
  let p = readText(path.join(AGENT_DIR, version.prompt_file || 'prompts/v1.md'));
  const humor = Math.max(0, Math.min(5, Number(version.humor ?? 2)));
  const fill = {
    humor,
    humor_style: (version.humor_styles || [])[humor] || '',
    voice_style: (version.modes || {}).voice || '',
    text_style: (version.modes || {}).text || '',
  };
  p = p.replace(/\{(\w+)\}/g, (m, k) => (k in fill ? String(fill[k]) : m));
  p += '\n\n## What you remember\n' + (readText(MEMORY_FILE).trim() || '(Nothing yet.)');
  const last = lastSummary();
  if (last) {
    p += '\n\n## Last time (' + new Date(last.updated).toISOString().slice(0, 10) + ', in ' + last.cwd + ')\n' + last.summary;
  }
  if (extra) p += '\n\n## Settings from the Pace app\n' + extra;
  return p;
}

// Ask Claude for a short handoff note about a finished chat.
async function summarize(rec, version, env) {
  const transcript = rec.log.map((l) => (l.role === 'user' ? 'Jerry: ' : 'Pace: ') + l.text).join('\n').slice(-40000);
  if (!transcript.trim()) return '';
  const q = query({
    prompt: 'Write a handoff note for the next chat about the conversation below, in at most 5 short lines: ' +
      'what was worked on (files, folders), where it was left, and loose ends or open questions. ' +
      'Plain text, no preamble.\n\n<chat>\n' + transcript + '\n</chat>',
    options: {
      model: version.model, effort: 'low', maxTurns: 1, tools: [], settingSources: [], persistSession: false,
      systemPrompt: 'You write short, factual handoff notes.', env, cwd: rec.cwd,
    },
  });
  let text = '';
  for await (const m of q) if (m.type === 'result' && m.subtype === 'success') text = m.result;
  return text.trim();
}

// ---------------------------------------------------------------------------
// A short label for each tool call, shown in the transcript.
// ---------------------------------------------------------------------------
function describeTool(name, input = {}) {
  const short = (s, n = 120) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
  const file = (p) => (p ? path.basename(String(p)) : '');
  switch (name) {
    case 'Read': return '📖 Read ' + file(input.file_path);
    case 'Edit': case 'MultiEdit': return '✏️ Edited ' + file(input.file_path);
    case 'Write': return '📝 Wrote ' + file(input.file_path);
    case 'NotebookEdit': return '📓 Edited ' + file(input.notebook_path);
    case 'Glob': return '🔎 Looked for ' + short(input.pattern);
    case 'Grep': return '🔎 Searched for ' + short(input.pattern);
    case 'Bash': return '⌨️ ' + short(input.description || input.command);
    case 'WebSearch': return '🌐 Searched the web: ' + short(input.query);
    case 'WebFetch': return '🌐 Read ' + short(input.url);
    case 'TodoWrite': return '☑️ Updated the plan';
    case 'Task': case 'Agent': return '🧑‍💻 Sent a helper: ' + short(input.description);
    case 'mcp__pace__remember': return '🧠 Remembered: ' + short(input.note);
    case 'mcp__pace__forget': return '🧠 Forgot notes about ' + short(input.text);
    default:
      if (name.startsWith('mcp__lifeline__')) return '📅 Lifeline: ' + name.slice(15).replace(/_/g, ' ');
      return '🔧 ' + name;
  }
}

// What the "Allow?" dialog says.
function describeAsk(name, input = {}) {
  if (name === 'Bash') return { title: 'Run a command?', text: String(input.command || '') };
  if (input.file_path) return { title: 'Allow ' + name + '?', text: String(input.file_path) };
  return { title: 'Allow ' + name + '?', text: JSON.stringify(input).slice(0, 600) };
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

function loadToken() {
  fs.mkdirSync(HOME, { recursive: true });
  let t = readText(TOKEN_FILE).trim();
  if (!t) {
    t = crypto.randomBytes(24).toString('base64url');
    fs.writeFileSync(TOKEN_FILE, t + '\n', { mode: 0o600 });
  }
  return t;
}
const TOKEN = loadToken();

function authorized(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function originAllowed(origin, cfg) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (u.origin === 'https://liujerry7.github.io') return true;
    if (u.protocol === 'https:' && u.hostname.endsWith('.ts.net')) return true;   // tailscale serve
    return cfg.allowed_origins.includes(u.origin);
  } catch { return false; }
}

function corsHeaders(req, cfg) {
  const origin = req.headers.origin;
  if (!origin || !originAllowed(origin, cfg)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type, x-pace-api-key',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-private-network': 'true',   // Chrome: a public page talking to localhost
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

function sendJson(res, status, obj, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw httpError(413, 'That message is too big.');
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw httpError(400, 'Bad JSON.'); }
}

// Pace's own page and icons, so http://localhost:PORT works on its own.
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
};
function serveStatic(req, res) {
  let entry = STATIC[req.url.split('?')[0]];
  const m = /^\/icons\/([\w.-]+\.png)$/.exec(req.url.split('?')[0]);
  if (m) entry = ['icons/' + m[1], 'image/png'];
  if (!entry) return false;
  fs.readFile(path.join(REPO, entry[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': entry[1], 'cache-control': 'no-cache' });
    res.end(data);
  });
  return true;
}

// ---------------------------------------------------------------------------
// One chat turn: run the agent and stream what happens as SSE events:
//   session {id, cwd, model} · block · text {delta} · note {delta} · tool {label}
//   confirm {id, title, text} · error {message} · done {sessionId, costUsd}
// ---------------------------------------------------------------------------
const busy = new Set();          // session ids with a turn running
const pendingConfirms = new Map();   // confirm id -> resolve(allow)

async function chatTurn(req, res, body) {
  const { cfg, version } = loadConfig();
  const text = String(body.text || '').trim();
  if (!text) throw httpError(400, 'Nothing to say.');
  const input = body.input === 'typed' ? 'typed' : 'spoken';
  let rec = body.sessionId ? readChat(String(body.sessionId)) : null;
  if (body.sessionId && !rec) throw httpError(404, 'That chat isn\'t on this Mac any more. Start a new one.');
  if (rec && busy.has(rec.id)) throw httpError(409, 'Pace is still working on the last message in this chat.');

  // A resumed chat keeps its folder and the system prompt it started with (stable prompt = prompt cache hits).
  const cwd = rec ? rec.cwd : pickFolder(cfg, body.folder);
  const systemPrompt = rec ? rec.prompt : buildSystemPrompt(version, String(body.extraPrompt || '').slice(0, 30000));
  const apiKey = process.env.ANTHROPIC_API_KEY || String(req.headers['x-pace-api-key'] || '');
  const env = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'pace/0.1', ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}) };

  res.writeHead(200, {
    'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive',
    ...corsHeaders(req, cfg),
  });
  let lastError = '';
  const send = (ev) => {
    if (ev.type === 'error') { if (ev.message === lastError) return; lastError = ev.message; }   // the SDK can report one failure several ways
    if (!res.writableEnded) res.write('data: ' + JSON.stringify(ev) + '\n\n');
  };
  const ping = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 15000);

  const abort = new AbortController();
  res.on('close', () => { if (!res.writableFinished) abort.abort(); });

  const lifeline = version.tools?.lifeline !== false && cfg.lifeline.url
    ? { lifeline: { type: 'http', url: cfg.lifeline.url, ...(cfg.lifeline.token ? { headers: { Authorization: 'Bearer ' + cfg.lifeline.token } } : {}) } }
    : {};

  const q = query({
    prompt: '[' + input + '] ' + text,
    options: {
      abortController: abort,
      cwd,
      env,
      model: version.model,
      effort: version.effort || 'medium',
      resume: rec ? rec.id : undefined,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: systemPrompt },
      settingSources: ['project', 'local'],   // the folder's CLAUDE.md and .claude settings
      includePartialMessages: true,
      permissionMode: 'default',
      allowedTools: version.tools?.auto_allow || [],
      mcpServers: { pace: memoryTools(), ...lifeline },
      stderr: (d) => { if (process.env.PACE_DEBUG) process.stderr.write(d); },
      canUseTool: async (name, toolInput, { signal }) => {
        const id = crypto.randomUUID();
        const ask = describeAsk(name, toolInput);
        send({ type: 'confirm', id, ...ask });
        const allow = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), CONFIRM_TIMEOUT_MS);
          const done = (v) => { clearTimeout(timer); resolve(v); };
          pendingConfirms.set(id, done);
          signal.addEventListener('abort', () => done(false), { once: true });
        });
        pendingConfirms.delete(id);
        return allow
          ? { behavior: 'allow', updatedInput: toolInput }
          : { behavior: 'deny', message: 'Jerry tapped Don\'t allow (or didn\'t answer). Ask what he\'d like instead.' };
      },
    },
  });

  let sessionId = rec ? rec.id : null;
  let reply = '';
  let costUsd = 0;
  if (rec) busy.add(rec.id);
  try {
    for await (const m of q) {
      if (m.type === 'system' && m.subtype === 'init') {
        if (!rec) {
          sessionId = m.session_id;
          rec = { id: sessionId, title: text.slice(0, 80), cwd, created: Date.now(), updated: Date.now(),
            version: version.name, model: version.model, prompt: systemPrompt, log: [], summary: '' };
          busy.add(sessionId);
        }
        send({ type: 'session', id: sessionId, cwd, model: m.model, version: version.name });
      } else if (m.type === 'stream_event' && !m.parent_tool_use_id) {
        const ev = m.event;
        if (ev.type === 'content_block_start') send({ type: 'block' });
        else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          reply += ev.delta.text;
          send({ type: 'text', delta: ev.delta.text });
        } else if (ev.type === 'content_block_delta' && ev.delta.type === 'thinking_delta' && ev.delta.thinking) {
          send({ type: 'note', delta: ev.delta.thinking });
        }
      } else if (m.type === 'assistant') {
        for (const b of m.message.content || []) {
          if (b.type === 'tool_use') send({ type: 'tool', label: (m.parent_tool_use_id ? '↳ ' : '') + describeTool(b.name, b.input) });
        }
        if (m.error && !m.parent_tool_use_id) send({ type: 'error', message: friendly(m.error) });
      } else if (m.type === 'result') {
        costUsd = m.total_cost_usd || 0;
        if (m.subtype !== 'success') send({ type: 'error', message: 'Pace stopped: ' + m.subtype.replace(/_/g, ' ') + '.' });
        else if (m.is_error) send({ type: 'error', message: friendly(m.result) });
      }
    }
  } catch (e) {
    if (!abort.signal.aborted) send({ type: 'error', message: friendly(e.message || String(e)) });
  } finally {
    clearInterval(ping);
    if (sessionId) busy.delete(sessionId);
    if (rec) {
      rec.log.push({ role: 'user', text }, ...(reply.trim() ? [{ role: 'assistant', text: reply.trim() }] : []));
      rec.updated = Date.now();
      rec.summary = '';   // out of date now; rewritten when the chat ends
      await writeChat(rec).catch((e) => console.error('Could not save chat:', e.message));
    }
    send({ type: 'done', sessionId, costUsd });
    res.end();
  }
}

function friendly(msg) {
  const s = String(msg || '');
  if (/authentication_failed|api key|apiKey|unauthorized|401|log ?in/i.test(s)) {
    return 'The Mac server has no working Anthropic key. Paste your key in Pace\'s Settings, or start the server with ANTHROPIC_API_KEY set.';
  }
  if (/billing/i.test(s)) return 'Anthropic says the account is out of credit.';
  if (/rate_limit|overloaded/i.test(s)) return 'Claude is busy right now. Try again in a moment.';
  return s.slice(0, 400) || 'Something went wrong on the Mac.';
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  let cfg;
  try { cfg = loadConfig().cfg; } catch (e) { sendJson(res, 500, { error: e.message }); return; }
  const cors = corsHeaders(req, cfg);
  if (req.headers.origin && !cors['access-control-allow-origin']) { sendJson(res, 403, { error: 'Origin not allowed.' }); return; }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (req.method === 'GET' && serveStatic(req, res)) return;

  const url = req.url.split('?')[0];
  if (!url.startsWith('/api/')) { sendJson(res, 404, { error: 'Not found.' }, cors); return; }
  if (!authorized(req)) { sendJson(res, 401, { error: 'Wrong or missing Pace token.' }, cors); return; }

  try {
    if (req.method === 'GET' && url === '/api/health') {
      const { cfg: c, version } = loadConfig();
      sendJson(res, 200, {
        ok: true, version: version.name, model: version.model, workspace: c.workspace,
        roots: c.allowed_roots, lifeline: !!c.lifeline.url, keyOnServer: !!process.env.ANTHROPIC_API_KEY,
        memoryNotes: readText(MEMORY_FILE).split('\n').filter((l) => l.trim()).length,
      }, cors);
    } else if (req.method === 'GET' && url === '/api/chats') {
      sendJson(res, 200, { chats: allChats().slice(0, 50).map(({ id, title, cwd, updated, summary }) => ({ id, title, cwd, updated, summary })) }, cors);
    } else if (req.method === 'POST' && url === '/api/chat') {
      await chatTurn(req, res, await readBody(req));
    } else if (req.method === 'POST' && url === '/api/confirm') {
      const body = await readBody(req);
      const done = pendingConfirms.get(String(body.id));
      if (done) done(body.allow === true);
      sendJson(res, done ? 200 : 404, { ok: !!done }, cors);
    } else if (req.method === 'POST' && url === '/api/end') {
      // The chat is over (the user started a new one): write its handoff note.
      const body = await readBody(req);
      const rec = body.sessionId ? readChat(String(body.sessionId)) : null;
      sendJson(res, rec ? 202 : 404, { ok: !!rec }, cors);
      if (rec && !rec.summary && rec.log.length && !busy.has(rec.id)) {
        const { version } = loadConfig();
        const apiKey = process.env.ANTHROPIC_API_KEY || String(req.headers['x-pace-api-key'] || '');
        const env = { ...process.env, ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}) };
        summarize(rec, version, env)
          .then(async (summary) => {
            const fresh = readChat(rec.id);
            if (fresh && summary && fresh.updated === rec.updated) { fresh.summary = summary; await writeChat(fresh); }
          })
          .catch((e) => console.error('Could not summarize chat:', e.message));
      }
    } else {
      sendJson(res, 404, { error: 'Not found.' }, cors);
    }
  } catch (e) {
    if (res.headersSent) { res.end(); return; }
    sendJson(res, e.status || 500, { error: e.status ? e.message : friendly(e.message) }, cors);
  }
});

const { cfg: startCfg, version: startVersion } = loadConfig();
server.listen(startCfg.port, '127.0.0.1', () => {
  const link = 'http://localhost:' + startCfg.port + '/#mac=' + TOKEN;
  console.log('Pace is running: ' + startVersion.name + ' on ' + startVersion.model);
  console.log('  Open on this Mac:  ' + link);
  console.log('  Works in:          ' + startCfg.workspace);
  console.log('  Memory and chats:  ' + HOME);
  console.log('  Anthropic key:     ' + (process.env.ANTHROPIC_API_KEY ? 'from ANTHROPIC_API_KEY' : 'sent by the Pace page (Settings)'));
  console.log('  From your phone:   run `tailscale serve --bg ' + startCfg.port + '`, then open');
  console.log('                     https://<this-mac>.<tailnet>.ts.net/#mac=' + TOKEN);
  console.log('Ctrl+C turns Pace off.');
});

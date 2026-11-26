#!/usr/bin/env node
// Minimal stand-in for `chromium --remote-debugging-pipe`: null-delimited JSON
// CDP on fd 3 (in) / fd 4 (out). Behaviour is steered by FAKE_CHROMIUM_MODE:
//   ok (default) — answer everything, screenshot returns "PNG:<url>:<w>x<h>"
//   hang-load    — never fire Page.loadEventFired
//   crash-shot   — exit(3) on Page.captureScreenshot
import { createReadStream, createWriteStream } from 'node:fs';

const mode = process.env.FAKE_CHROMIUM_MODE ?? 'ok';
const input = createReadStream(null, { fd: 3 });
const output = createWriteStream(null, { fd: 4 });
const send = (msg) => output.write(`${JSON.stringify(msg)}\0`);
const targets = new Map();
let n = 0;
let buf = '';

input.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let i = buf.indexOf('\0');
  while (i !== -1) {
    handle(JSON.parse(buf.slice(0, i)));
    buf = buf.slice(i + 1);
    i = buf.indexOf('\0');
  }
});
input.on('end', () => process.exit(0));

function handle({ id, method, params, sessionId }) {
  const reply = (result = {}) => send({ id, result, sessionId });
  switch (method) {
    case 'Browser.getVersion':
      return reply({ product: 'FakeChromium/1.0' });
    case 'Target.createTarget': {
      const targetId = `t${++n}`;
      targets.set(targetId, { w: params.width, h: params.height });
      return reply({ targetId });
    }
    case 'Target.attachToTarget': {
      const sid = `s-${params.targetId}`;
      targets.get(params.targetId).sid = sid;
      return reply({ sessionId: sid });
    }
    case 'Emulation.setDeviceMetricsOverride': {
      for (const t of targets.values()) {
        if (t.sid === sessionId) Object.assign(t, { w: params.width, h: params.height });
      }
      return reply();
    }
    case 'Page.navigate': {
      for (const t of targets.values()) if (t.sid === sessionId) t.url = params.url;
      reply({ frameId: 'f' });
      if (mode !== 'hang-load') {
        setTimeout(() => send({ method: 'Page.loadEventFired', params: {}, sessionId }), 5);
      }
      return;
    }
    case 'Page.captureScreenshot': {
      if (mode === 'crash-shot') process.exit(3);
      const t = [...targets.values()].find((x) => x.sid === sessionId);
      return reply({ data: Buffer.from(`PNG:${t.url}:${t.w}x${t.h}`).toString('base64') });
    }
    case 'Target.closeTarget':
      targets.delete(params.targetId);
      return reply({ success: true });
    default:
      return reply();
  }
}

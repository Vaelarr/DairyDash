// Capture the actual Android framebuffer while navigating the app's debug WebView.
// Examples:
//   node scripts/capture-helper.js inspect
//   node scripts/capture-helper.js capture /dashboard screenshots/user/01-home.png
//   node scripts/capture-helper.js eval artifacts/capture-expression.js
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const adb = process.env.ADB_PATH || join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
const device = process.env.ANDROID_SERIAL || 'emulator-5554';
const port = Number(process.env.CAPTURE_CDP_PORT || 9222);
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

function android(...args) {
  const result = spawnSync(adb, ['-s', device, ...args], { maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.toString() || `adb failed: ${args.join(' ')}`);
  return result.stdout;
}

export async function connect() {
  const sockets = android('shell', 'cat', '/proc/net/unix').toString();
  const pid = android('shell', 'pidof', 'io.ionic.starter').toString().trim();
  const socket = sockets.match(new RegExp(`@?(webview_devtools_remote_${pid})\\b`))?.[1];
  if (!socket) throw new Error('Open the DairyDash debug app on the emulator first.');
  android('forward', `tcp:${port}`, `localabstract:${socket}`);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = pages.find((item) => item.url?.startsWith('https://localhost')) || pages[0];
  if (!page) throw new Error('No debuggable WebView found.');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    ws.addEventListener('open', done, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.done(message.result);
  });
  const send = (method, params = {}) => new Promise((done, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 45000);
    pending.set(id, { done, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const settle = async () => {
    await delay(1200);
    await evaluate(`(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).filter(img => { const box = img.getBoundingClientRect(); return box.width && box.height && box.bottom > 0 && box.top < innerHeight; }).map(img => img.complete ? Promise.resolve() : new Promise(r => { img.addEventListener('load', r, {once:true}); img.addEventListener('error', r, {once:true}); setTimeout(r, 8000); })));
    })()`);
    await delay(800);
  };
  const navigate = async (route) => {
    await send('Page.navigate', { url: `https://localhost${route}` });
    for (let i = 0; i < 45; i++) {
      await delay(500);
      try {
        if (await evaluate(`document.readyState === 'complete' && !!document.querySelector('ion-router-outlet > :last-child ion-content')`)) break;
      } catch { /* Navigation replaces the execution context. */ }
    }
    await settle();
    return evaluate(`({url:location.pathname+location.search,title:document.title,text:document.body.innerText.slice(0,1600)})`);
  };
  const screenshot = async (filename) => {
    const target = resolve(root, filename);
    mkdirSync(dirname(target), { recursive: true });
    const png = android('exec-out', 'screencap', '-p');
    if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('Emulator did not return a PNG.');
    writeFileSync(target, png);
    return { file: target, bytes: png.length, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  };
  return { send, evaluate, settle, navigate, screenshot, close: () => ws.close() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const client = await connect();
  try {
    const [command, argument, filename] = process.argv.slice(2);
    if (command === 'inspect') {
      console.log(JSON.stringify(await client.evaluate(`({url:location.href,viewport:{width:innerWidth,height:innerHeight},storageKeys:Object.keys(localStorage),text:document.body.innerText.slice(0,7000)})`), null, 2));
    } else if (command === 'eval') {
      console.log(JSON.stringify(await client.evaluate(existsSync(argument) ? readFileSync(argument, 'utf8') : argument), null, 2));
    } else if (command === 'capture') {
      console.log(JSON.stringify(await client.navigate(argument), null, 2));
      console.log(JSON.stringify(await client.screenshot(filename), null, 2));
    } else {
      throw new Error('Use inspect, eval <file-or-expression>, or capture <route> <png-path>.');
    }
  } finally {
    client.close();
  }
}

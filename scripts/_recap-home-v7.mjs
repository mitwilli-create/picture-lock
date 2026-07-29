import { chromium } from 'playwright';
const DIR = 'output/takes/e2/capture';
const b = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, recordVideo: { dir: DIR, size: { width: 1920, height: 1080 } } });
const p = await ctx.newPage();
await p.goto('https://thestorytellermitch.com/', { waitUntil: 'networkidle', timeout: 45000 });
await p.evaluate(() => { document.body.classList.add('revealed'); document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')); });
await p.waitForTimeout(5200); // static hero hold; the machine cinemagraph plays under it
const v = p.video(); await ctx.close(); await v.saveAs(`${DIR}/home-hold-v6.webm`); await v.delete();
await b.close();
console.log('home-hold-v6.webm re-captured from live updated homepage');

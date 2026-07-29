import { chromium } from 'playwright';
const DIR = 'output/takes/e2/capture';
const b = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, recordVideo: { dir: DIR, size: { width: 1920, height: 1080 } } });
const p = await ctx.newPage();
await p.goto('https://thestorytellermitch.com/projects', { waitUntil: 'networkidle', timeout: 45000 });
await p.evaluate(() => { document.body.classList.add('revealed'); document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')); document.documentElement.style.scrollBehavior='auto'; document.body.style.scrollBehavior='auto'; });
// find the FEATURED heading and put it at the TOP of the viewport
const yTop = await p.evaluate(() => {
  const h = [...document.querySelectorAll('h1,h2,h3,div,span,p')].find(e => /^\s*featured\s*$/i.test(e.textContent||''));
  return h ? Math.round(h.getBoundingClientRect().top + window.scrollY - 40) : 470;
});
await p.evaluate(y => window.scrollTo({top:y,behavior:'instant'}), yTop);
await p.waitForTimeout(800);
// absolute-smooth eased scroll down through the featured project cards
await p.evaluate(([from]) => new Promise(done => {
  const to = from + 1500, ms = 4200, t0 = performance.now();
  const ease = x => x<.5 ? 4*x*x*x : 1-Math.pow(-2*x+2,3)/2;
  (function step(now){ const t=Math.min(1,(now-t0)/ms); window.scrollTo({top: from+(to-from)*ease(t), behavior:'instant'}); t<1?requestAnimationFrame(step):done(); })(performance.now());
}), [yTop]);
await p.waitForTimeout(800);
const v = p.video(); await ctx.close(); await v.saveAs(`${DIR}/projects-v6b.webm`); await v.delete();
await b.close();
console.log('projects-v6b.webm captured, FEATURED at y=' + yTop);

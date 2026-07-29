import { chromium } from 'playwright';
const DIR = 'output/takes/e2/capture';
const b = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, recordVideo: { dir: DIR, size: { width: 1920, height: 1080 } } });
const p = await ctx.newPage();
await p.goto('https://thestorytellermitch.com/projects', { waitUntil: 'networkidle', timeout: 45000 });
await p.evaluate(() => { document.body.classList.add('revealed'); document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')); document.documentElement.style.scrollBehavior='auto'; document.body.style.scrollBehavior='auto'; });
const yTop = await p.evaluate(() => { const h=[...document.querySelectorAll('h1,h2,h3,div,span,p')].find(e=>/^\s*featured\s*$/i.test(e.textContent||'')); return h?Math.round(h.getBoundingClientRect().top+window.scrollY-70):470; });
// pre-position ABOVE FEATURED so the shot is already moving downward when it reaches FEATURED
await p.evaluate(y => window.scrollTo({top:y,behavior:'instant'}), yTop-120);
await p.waitForTimeout(250);
await p.evaluate(([from]) => new Promise(done => {
  const to = from + 1650, ms = 4600, t0 = performance.now();
  const ease = x => x<.15 ? (x/.15)*(x/.15)*0.5*.15/1 : x; // gentle ramp-in then linear-ish
  const smooth = x => x*x*(3-2*x);
  (function step(now){ const t=Math.min(1,(now-t0)/ms); window.scrollTo({top: from+(to-from)*smooth(t), behavior:'instant'}); t<1?requestAnimationFrame(step):done(); })(performance.now());
}), [yTop-120]);
await p.waitForTimeout(700);
const v = p.video(); await ctx.close(); await v.saveAs(`${DIR}/projects-v6c.webm`); await v.delete();
await b.close();
console.log('projects-v6c.webm; FEATURED y=' + yTop + ' (started 120px above)');

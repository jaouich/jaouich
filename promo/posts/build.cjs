// Renders promo/posts/NN.jpg (1080x1350) and posts.md (captions) from posts.json
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const D = __dirname, posts = JSON.parse(fs.readFileSync(D + '/posts.json'));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 540, height: 675 }, deviceScaleFactor: 2 });
  await p.goto('file://' + D + '/post.html');
  let md = '# منشورات واحة باي (14 يوم)\n\nالصورة: `NN.jpg` · انسخ النص ونشره مع الصورة.\n';
  for (let i = 0; i < posts.length; i++) {
    const n = String(i + 1).padStart(2, '0');
    await p.evaluate((x) => window.show(x), posts[i]); await p.waitForTimeout(250);
    await p.screenshot({ path: `${D}/${n}.jpg`, type: 'jpeg', quality: 88 });
    md += `\n---\n\n## ${n} · ${posts[i].title}\n\n**العربية:**\n\n${posts[i].ar}\n\n**Français :**\n\n${posts[i].fr}\n\n#PiNetwork #PiOasis #واحة_باي #JerryDevelopment #Pioneers\n`;
  }
  fs.writeFileSync(D + '/posts.md', md);
  await b.close(); console.log('posts', posts.length);
})();

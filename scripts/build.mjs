import { cp, mkdir, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const name of ['index.html', 'styles.css', 'src']) {
  await cp(new URL(name, root), new URL(name, dist), { recursive: true });
}
console.log('已生成 dist/：可直接部署的静态网页，无运行时第三方依赖。');

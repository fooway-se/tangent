import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const index = await readFile(new URL('../../public/index.php', import.meta.url), 'utf8');
const installer = await readFile(new URL('../../public/install.php', import.meta.url), 'utf8');
const upgrade = await readFile(new URL('../../public/upgrade.php', import.meta.url), 'utf8');
const appRoot = await readFile(new URL('../../public/app-root.php', import.meta.url), 'utf8');

test('public assets and navigation links resolve relative to Tangent’s subdirectory', () => {
  assert.match(html, /href="\.\/assets\/tokens\.css"/);
  assert.match(html, /href="\.\/assets\/app\.css"/);
  assert.match(html, /src="\.\/assets\/app\.js"/);
  assert.match(html, /href="\.\/app\.html"/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:assets|app\.html)/);
});

test('frontend API requests use the current app directory as their base', () => {
  assert.match(app, /new URL\('\.\.\/api\/v1', import\.meta\.url\)/);
  assert.doesNotMatch(app, /fetch\(`\/api\/v1/);
});

test('server strips the public URL prefix before routing API requests', () => {
  assert.match(index, /AppBasePath::relativeRequestPath\(\$requestPath, \$basePath\)/);
  assert.match(index, /Request::fromHttp\([\s\S]*?\$relativePath/);
});

test('installer can resolve an arbitrary private app root and keeps setup URLs under the subdirectory', () => {
  assert.match(appRoot, /\.tangent-app-root/);
  assert.match(appRoot, /TANGENT_APP_ROOT/);
  assert.match(installer, /AppBasePath::fromFilesystemPaths/);
  assert.match(upgrade, /\$basePath \. '\/install\.php'/);
});

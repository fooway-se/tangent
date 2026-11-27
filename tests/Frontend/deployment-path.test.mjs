import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../../frontend/src/api.ts', import.meta.url), 'utf8');
const index = await readFile(new URL('../../public/index.php', import.meta.url), 'utf8');
const installer = await readFile(new URL('../../public/install.php', import.meta.url), 'utf8');
const upgrade = await readFile(new URL('../../public/upgrade.php', import.meta.url), 'utf8');
const appRoot = await readFile(new URL('../../public/app-root.php', import.meta.url), 'utf8');

test('public assets and navigation links resolve relative to Tangent’s subdirectory', () => {
  assert.match(html, /href="\.\/assets\/tokens-[a-f0-9]{12}\.css"/);
  assert.match(html, /href="\.\/assets\/app-[a-f0-9]{12}\.css"/);
  assert.match(html, /src="\.\/assets\/app-[a-f0-9]{12}\.js"/);
  assert.match(html, /src="\.\/assets\/theme-init-[a-f0-9]{12}\.js"/);
  assert.match(html, /href="\.\/app\.html"/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:assets|app\.html)/);
});

test('all JavaScript modules use content-hashed files and rewritten imports', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../public/assets/asset-manifest.json', import.meta.url), 'utf8'));
  const assets = manifest.assets;
  const styles = manifest.styles;
  const files = await readdir(new URL('../../public/assets/', import.meta.url));
  const canonical = files
    .filter((name) => /\.(?:js|mjs)$/.test(name) && !/-[a-f0-9]{12}\.(?:js|mjs)$/.test(name))
    .sort();
  const canonicalStyles = files
    .filter((name) => /\.css$/.test(name) && !/-[a-f0-9]{12}\.css$/.test(name))
    .sort();
  const generatedVersionedFiles = files
    .filter((name) => /-[a-f0-9]{12}\.(?:js|mjs|css)$/.test(name))
    .sort();
  assert.deepEqual(Object.keys(assets).sort(), canonical);
  assert.deepEqual(Object.keys(styles).sort(), canonicalStyles);
  assert.deepEqual(
    generatedVersionedFiles,
    [...Object.values(assets), ...Object.values(styles)].map(({ file }) => file).sort(),
    'generated assets contain only the current content-hashed files',
  );

  const appEntrypoint = html.match(/<script type="module" src="\.\/assets\/([^\"]+)"><\/script>/)?.[1];
  const themeEntrypoint = html.match(/<script src="\.\/assets\/([^\"]+)"><\/script>/)?.[1];
  const stylesheetLinks = [...html.matchAll(/<link rel="stylesheet" href="\.\/assets\/([^\"]+)"\s*\/?>/g)]
    .map((match) => match[1]);
  assert.equal(appEntrypoint, assets['app.js'].file);
  assert.equal(themeEntrypoint, assets['theme-init.js'].file);
  assert.deepEqual(stylesheetLinks, ['tokens.css', 'app.css'].map((source) => styles[source].file));

  const hashedFiles = new Set(Object.values(assets).map(({ file }) => file));
  for (const asset of Object.values(assets)) {
    assert.match(asset.file, /^.+-[a-f0-9]{12}\.m?js$/);
    const contents = await readFile(new URL(`../../public/assets/${asset.file}`, import.meta.url));
    const digest = createHash('sha256').update(contents).digest('hex');
    assert.equal(asset.sha256, digest);
    assert.equal(asset.file.match(/-([a-f0-9]{12})\.m?js$/)?.[1], digest.slice(0, 12));

    const specifiers = [...contents.toString('utf8').matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"](\.\/[^'"]+\.m?js)['"]/g)]
      .map((match) => match[1]);
    for (const specifier of specifiers) {
      assert.match(specifier, /^\.\/[^/]+-[a-f0-9]{12}\.m?js$/);
      assert.ok(hashedFiles.has(specifier.slice(2)), `missing versioned import ${specifier}`);
    }
  }

  for (const style of Object.values(styles)) {
    assert.match(style.file, /^.+-[a-f0-9]{12}\.css$/);
    const contents = await readFile(new URL(`../../public/assets/${style.file}`, import.meta.url));
    const digest = createHash('sha256').update(contents).digest('hex');
    assert.equal(style.sha256, digest);
    assert.equal(style.file.match(/-([a-f0-9]{12})\.css$/)?.[1], digest.slice(0, 12));
  }
});

test('frontend API requests use the current app directory as their base', () => {
  assert.match(api, /new URL\('\.\.\/api\/v1', import\.meta\.url\)/);
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

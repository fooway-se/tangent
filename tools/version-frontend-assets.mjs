import { createHash } from 'node:crypto';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDirectory = resolve(root, 'public/assets');
const htmlPath = resolve(root, 'public/app.html');
const manifestPath = resolve(assetsDirectory, 'asset-manifest.json');
const versionedAssetPattern = /-[a-f0-9]{12}\.(?:js|mjs)$/;
const versionedStylePattern = /-[a-f0-9]{12}\.css$/;
const importSpecifierPattern = /((?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"])(\.\.?\/[^'"]+\.m?js)(['"])/g;
const sourceNames = (await readdir(assetsDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.(?:js|mjs)$/.test(entry.name) && !versionedAssetPattern.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const styleNames = (await readdir(assetsDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.css$/.test(entry.name) && !versionedStylePattern.test(entry.name))
  .map((entry) => entry.name)
  .sort();

if (!sourceNames.includes('app.js') || !sourceNames.includes('theme-init.js')) {
  throw new Error('Expected app.js and theme-init.js in public/assets.');
}

const sourceContents = new Map(await Promise.all(
  sourceNames.map(async (name) => [name, await readFile(resolve(assetsDirectory, name))]),
));
const state = new Map();
const versionedAssets = new Map();

function resolveDependency(sourceName, specifier) {
  const dependencyName = posix.normalize(posix.join(posix.dirname(sourceName), specifier));
  if (dependencyName.startsWith('../') || !sourceContents.has(dependencyName)) {
    throw new Error(`Cannot version ${sourceName}; local import ${specifier} is outside the frontend asset set.`);
  }
  return dependencyName;
}

function versionAsset(sourceName) {
  if (state.get(sourceName) === 'done') return versionedAssets.get(sourceName);
  if (state.get(sourceName) === 'visiting') {
    throw new Error(`Cannot content-version a cyclic frontend import involving ${sourceName}.`);
  }

  state.set(sourceName, 'visiting');
  const sourceText = sourceContents.get(sourceName).toString('utf8');
  const importPattern = new RegExp(importSpecifierPattern.source, 'g');
  const content = sourceText.replace(importPattern, (match, prefix, specifier, suffix) => {
    const dependency = versionAsset(resolveDependency(sourceName, specifier));
    const relativeDependency = posix.relative(posix.dirname(sourceName), dependency.file);
    const relativeSpecifier = relativeDependency.startsWith('.') ? relativeDependency : `./${relativeDependency}`;
    return `${prefix}${relativeSpecifier}${suffix}`;
  });
  const bytes = Buffer.from(content, 'utf8');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const extension = extname(sourceName);
  const file = `${sourceName.slice(0, -extension.length)}-${digest.slice(0, 12)}${extension}`;
  const asset = { file, bytes, sha256: digest };
  versionedAssets.set(sourceName, asset);
  state.set(sourceName, 'done');
  return asset;
}

for (const sourceName of sourceNames) versionAsset(sourceName);

const manifestAssets = Object.fromEntries(
  [...versionedAssets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceName, asset]) => [sourceName, { file: asset.file, sha256: asset.sha256 }]),
);
const versionedStyles = new Map(await Promise.all(styleNames.map(async (sourceName) => {
  const bytes = await readFile(resolve(assetsDirectory, sourceName));
  const digest = createHash('sha256').update(bytes).digest('hex');
  const file = sourceName.slice(0, -4) + '-' + digest.slice(0, 12) + '.css';
  return [sourceName, { file, bytes, sha256: digest }];
})));
const manifestStyles = Object.fromEntries(
  [...versionedStyles.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceName, style]) => [sourceName, { file: style.file, sha256: style.sha256 }]),
);

for (const asset of versionedAssets.values()) {
  const path = resolve(assetsDirectory, asset.file);
  let existing;
  try {
    existing = await readFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!existing || !existing.equals(asset.bytes)) await writeFile(path, asset.bytes);
}
for (const style of versionedStyles.values()) {
  const path = resolve(assetsDirectory, style.file);
  let existing;
  try {
    existing = await readFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!existing || !existing.equals(style.bytes)) await writeFile(path, style.bytes);
}

const currentVersionedFiles = new Set([
  ...[...versionedAssets.values()].map((asset) => asset.file),
  ...[...versionedStyles.values()].map((style) => style.file),
]);
const existingAssets = await readdir(assetsDirectory, { withFileTypes: true });
for (const entry of existingAssets) {
  if (!entry.isFile()
    || !versionedAssetPattern.test(entry.name) && !versionedStylePattern.test(entry.name)
    || currentVersionedFiles.has(entry.name)) continue;
  await unlink(resolve(assetsDirectory, entry.name));
}

await writeFile(manifestPath, JSON.stringify({ assets: manifestAssets, styles: manifestStyles }, null, 2) + '\n');

let html = await readFile(htmlPath, 'utf8');
const scriptTags = [
  {
    pattern: /<script src="\.\/assets\/(?:theme-init\.js|theme-init-[a-f0-9]{12}\.js)(?:\?v=[^"]*)?"><\/script>/,
    name: versionedAssets.get('theme-init.js').file,
  },
  {
    pattern: /<script type="module" src="\.\/assets\/(?:app\.js|app-[a-f0-9]{12}\.js)(?:\?v=[^"]*)?"><\/script>/,
    name: versionedAssets.get('app.js').file,
  },
];

for (const { pattern, name } of scriptTags) {
  if (!pattern.test(html)) throw new Error(`Could not find the ${name} script tag in public/app.html.`);
  html = html.replace(pattern, (match) => {
    const typeAttribute = match.includes('type="module"') ? ' type="module"' : '';
    return `<script${typeAttribute} src="./assets/${name}"></script>`;
  });
}

const stylesheetTags = [
  {
    pattern: /<link rel="stylesheet" href="\.\/assets\/(?:tokens\.css|tokens-[a-f0-9]{12}\.css)(?:\?v=[^"]*)?">/,
    name: versionedStyles.get('tokens.css')?.file,
  },
  {
    pattern: /<link rel="stylesheet" href="\.\/assets\/(?:app\.css|app-[a-f0-9]{12}\.css)(?:\?v=[^"]*)?">/,
    name: versionedStyles.get('app.css')?.file,
  },
];

for (const { pattern, name } of stylesheetTags) {
  if (!name || !pattern.test(html)) throw new Error('Could not find a stylesheet link in public/app.html.');
  html = html.replace(pattern, '<link rel="stylesheet" href="./assets/' + name + '">');
}

await writeFile(htmlPath, html);

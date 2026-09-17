import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, css, releaseBytes] = await Promise.all([
  readFile(new URL('./index.html', import.meta.url), 'utf8'),
  readFile(new URL('./styles.css', import.meta.url), 'utf8'),
  readFile(new URL('./release.json', import.meta.url)),
]);
const release = JSON.parse(releaseBytes);
const rootUrl = 'https://haohaoime.com/';
const icpUrl = 'https://beian.miit.gov.cn/';
const icpNumber = '冀ICP备2026037417号-1';
const policeUrl = 'https://beian.mps.gov.cn/#/query/webSearch?code=13010802002861';
const policeNumber = '冀公网安备13010802002861号';
const apkHref = 'downloads/haohao-ime-3.3.27-20261012-arm64-v8a-cloud-preview.apk';
const markup = html.replace(/<!--[\s\S]*?-->/g, '');

function attributes(opening) {
  return new Map([...opening.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)]
    .map(([, name, double, single, bare]) => [name.toLowerCase(), double ?? single ?? bare ?? '']));
}
function elements(tag, source = markup) {
  return [...source.matchAll(new RegExp('<' + tag + '\\b([^>]*)>', 'gi'))].map(([, opening]) => attributes(opening));
}
function ancestryOfFilingLink(url) {
  const stack = [];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const [, closing, rawTag, opening] of markup.matchAll(/<(\/?)([a-z][\w:-]*)([^>]*)>/gi)) {
    const tag = rawTag.toLowerCase();
    if (closing) { assert.equal(stack.pop()?.tag, tag); continue; }
    const attrs = attributes(opening);
    const node = { tag, attrs };
    if (tag === 'a' && attrs.get('href') === url) return [...stack, node];
    if (!voidTags.has(tag) && !opening.trimEnd().endsWith('/')) stack.push(node);
  }
  assert.fail('Missing filing link: ' + url);
}

test('canonical and sharing metadata use the single official HTTPS root', () => {
  const head = markup.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  assert.ok(head);
  const canonical = elements('link').filter(attrs => (attrs.get('rel') ?? '').split(/\s+/).includes('canonical'));
  assert.equal(canonical.length, 1, 'Do not duplicate the canonical link');
  assert.equal(canonical[0].get('href'), rootUrl);
  assert.ok(elements('link', head).some(attrs => attrs.get('rel') === 'canonical' && attrs.get('href') === rootUrl));
  const metadata = elements('meta');
  for (const [attribute, key, expected] of [
    ['property', 'og:url', rootUrl],
    ['property', 'og:image', rootUrl + 'assets/og.png?v=2'],
    ['name', 'twitter:image', rootUrl + 'assets/og.png?v=2'],
  ]) {
    const matches = metadata.filter(attrs => attrs.get(attribute) === key);
    assert.equal(matches.length, 1, 'Exactly one ' + key + ' value');
    assert.equal(matches[0].get('content'), expected);
    assert.ok(elements('meta', head).some(attrs => attrs.get(attribute) === key && attrs.get('content') === expected), key + ' belongs in the document head');
  }
});

test('the footer links the complete confirmed service ICP number to MIIT safely', () => {
  const links = [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map(([, opening, body]) => ({ attrs: attributes(opening), label: body.replace(/<[^>]+>/g, '').trim() }));
  const icp = links.filter(link => link.attrs.get('href') === icpUrl);
  assert.equal(icp.length, 1);
  assert.equal(icp[0].label, icpNumber, 'Keep the website service suffix -1');
  assert.equal(icp[0].attrs.get('target'), '_blank');
  assert.deepEqual(new Set(icp[0].attrs.get('rel')?.split(/\s+/)), new Set(['noopener', 'noreferrer']));
  assert.equal((markup.match(/冀ICP备2026037417号-1/g) ?? []).length, 1);
});

test('the approved police number uses the official query link and unmodified official badge', async () => {
  const links = [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map(([, opening, body]) => ({ attrs: attributes(opening), body }));
  const police = links.filter(link => link.attrs.get('href') === policeUrl);
  assert.equal(police.length, 1);
  assert.equal(police[0].body.replace(/<[^>]+>/g, '').trim(), policeNumber);
  assert.equal(police[0].attrs.get('target'), '_blank');
  assert.deepEqual(new Set(police[0].attrs.get('rel')?.split(/\s+/)), new Set(['noopener', 'noreferrer']));
  assert.deepEqual(markup.match(/[\u4e00-\u9fff]公网安备\s*\d+号/g), [policeNumber], 'Never reuse the government portal’s own filing number');
  const badges = elements('img', police[0].body);
  assert.equal(badges.length, 1);
  assert.equal(badges[0].get('src'), 'assets/beian-police.png');
  assert.equal(badges[0].get('width'), '20');
  assert.equal(badges[0].get('height'), '22');
  assert.equal(badges[0].get('alt'), '', 'The adjacent full number already labels the link');
  assert.match(police[0].body, /^\s*<img\b[^>]*>\s*<span>/, 'The official badge precedes the number');
  const badge = await readFile(new URL('./assets/beian-police.png', import.meta.url));
  assert.equal(createHash('sha256').update(badge).digest('hex'), '6189a29f86e1756d1970f4446b9f836642c283c373d312dbddeb42411f1608e6');
  assert.ok(badge.length < 16 * 1024);
  assert.match(await readFile(new URL('./build.mjs', import.meta.url), 'utf8'), /"beian-police\.png"/);
  assert.match(css, /\.police-filing\s*\{[^}]*display:inline-flex;[^}]*align-items:center/);
});

for (const url of [icpUrl, policeUrl]) test('filing stays visible without scripts or opening a disclosure: ' + url, () => {
  const ancestry = ancestryOfFilingLink(url);
  assert.ok(ancestry.some(node => node.tag === 'footer'));
  assert.ok(ancestry.some(node => (node.attrs.get('class') ?? '').split(/\s+/).includes('footer-links')),
    'Reuse the existing brand footer links');
  for (const { tag, attrs } of ancestry) {
    assert.ok(!['details', 'dialog', 'template', 'noscript', 'script'].includes(tag), 'ICP information must not require opening a disclosure or running scripts');
    assert.ok(!attrs.has('hidden'));
    assert.notEqual(attrs.get('aria-hidden'), 'true');
    assert.doesNotMatch(attrs.get('class') ?? '', /(?:^|\s)(?:sr-only|visually-hidden|reveal)(?:\s|$)/);
    assert.doesNotMatch(attrs.get('style') ?? '', /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;\s]|$)/i);
  }
  assert.match(css, /\.footer-links\s*\{[^}]*flex-wrap:\s*wrap/, 'Existing mobile wrapping is preserved');
  assert.match(css, /a:focus-visible[^}]*outline:/, 'The link retains a visible keyboard focus style');
});

test('domain and ICP changes leave the 3.3.27 download and frozen release metadata untouched', () => {
  const downloads = elements('a').filter(attrs => /\.apk(?:[?#]|$)/.test(attrs.get('href') ?? ''));
  assert.equal(downloads.length, 2);
  for (const attrs of downloads) {
    assert.equal(attrs.get('href'), apkHref);
    assert.ok(attrs.has('download'));
  }
  assert.ok(elements('a').some(attrs => attrs.get('href') === apkHref + '.sha256'));
  assert.equal(release.version, '3.3.27');
  assert.equal(release.versionCode, 20261012);
  assert.equal('downloads/' + release.filename, apkHref);
  assert.equal(release.sha256, 'eb214dd56ff8ec3bae00bda1035d8c76a9e328d15b3c04ac8e97714987e12ea9');
  assert.equal(createHash('sha256').update(releaseBytes).digest('hex'), '3dab5cf4e82f24bf91cd2907e5c56c5293ebb52b5c01a7e469f0fd3fba4c3f19',
    'The domain/ICP-only change must preserve every release metadata byte');
  assert.match(markup, /3\.3\.27 云内测 · 无需填写 API · 云翻译截止 2026-09-30/);
  assert.match(markup, /云内测截止 2026-09-30；到期停止内置云请求，本地输入和学习仍可使用。/);
});

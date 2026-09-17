import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, css, releaseBytes] = await Promise.all([
  readFile(new URL('./index.html', import.meta.url), 'utf8'),
  readFile(new URL('./styles.css', import.meta.url), 'utf8'),
  readFile(new URL('./release.json', import.meta.url)),
]);
const release = JSON.parse(releaseBytes);
const apkHref = 'downloads/haohao-ime-3.3.27-20261012-arm64-v8a-cloud-preview.apk';
function attributes(markup) {
  return new Map([...markup.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)]
    .map(([, name, double, single, bare]) => [name.toLowerCase(), double ?? single ?? bare ?? '']));
}
function region(tag, id) {
  const match = [...html.matchAll(new RegExp('<' + tag + '\\b([^>]*)>([\\s\\S]*?)<\\/' + tag + '>', 'g'))]
    .find(([, opening]) => id === undefined || attributes(opening).get('id') === id);
  assert.ok(match, 'Required section: ' + tag + (id ? '#' + id : ''));
  return match[2];
}
function anchors(markup) {
  return [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, opening, body]) => ({ attrs: attributes(opening), body }));
}
function visibleLabel(body) {
  return body.replace(/<([\w:-]+)\b[^>]*\baria-hidden=["']true["'][^>]*>[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
function classes(link) { return new Set((link.attrs.get('class') ?? '').split(/\s+/)); }
function declarations(selector) {
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(',').some(value => value.trim() === selector));
  return new Map(blocks.flatMap(([, , body]) => [...body.matchAll(/([\w-]+)\s*:\s*([^;]+)(?:;|$)/g)]
    .map(([, property, value]) => [property, value.trim()])));
}
const nav = anchors(region('nav')).filter(link => link.attrs.get('href') === '#download');
const hero = anchors(region('section', 'top')).filter(link => link.attrs.get('href') === apkHref);
const download = anchors(region('section', 'download')).filter(link => link.attrs.get('href') === apkHref);

test('navigation, hero and download section consistently say 安卓版下载', () => {
  assert.equal(nav.length, 1); assert.equal(hero.length, 1); assert.equal(download.length, 1);
  for (const link of [...nav, ...hero, ...download]) {
    assert.equal(visibleLabel(link.body), '安卓版下载');
    assert.doesNotMatch(link.body, /<br\b|&#(?:10|13|x0*a|x0*d);/i, 'Download label has no explicit line break');
    const accessibleLabel = link.attrs.get('aria-label');
    if (accessibleLabel !== undefined) assert.equal(accessibleLabel, '安卓版下载', 'An aria-label must not retain the old wording');
  }
});

test('navigation keeps its section anchor and exactly two real APK links retain download attributes', () => {
  assert.equal(nav.length, 1); assert.ok(!nav[0].attrs.has('download'), 'Navigation still scrolls to the download section');
  const direct = anchors(html).filter(link => /\.apk(?:[?#]|$)/.test(link.attrs.get('href') ?? ''));
  assert.equal(direct.length, 2, 'Exactly one APK entry in hero and one in the download section');
  assert.equal(hero.length, 1); assert.equal(download.length, 1);
  for (const link of direct) {
    assert.equal(link.attrs.get('href'), apkHref);
    assert.ok(link.attrs.has('download'), 'Real APK entries must retain the download attribute');
  }
  assert.equal('downloads/' + release.filename, apkHref);
});

test('hero download is a mint/focus button and all three labels use no-wrap button styling', () => {
  assert.equal(hero.length, 1);
  const heroClasses = classes(hero[0]);
  assert.ok(heroClasses.has('button') && heroClasses.has('button-download'));
  assert.ok(!heroClasses.has('text-link'), 'Hero download must no longer look like a plain text link');
  const button = declarations('.button'), downloadButton = declarations('.button-download');
  assert.equal(downloadButton.get('background') ?? downloadButton.get('background-color'), 'var(--mint)');
  assert.equal(downloadButton.get('color'), 'var(--focus)');
  for (const link of [...nav, ...hero, ...download]) {
    const names = classes(link); assert.ok(names.has('button'), 'Every download entry retains button structure');
    const wrap = names.has('button-download') ? downloadButton.get('white-space') ?? button.get('white-space') : button.get('white-space');
    assert.equal(wrap, 'nowrap', 'The full download label stays on one line');
  }
});

test('authorized cloud-preview download matches the frozen, fixed-signature 3.3.27 APK', () => {
  assert.equal(release.version, '3.3.27'); assert.equal(release.versionCode, 20261012);
  assert.equal(release.date, '2026-09-15'); assert.equal(release.applicationId, 'com.osfans.trime.debug');
  assert.equal(release.variant, 'debug'); assert.equal(release.abi, 'arm64-v8a');
  assert.equal(release.bytes, 57381309);
  assert.equal(release.sha256, 'eb214dd56ff8ec3bae00bda1035d8c76a9e328d15b3c04ac8e97714987e12ea9');
  assert.equal(release.signerSha256, '62b4a4c620df03d8bd6c65e21a8cfa5cd11265465e25070dc53006b31de5a101');
  assert.equal(release.distribution, 'friends-cloud-preview');
  assert.equal(release.publicDistributionRiskAccepted, true);
  assert.equal(release.cloudPreviewExpiresOn, '2026-09-30');
  assert.equal(release.internalCloudEnabled, true); assert.equal(release.speechCloudEnabled, true);
  assert.equal(release.speechAvailable, false);
  assert.match(html, /3\.3\.27 云内测.*2026-09-30/);
  assert.match(html, /本地优先、云端补充/);
  assert.match(html, /无需填写 API/);
  assert.match(html, /腾讯云发音暂未开放/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertReleasePolicy, CLOUD_PREVIEW_EXPIRES_ON } from "./release-policy.mjs";

const publicRelease = { internalCloudEnabled: false, speechCloudEnabled: false };
const previewRelease = {
  distribution: "friends-cloud-preview",
  internalCloudEnabled: true,
  cloudPreviewExpiresOn: "2026-09-30",
  publicDistributionRiskAccepted: true,
  speechCloudEnabled: true,
  speechAvailable: false,
};
const notice = '<p class="download-note">云内测 · 2026-09-30 到期 · 腾讯云发音暂未开放</p>';
const page = body => '<!doctype html><html><head><title>好好输入法</title></head><body><section id="download">' + body + '</section></body></html>';

test("legacy and explicit public distributions retain the no-embedded-cloud policy", () => {
  assertReleasePolicy(publicRelease, page(""));
  assertReleasePolicy({ ...publicRelease, distribution: "public" }, page(""));
  for (const distribution of [undefined, "public"]) {
    for (const key of ["internalCloudEnabled", "speechCloudEnabled"]) {
      for (const value of [true, undefined, null, 0, "false"]) {
        assert.throws(() => assertReleasePolicy({ ...publicRelease, distribution, [key]: value, publicDistributionRiskAccepted: true }, page(notice)));
      }
    }
  }
});

test("only the explicitly named preview distribution can use the exception", () => {
  for (const distribution of [null, "", "preview", "friends-cloud-preview ", true]) {
    assert.throws(() => assertReleasePolicy({ ...previewRelease, distribution }, page(notice)), /distribution/);
  }
  for (const release of [null, [], "friends-cloud-preview"]) assert.throws(() => assertReleasePolicy(release, page(notice)), /metadata/);
});

test("preview allows either speech configuration flag, but never claims speech availability", () => {
  for (const speechCloudEnabled of [true, false]) assertReleasePolicy({ ...previewRelease, speechCloudEnabled }, page(notice));
  for (const speechCloudEnabled of [undefined, null, 1, "true"]) {
    assert.throws(() => assertReleasePolicy({ ...previewRelease, speechCloudEnabled }, page(notice)), /布尔/);
  }
  for (const speechAvailable of [true, undefined, null, 0, "false"]) {
    assert.throws(() => assertReleasePolicy({ ...previewRelease, speechAvailable }, page(notice)), /语音服务/);
  }
  assert.throws(() => assertReleasePolicy({ ...publicRelease, speechAvailable: true }, page("")), /语音服务/);
});

test("preview needs strict affirmative cloud and public-risk acknowledgements", () => {
  for (const key of ["internalCloudEnabled", "publicDistributionRiskAccepted"]) {
    for (const value of [undefined, false, null, 1, "true"]) {
      assert.throws(() => assertReleasePolicy({ ...previewRelease, [key]: value }, page(notice)));
    }
  }
});

test("preview expiration is the exact agreed date, not a later date or another representation", () => {
  assert.equal(CLOUD_PREVIEW_EXPIRES_ON, "2026-09-30");
  for (const cloudPreviewExpiresOn of [undefined, null, "2026-09-29", "2026-10-01", "2026/09/30", "2026-09-30T23:59:59Z", "2026-09-30 ", 20260930]) {
    assert.throws(() => assertReleasePolicy({ ...previewRelease, cloudPreviewExpiresOn }, page(notice)), /到期日/);
  }
});

test("a visible download note must name both the cloud preview and its expiration", () => {
  assertReleasePolicy(previewRelease, page(notice));
  assertReleasePolicy(previewRelease, page('<p class="download-note">云翻译内测：<strong>2026-09-30</strong> 截止；语音尚未上线</p>'));
  for (const body of [notice.replace("云内测", "测试版"), notice.replace("2026-09-30", "2026-10-01"), notice.replace("到期", "发布"), notice.replace('class="download-note"', 'class="other"')]) {
    assert.throws(() => assertReleasePolicy(previewRelease, page(body)), /download-note/);
  }
});

test("hidden, inert or collapsed disclosures do not count as a visible download warning", () => {
  for (const body of [
    '<!--' + notice + '-->', '<script type="text/plain">' + notice + '</script>', '<style>' + notice + '</style>',
    '<template>' + notice + '</template>', '<noscript>' + notice + '</noscript>', '<details>' + notice + '</details>',
    '<div hidden>' + notice + '</div>', '<div aria-hidden="true">' + notice + '</div>',
    '<div class="sr-only">' + notice + '</div>', '<div class="visually-hidden">' + notice + '</div>',
    '<div style="display: none">' + notice + '</div>', '<div style="visibility:hidden">' + notice + '</div>',
    notice.replace('<p ', '<p hidden '), notice.replace('<p ', '<p aria-hidden="true" '),
  ]) assert.throws(() => assertReleasePolicy(previewRelease, page(body)), /download-note/);
  assert.throws(() => assertReleasePolicy(previewRelease, '<html><head>' + notice + '</head><body></body></html>'), /download-note/);
});

test("voice configuration cannot be advertised as a launched or available service", () => {
  for (const claim of ["语音已上线", "语音服务已经开放", "腾讯云发音现已可用", "联网发音已启用", "已支持语音"]) {
    assert.throws(() => assertReleasePolicy(previewRelease, page(notice + '<p>' + claim + '</p>')), /宣称/);
    assert.throws(() => assertReleasePolicy(publicRelease, page('<p>' + claim + '</p>')), /宣称/);
  }
  assert.throws(() => assertReleasePolicy(previewRelease, page(notice.replace("腾讯云发音暂未开放", ""))), /明确说明/);
  for (const status of ["语音暂未上线", "语音尚未开放", "语音不可用", "腾讯云发音暂未开放"]) {
    assertReleasePolicy(previewRelease, page(notice.replace("腾讯云发音暂未开放", status)));
  }
});

test("speech status may remain in accessible installation details without duplicating the download note", () => {
  const downloadNote = '<p class="download-note">3.3.27 云内测 · 无需填写 API · 云翻译截止 2026-09-30</p>';
  const details = '<details><summary>安装说明</summary><p>腾讯云发音暂未开放。</p></details>';
  assertReleasePolicy(previewRelease, page(downloadNote + details));
  assert.throws(() => assertReleasePolicy(previewRelease, page(downloadNote + details.replace("暂未开放", "已上线"))), /宣称/);
  assert.throws(() => assertReleasePolicy(previewRelease, page(downloadNote + details.replace('<p>', '<p hidden>'))), /明确说明/);
});

test("the website checker invokes the shared release policy", async () => {
  const checker = await readFile(new URL("./check.mjs", import.meta.url), "utf8");
  assert.match(checker, /import\s*\{\s*assertReleasePolicy\s*\}\s*from\s*["']\.\/release-policy\.mjs["']/);
  assert.match(checker, /assertReleasePolicy\(release,\s*html\)/);
});

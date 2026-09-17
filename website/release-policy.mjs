import assert from "node:assert/strict";

export const CLOUD_PREVIEW_EXPIRES_ON = "2026-09-30";

// This is a source-level disclosure check, not a replacement for visual browser QA.
// Only a normally visible download-note counts; comments, hidden content and
// collapsed installation details must not stand in for the download warning.
function pageCopy(html) {
  const stack = [], notes = [], text = [];
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  for (const token of html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) ?? []) {
    if (token.startsWith("<!--")) continue;
    const closing = token.match(/^<\/([\w:-]+)/);
    if (closing) {
      const index = stack.findLastIndex(frame => frame.tag === closing[1].toLowerCase());
      if (index >= 0) stack.splice(index);
      text.push(" ");
      continue;
    }
    const opening = token.match(/^<([\w:-]+)\b([^>]*)>/);
    if (opening) {
      const tag = opening[1].toLowerCase();
      const attrs = new Map([...opening[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)]
        .map(([, name, double, single, bare]) => [name.toLowerCase(), double ?? single ?? bare ?? ""]));
      const parent = stack.at(-1);
      const classes = (attrs.get("class") ?? "").split(/\s+/);
      const hidden = parent?.hidden || ["head", "script", "style", "template", "noscript"].includes(tag)
        || attrs.has("hidden") || attrs.get("aria-hidden") === "true" || classes.some(name => ["sr-only", "visually-hidden"].includes(name))
        || /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;\s]|$))/i.test(attrs.get("style") ?? "");
      const collapsed = parent?.collapsed || (tag === "details" && !attrs.has("open"));
      let note = parent?.note;
      if (tag === "p" && classes.includes("download-note")) {
        note = [];
        notes.push(note);
      }
      if (!voidTags.has(tag)) stack.push({ tag, hidden, collapsed, note });
      continue;
    }
    const current = stack.at(-1);
    if (!current?.hidden) text.push(token);
    if (current?.note && !current.hidden && !current.collapsed) current.note.push(token);
  }
  const normalize = parts => parts.join("").replace(/\s+/g, " ").trim();
  return { text: normalize(text), notes: notes.map(normalize) };
}

const speechSubject = "(?:语音|腾讯云(?:联网)?发音|联网发音|云端发音)";
const unavailableSpeech = new RegExp(speechSubject + "(?:功能|服务)?\\s*(?:(?:暂未|尚未|未)(?:上线|开放|启用)|(?:暂不|尚不|不)可用)");
const availableSpeech = new RegExp(speechSubject + "(?:功能|服务)?\\s*(?:已经|现已|已|正式|全面)?(?:上线|开放|启用|可用|可正常使用)|(?:已经|现已|已)支持\\s*" + speechSubject);

export function assertReleasePolicy(release, html) {
  assert.ok(release && typeof release === "object" && !Array.isArray(release), "Release metadata must be an object");
  const distribution = release.distribution === undefined ? "public" : release.distribution;
  assert.ok(["public", "friends-cloud-preview"].includes(distribution), "Unknown release distribution");
  const copy = pageCopy(html);
  assert.doesNotMatch(copy.text, availableSpeech, "未开放的语音服务不得宣称已上线或可用");

  if (distribution === "public") {
    assert.equal(release.internalCloudEnabled, false, "普通公开包不得内置云翻译配置");
    assert.equal(release.speechCloudEnabled, false, "普通公开包不得内置语音云配置");
    if (release.speechAvailable !== undefined) assert.equal(release.speechAvailable, false, "语音服务尚未开放");
    return;
  }

  assert.equal(release.internalCloudEnabled, true, "云内测分发必须明确启用内测云配置");
  assert.equal(release.cloudPreviewExpiresOn, CLOUD_PREVIEW_EXPIRES_ON, "云内测到期日必须严格为 2026-09-30");
  assert.equal(release.publicDistributionRiskAccepted, true, "云内测公开分发必须明确确认风险");
  assert.equal(typeof release.speechCloudEnabled, "boolean", "语音配置状态必须是明确的布尔值");
  assert.equal(release.speechAvailable, false, "带语音配置不代表语音服务已经开放");
  assert.ok(copy.notes.some(note => /云(?:翻译)?内测/.test(note) && note.includes(CLOUD_PREVIEW_EXPIRES_ON) && /到期|截止/.test(note)),
    "常显 download-note 必须说明云内测及 2026-09-30 到期/截止");
  assert.match(copy.text, unavailableSpeech, "页面必须明确说明语音或腾讯云发音暂未开放");
}

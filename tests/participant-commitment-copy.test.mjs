import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const FOUR_DAY_CLAIM = /\bfour[- ]day(?:s)?\b|\b4[- ]day(?:s)?\b|四天|连续四天|共四天/iu;

const DISCLOSED_CONDITION_ORDERS = [
  /Fixed order:\s*dim red\s*(?:→|,|·)\s*dim blue\s*(?:→|,|·)\s*bright blue\s*(?:→|,|·)\s*bright red/i,
  /Assigned order:\s*dim red\s*(?:→|,|·)\s*dim blue\s*(?:→|,|·)\s*bright blue\s*(?:→|,|·)\s*bright red/i,
  /Fixed order:\s*dim red\s*(?:→|,|·)\s*dim blue\s*(?:→|,|·)\s*black(?:-screen)? control\s*(?:→|,|·)\s*bright blue\s*(?:→|,|·)\s*bright red/i,
  /Assigned order:\s*dim red\s*(?:→|,|·)\s*dim blue\s*(?:→|,|·)\s*black(?:-screen)? control\s*(?:→|,|·)\s*bright blue\s*(?:→|,|·)\s*bright red/i,
  /固定顺序(?:为|：)\s*暗红(?:色)?\s*(?:→|、|·)\s*暗蓝(?:色)?\s*(?:→|、|·)\s*亮蓝(?:色)?\s*(?:→|、|·)\s*亮红(?:色)?/u,
  /指定顺序(?:为|：)\s*暗红(?:色)?\s*(?:→|、|·)\s*暗蓝(?:色)?\s*(?:→|、|·)\s*亮蓝(?:色)?\s*(?:→|、|·)\s*亮红(?:色)?/u,
  /固定顺序(?:为|：)\s*暗红(?:色)?\s*(?:→|、|·)\s*暗蓝(?:色)?\s*(?:→|、|·)\s*(?:黑色|黑屏对照(?:条件)?)\s*(?:→|、|·)\s*亮蓝(?:色)?\s*(?:→|、|·)\s*亮红(?:色)?/u,
  /指定顺序(?:为|：)\s*暗红(?:色)?\s*(?:→|、|·)\s*暗蓝(?:色)?\s*(?:→|、|·)\s*(?:黑色|黑屏对照(?:条件)?)\s*(?:→|、|·)\s*亮蓝(?:色)?\s*(?:→|、|·)\s*亮红(?:色)?/u,
];

function extractSourceAside(source, className) {
  const classIndex = source.indexOf(`className="${className}"`);
  assert.ok(classIndex >= 0, `missing ${className} in participant-facing source`);

  const start = source.lastIndexOf("<aside", classIndex);
  const end = source.indexOf("</aside>", classIndex);
  assert.ok(start >= 0 && end > start, `${className} must be a semantic aside`);
  return source.slice(start, end + "</aside>".length);
}

function extractRenderedAside(html, className) {
  const classIndex = html.indexOf(`class="${className}"`);
  assert.ok(classIndex >= 0, `missing rendered ${className}`);

  const start = html.lastIndexOf("<aside", classIndex);
  const end = html.indexOf("</aside>", classIndex);
  assert.ok(start >= 0 && end > start, `${className} must render as an aside`);
  return html.slice(start, end + "</aside>".length);
}

function visibleText(markup) {
  return markup
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function renderSetupPage() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("commitment-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("the start page prominently states the complete bilingual study commitment", async () => {
  const [page, tutorial, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/study-tutorial.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  const notice = extractSourceAside(page, "study-commitment-notice");
  assert.match(notice, /role="(?:note|alert)"/);
  assert.match(notice, /five evening sessions/i);
  assert.match(notice, /五次(?:晚间|夜间)实验/u);
  assert.match(
    notice,
    /(?:each|a) (?:evening )?session[\s\S]{0,180}(?:after|then|following|its)[\s\S]{0,100}(?:next-morning|next morning)[\s\S]{0,40}questionnaire/i,
  );
  assert.match(notice, /每次(?:晚间|夜间)?实验[\s\S]{0,120}(?:第二天早上|次晨)[\s\S]{0,40}问卷/u);

  const strongBlocks = [...notice.matchAll(/<strong(?:\s[^>]*)?>([\s\S]*?)<\/strong>/g)]
    .map((match) => match[1]);
  assert.ok(
    strongBlocks.some((block) => /five evening sessions/i.test(block)),
    "the five-evening-session commitment must be bold in English",
  );
  assert.ok(
    strongBlocks.some((block) => /五次(?:晚间|夜间)实验/u.test(block)),
    "the five-evening-session commitment must be bold in Chinese",
  );
  assert.ok(
    strongBlocks.some((block) => /next-morning questionnaire/i.test(block)),
    "the after-each-session morning questionnaire must be bold in English",
  );
  assert.ok(
    strongBlocks.some((block) => /次晨问卷/u.test(block)),
    "the after-each-session morning questionnaire must be bold in Chinese",
  );

  assert.match(styles, /\.study-commitment-notice\s*\{/);
  assert.match(styles, /\.study-commitment-notice[\s\S]{0,900}border(?:-left)?:/);

  const participantFacingSource = `${page}\n${tutorial}`;
  assert.doesNotMatch(participantFacingSource, FOUR_DAY_CLAIM);
  for (const disclosedOrder of DISCLOSED_CONDITION_ORDERS) {
    assert.doesNotMatch(participantFacingSource, disclosedOrder);
  }
});

test("the rendered setup page shows the commitment without four-day or order claims", async () => {
  const response = await renderSetupPage();
  assert.equal(response.status, 200);
  const html = await response.text();
  const notice = extractRenderedAside(html, "study-commitment-notice");
  const noticeText = visibleText(notice);
  const pageText = visibleText(html);

  assert.match(notice, /role="(?:note|alert)"/);
  assert.match(notice, /<strong>/);
  assert.match(noticeText, /five evening sessions/i);
  assert.match(
    noticeText,
    /(?:each|a) (?:evening )?session.{0,180}(?:after|then|following|its).{0,100}(?:next-morning|next morning).{0,40}questionnaire/i,
  );
  assert.doesNotMatch(pageText, FOUR_DAY_CLAIM);
  for (const disclosedOrder of DISCLOSED_CONDITION_ORDERS) {
    assert.doesNotMatch(pageText, disclosedOrder);
  }
});

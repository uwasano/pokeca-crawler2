// メルカリ巡回(GitHub Actions用・軽量版)
// 本物のChromium(Playwright)で検索ページを開き、表示された商品をGASへ送る。
// 原則: robots.txt確認 / 検索間隔をあける / ブロック検知(0件・CAPTCHA)で即終了 / 回避行為はしない
import { chromium } from "playwright";

const GAS_URL = process.env.GAS_URL;
const GAS_TOKEN = process.env.GAS_TOKEN;
if (!GAS_URL || !GAS_TOKEN) { console.error("GAS_URL / GAS_TOKEN が未設定(リポジトリのSecretsに登録してください)"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- robots.txt: /search が禁止されていないか確認(禁止なら巡回しない) ----
async function robotsAllowed() {
  try {
    const res = await fetch("https://jp.mercari.com/robots.txt");
    if (!res.ok) return true;
    const txt = await res.text();
    let inStar = false;
    for (const line of txt.split(/\r?\n/)) {
      const l = line.trim().toLowerCase();
      if (l.startsWith("user-agent:")) inStar = l.includes("*");
      if (inStar && l.startsWith("disallow:")) {
        const p = l.slice(9).trim();
        if (p !== "" && "/search".startsWith(p)) return false;
      }
    }
    return true;
  } catch { return true; }
}

// ---- 検索語(サイトの⚙設定に連動) ----
const CAMERA_TERMS = ["RICOH GR", "SONY RX100", "PowerShot G", "LUMIX LX", "COOLPIX A", "OLYMPUS XZ", "IXY DIGITAL", "EXILIM"];
const LENS_TERMS = ["EF24-70mm F2.8L", "EF70-200mm F2.8L", "SIGMA Art", "TAMRON G2", "SONY GM レンズ", "NIKKOR Z レンズ", "NOKTON", "オールドレンズ"];
const BRAND_TERMS = ["ヴィトン バッグ", "ヴィトン 財布", "ルイヴィトン ショルダー"];

async function loadTerms() {
  let cfg = {};
  try { cfg = await (await fetch(`${GAS_URL}?type=config`)).json(); } catch {}
  const on = (k, def) => (typeof cfg[k] === "boolean" ? cfg[k] : def);
  const terms = [];
  if (on("camera", true)) for (const t of CAMERA_TERMS) terms.push({ t, cat: "camera" });
  if (on("lens", true)) for (const t of LENS_TERMS) terms.push({ t, cat: "lens" });
  if (on("brand", false)) for (const t of BRAND_TERMS) terms.push({ t, cat: "brand" });
  if (Array.isArray(cfg.extraTerms)) {
    for (const x of cfg.extraTerms) {
      if (x && x.t && ["camera", "lens", "brand"].includes(x.cat)) terms.push({ t: x.t, cat: x.cat });
    }
  }
  return terms.slice(0, 24); // 1回の上限(礼儀)
}

// ---- 1検索ぶんの取得 ----
async function crawlTerm(page, term) {
  const url = "https://jp.mercari.com/search?keyword=" + encodeURIComponent(term.t) +
    "&sort=created_time&order=desc&status=on_sale";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  try { await page.waitForSelector('a[href*="/item/m"]', { timeout: 20000 }); }
  catch { return []; } // 商品が描画されない = 0件かブロック
  await sleep(1500); // 価格の描画待ち
  return await page.evaluate(() => {
    const out = [], seen = new Set();
    for (const a of document.querySelectorAll('a[href*="/item/m"]')) {
      const m = /\/item\/(m\d{8,})/.exec(a.getAttribute("href") || "");
      if (!m || seen.has(m[1])) continue;
      const txt = (a.getAttribute("aria-label") || a.textContent || "").replace(/\s+/g, " ").trim();
      const img = a.querySelector("img");
      let title = (img && (img.getAttribute("alt") || "")) || "";
      title = title.replace(/のサムネイル.*$/, "").trim();
      if (!title) title = txt.replace(/[¥￥][\d,]+.*$/, "").trim();
      const pm = /[¥￥]\s*([\d,]{3,})/.exec(txt);
      if (!title || title.length < 4 || !pm) continue;
      const price = Number(pm[1].replace(/,/g, ""));
      if (!price || price < 300) continue;
      seen.add(m[1]);
      out.push({ itemId: m[1], title: title.slice(0, 120), price });
      if (out.length >= 40) break;
    }
    return out;
  });
}

// ---- メイン ----
const ok = await robotsAllowed();
if (!ok) { console.error("robots.txt が /search を許可していないため巡回しません"); process.exit(1); }

const terms = await loadTerms();
console.log(`検索語 ${terms.length}件(サイトの⚙設定に連動)`);
if (!terms.length) { console.log("検索対象カテゴリが全部OFFです。サイトの⚙設定を確認。"); process.exit(0); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "ja-JP", viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const all = [], seenIds = new Set();
let blockedStreak = 0;
for (const term of terms) {
  let items = [];
  try { items = await crawlTerm(page, term); } catch (e) { console.log(`  ${term.t}: エラー ${String(e).slice(0, 80)}`); }
  console.log(`  ${term.t} (${term.cat}): ${items.length}件`);
  if (items.length === 0) { blockedStreak++; if (blockedStreak >= 4) { console.log("4連続0件 → ブロックの可能性が高いので中断"); break; } }
  else blockedStreak = 0;
  for (const it of items) {
    if (seenIds.has(it.itemId)) continue;
    seenIds.add(it.itemId);
    all.push({ ...it, category: term.cat, soldOut: false });
  }
  await sleep(4000 + Math.floor(2000 * (all.length % 3)) / 3); // 4〜6秒あける
}
await browser.close();

console.log(`合計 ${all.length}商品`);
if (all.length === 0) {
  console.error("0商品 = GitHubのIPがメルカリに弾かれている可能性が高い(このIPからの取得は不可と判断してよい)");
  process.exit(1);
}

const res = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ token: GAS_TOKEN, listingsOnly: all }) });
const j = await res.json().catch(() => ({}));
console.log("GASへ送信:", JSON.stringify(j));
if (!j.ok) process.exit(1);
console.log("完了。S/Aランク検知があればメールが届き、サイトの監視候補に載ります。");

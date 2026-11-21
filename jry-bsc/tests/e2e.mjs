// Browser smoke test with a mocked BSC RPC and a mocked injected wallet.
// Run: node tests/e2e.mjs [outDir]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("public");
const out = process.argv[2] || ".";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;

const OWNER = "0x1111111111111111111111111111111111111111";
const word = (hex) => hex.padStart(64, "0");
const str = (s) => "0x" + word("20") + word(s.length.toString(16)) + Buffer.from(s).toString("hex").padEnd(64, "0");
const uint = (n) => "0x" + word(BigInt(n).toString(16));
const RESULTS = {
  "0x06fdde03": str("Jerry Token"), "0x95d89b41": str("JRY"), "0x313ce567": uint(18),
  "0x18160ddd": uint(10n ** 13n * 10n ** 18n), "0x8da5cb5b": "0x" + word(OWNER.slice(2)),
  "0x70a08231": uint(2500n * 10n ** 18n),
};

let failures = 0;
const check = (cond, msg) => { console.log((cond ? "ok   " : "FAIL ") + msg); if (!cond) failures++; };

const browser = await chromium.launch();
async function run(name, { wallet, viewport }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/bsc-dataseed|publicnode/, async (route) => {
    const { method, params } = route.request().postDataJSON();
    let result = null;
    if (method === "eth_call") result = RESULTS[params[0].data.slice(0, 10)];
    if (method === "eth_getTransactionReceipt") result = { status: "0x1" };
    await route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, result }) });
  });
  if (wallet) {
    await page.addInitScript((acct) => {
      window.__sent = [];
      let chain = "0x1"; // starts on Ethereum: the app must switch to BSC
      window.confirm = () => true;
      window.ethereum = {
        on() {},
        async request({ method, params }) {
          if (method === "eth_accounts") return [];
          if (method === "eth_requestAccounts") return [acct];
          if (method === "eth_chainId") return chain;
          if (method === "wallet_switchEthereumChain") { chain = params[0].chainId; return null; }
          if (method === "eth_sendTransaction") { window.__sent.push(params[0]); return "0x" + "ab".repeat(32); }
          if (method === "wallet_watchAsset") return true;
          throw new Error("unexpected " + method);
        },
      };
    }, wallet);
  }
  await page.goto(base);
  await page.waitForFunction(() => document.getElementById("t-supply").textContent.includes("JRY"));
  check((await page.textContent("#t-supply")).includes("10,000,000,000,000"), `${name}: total supply shown`);
  check(await page.isVisible("#mint-note"), `${name}: mint warning shown`);

  if (!wallet) {
    check(await page.isVisible("#no-wallet"), `${name}: no-wallet links shown`);
    check((await page.getAttribute("#open-mm", "href")).startsWith("https://metamask.app.link/dapp/"), `${name}: MetaMask deep link`);
  } else {
    await page.click("#connect");
    await page.waitForFunction(() => document.getElementById("bal").textContent !== "…");
    check((await page.textContent("#bal")) === "2,500", `${name}: balance shown`);
    check(await page.isHidden("#wrong-chain"), `${name}: switched to BSC`);
    const isOwner = wallet.toLowerCase() === OWNER;
    check((await page.isVisible("#owner-card")) === isOwner, `${name}: owner panel ${isOwner ? "visible" : "hidden"}`);

    await page.fill("#send-form input[name=to]", "0x2222222222222222222222222222222222222222");
    await page.fill("#send-form input[name=amount]", "1.5");
    await page.click("#send-form [type=submit]");
    await page.waitForFunction(() => window.__sent.length === 1);
    const tx = (await page.evaluate(() => window.__sent))[0];
    check(tx.to === "0x4b2118F94181f775F706eC580Bb96199A9Fae57b" && tx.data === "0xa9059cbb" + word("2222222222222222222222222222222222222222") + word((15n * 10n ** 17n).toString(16)), `${name}: transfer calldata`);
    await page.waitForSelector("#status.ok");

    await page.fill("#send-form input[name=to]", "0x1234");
    await page.fill("#send-form input[name=amount]", "1");
    await page.click("#send-form [type=submit]");
    await page.waitForSelector("#status.err");
    check((await page.evaluate(() => window.__sent.length)) === 1, `${name}: bad address rejected`);

    await page.fill("#send-form input[name=to]", "0x2222222222222222222222222222222222222222");
    await page.fill("#send-form input[name=amount]", "999999");
    await page.click("#send-form [type=submit]");
    check((await page.evaluate(() => window.__sent.length)) === 1, `${name}: over-balance rejected`);

    if (isOwner) {
      await page.fill("#mint-form input[name=to]", "0x3333333333333333333333333333333333333333");
      await page.fill("#mint-form input[name=amount]", "100");
      await page.click("#mint-form [type=submit]");
      await page.waitForFunction(() => window.__sent.length === 2);
      const m = (await page.evaluate(() => window.__sent))[1];
      check(m.data.startsWith("0x40c10f19" + word("3333333333333333333333333333333333333333")), `${name}: mint calldata`);
    }
    await page.evaluate(() => document.getElementById("status").hidden = true);
  }
  const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check(noScroll, `${name}: no horizontal scroll`);
  check(errors.length === 0, `${name}: no page errors ${errors.join(" | ")}`);
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  if (name === "owner-phone") {
    await page.click("#lang");
    check((await page.textContent("[data-i18n=send]")) === "Send JRY" && (await page.getAttribute("html", "dir")) === "ltr", `${name}: English switch`);
    await page.screenshot({ path: path.join(out, `${name}-en.png`), fullPage: true });
  }
  await ctx.close();
}

await run("no-wallet-phone", { viewport: { width: 390, height: 844 } });
await run("holder-phone", { wallet: "0x9999999999999999999999999999999999999999", viewport: { width: 390, height: 844 } });
await run("owner-phone", { wallet: OWNER, viewport: { width: 390, height: 844 } });
await run("owner-desktop", { wallet: OWNER, viewport: { width: 1280, height: 900 } });
await browser.close();
server.close();
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);

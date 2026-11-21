import {
  SEL, ZERO_ADDRESS, isAddress, sameAddress, encAddress, encUint, encodeCall,
  decUint, decAddress, decString, parseUnits, formatUnits, shortAddress,
} from "./abi.js";

// ---- Config -------------------------------------------------------------
const TOKEN = "0x4b2118F94181f775F706eC580Bb96199A9Fae57b";
const CHAIN_ID = "0x38"; // 56 = BNB Smart Chain mainnet
const EXPLORER = "https://bscscan.com";
// Public read-only endpoints, tried in order (the wallet is only used for signing).
const RPCS = [
  "https://bsc-dataseed.bnb.chain.org",
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-rpc.publicnode.com",
];
const BSC_PARAMS = {
  chainId: CHAIN_ID,
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.bnb.chain.org"],
  blockExplorerUrls: [EXPLORER],
};

// ---- i18n ---------------------------------------------------------------
const EN = {
  install: "Install app", info: "Token info", supply: "Total supply", decimals: "Decimals",
  contract: "Contract", owner: "Owner", copy: "Copy",
  mintNote: "This contract has a mint function: the owner can create new tokens.",
  renounced: "Ownership renounced: nobody can mint new tokens.",
  rpcError: "Could not read data from the network. Try again later.",
  addToWallet: "Add JRY to wallet", wallet: "Wallet",
  noWallet: "No wallet in this browser. Open the site inside your wallet app:",
  connect: "Connect wallet", wrongChain: "Your wallet is not on BNB Smart Chain.", switch: "Switch network",
  balance: "Balance", send: "Send JRY", to: "Recipient address", amount: "Amount", sendBtn: "Send",
  ownerPanel: "Owner panel",
  ownerHint: "Only visible to the owner. Every new token adds to the total supply and is public on BscScan.",
  mintBtn: "Mint",
  disclaimer: "JRY is a community token. This site promises no profit or price and is not investment advice. Always check the address before sending.",
  notPi: "JRY on BNB Smart Chain is a separate project with no link to the in-game JRY on Pi Network.",
  // runtime messages
  copied: "Address copied", badAddress: "Invalid address", badAmount: "Invalid amount",
  tooManyDecimals: "Too many decimals", noBalance: "Not enough JRY", confirmWallet: "Confirm in your wallet…",
  pending: "Transaction sent, waiting for confirmation…", done: "Confirmed ✅", failed: "Transaction failed on chain",
  rejected: "Cancelled in the wallet", needBnb: "You need a little BNB for the network fee",
  confirmMint: (a, to) => `Mint ${a} JRY to ${to}?\nThis increases the total supply permanently.`,
  confirmSend: (a, to) => `Send ${a} JRY to ${to}?`,
  watchOk: "JRY added to the wallet", view: "View on BscScan", noProvider: "Open this site inside a wallet app first",
};
const AR = {
  copied: "تنسخ العنوان", badAddress: "العنوان ماشي صحيح", badAmount: "الكمية ماشي صحيحة",
  tooManyDecimals: "بزاف ديال الأرقام من بعد الفاصلة", noBalance: "JRY ماكافياش", confirmWallet: "أكّد فالمحفظة…",
  pending: "تصيفطات المعاملة، كنتسناو التأكيد…", done: "تأكدات ✅", failed: "المعاملة فشلات فالبلوكشين",
  rejected: "تلغات فالمحفظة", needBnb: "خاصك شوية BNB باش تخلّص رسوم الشبكة",
  confirmMint: (a, to) => `تطبع ${a} JRY لـ ${to}؟\nهادشي غادي يزيد فالعرض الكلي بشكل نهائي.`,
  confirmSend: (a, to) => `تصيفط ${a} JRY لـ ${to}؟`,
  watchOk: "تزادت JRY للمحفظة", view: "شوف فـ BscScan", noProvider: "حل الموقع من داخل تطبيق المحفظة أولا",
};
let lang = "ar";
try { lang = localStorage.getItem("jry-lang") || "ar"; } catch {}
const arStatic = {};
const t = (k) => (lang === "en" ? EN[k] : AR[k] ?? arStatic[k]) ?? EN[k] ?? k;

function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const k = el.dataset.i18n;
    if (!(k in arStatic)) arStatic[k] = el.textContent;
    el.textContent = lang === "en" ? EN[k] : arStatic[k];
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => (el.title = t(el.dataset.i18nTitle)));
  $("lang").textContent = lang === "ar" ? "EN" : "عربي";
}

// ---- Helpers ------------------------------------------------------------
const $ = (id) => document.getElementById(id);
let statusTimer;
function status(msg, kind = "", link) {
  const el = $("status");
  el.className = kind;
  el.textContent = msg;
  if (link) {
    const a = document.createElement("a");
    a.href = link; a.target = "_blank"; a.rel = "noopener"; a.textContent = " " + t("view");
    el.append(a);
  }
  el.hidden = false;
  clearTimeout(statusTimer);
  if (kind) statusTimer = setTimeout(() => (el.hidden = true), kind === "err" ? 8000 : 6000);
}

let rpcIndex = 0;
async function rpc(method, params) {
  let lastErr;
  for (let i = 0; i < RPCS.length; i++) {
    const url = RPCS[(rpcIndex + i) % RPCS.length];
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || "rpc error");
      rpcIndex = (rpcIndex + i) % RPCS.length; // stick with the one that worked
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
const call = (data) => rpc("eth_call", [{ to: TOKEN, data }, "latest"]);

// ---- State --------------------------------------------------------------
const token = { name: "Jerry Token", symbol: "JRY", decimals: 18, supply: null, owner: null };
const provider = window.ethereum || null;
let account = null;
let chainOk = false;
let balance = null;

// ---- Token info ---------------------------------------------------------
async function loadToken() {
  try {
    const [name, symbol, decimals, supply, owner] = await Promise.all([
      call(SEL.name).then(decString),
      call(SEL.symbol).then(decString),
      call(SEL.decimals).then(decUint),
      call(SEL.totalSupply).then(decUint),
      call(SEL.owner).then(decAddress).catch(() => null),
    ]);
    Object.assign(token, { name, symbol, decimals: Number(decimals), supply, owner });
    $("info-error").hidden = true;
  } catch (e) {
    console.error(e);
    $("info-error").hidden = false;
  }
  renderToken();
  renderAccount();
}

function renderToken() {
  $("t-name").textContent = token.name;
  $("t-symbol").textContent = token.symbol;
  $("t-decimals").textContent = token.supply === null ? "…" : token.decimals;
  $("t-supply").textContent = token.supply === null ? "…" : `${formatUnits(token.supply, token.decimals, 2)} ${token.symbol}`;
  const c = $("t-contract");
  c.textContent = shortAddress(TOKEN);
  c.href = `${EXPLORER}/token/${TOKEN}`;
  const o = $("t-owner");
  o.replaceChildren();
  if (token.owner) {
    const a = document.createElement("a");
    a.href = `${EXPLORER}/address/${token.owner}`; a.target = "_blank"; a.rel = "noopener";
    a.textContent = sameAddress(token.owner, ZERO_ADDRESS) ? "0x0 (renounced)" : shortAddress(token.owner);
    o.append(a);
  } else o.textContent = "…";
  const renounced = token.owner && sameAddress(token.owner, ZERO_ADDRESS);
  $("renounced-note").hidden = !renounced;
  $("mint-note").hidden = !token.owner || renounced;
}

// ---- Wallet -------------------------------------------------------------
function setupNoWallet() {
  const here = location.href.replace(/^https?:\/\//, "");
  $("open-mm").href = `https://metamask.app.link/dapp/${here}`;
  $("open-tw").href = `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(location.href)}`;
  $("no-wallet").hidden = false;
  $("connect").hidden = true;
}

async function connect() {
  if (!provider) return status(t("noProvider"), "err");
  try {
    const accs = await provider.request({ method: "eth_requestAccounts" });
    await onAccounts(accs);
    if (!chainOk) await switchChain();
  } catch (e) { handleError(e); }
}

async function switchChain() {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID }] });
  } catch (e) {
    if (e?.code === 4902 || /unrecognized|not added/i.test(e?.message || "")) {
      await provider.request({ method: "wallet_addEthereumChain", params: [BSC_PARAMS] });
    } else throw e;
  }
  await checkChain();
}

async function checkChain() {
  if (!provider) return;
  const id = await provider.request({ method: "eth_chainId" });
  chainOk = String(id).toLowerCase() === CHAIN_ID;
  renderAccount();
}

async function onAccounts(accs) {
  account = accs && accs[0] ? accs[0] : null;
  balance = null;
  await checkChain();
  await loadBalance();
}

async function loadBalance() {
  if (!account) return renderAccount();
  try { balance = decUint(await call(encodeCall(SEL.balanceOf, encAddress(account)))); }
  catch (e) { console.error(e); }
  renderAccount();
}

function renderAccount() {
  const on = !!account;
  $("account").hidden = !on;
  if (provider) $("connect").hidden = on;
  $("send-card").hidden = !on;
  $("wrong-chain").hidden = !on || chainOk;
  if (on) {
    const a = $("acct-addr");
    a.textContent = shortAddress(account);
    a.href = `${EXPLORER}/token/${TOKEN}?a=${account}`;
    $("bal").textContent = balance === null ? "…" : formatUnits(balance, token.decimals);
  }
  $("owner-card").hidden = !(on && token.owner && sameAddress(account, token.owner));
}

// ---- Transactions -------------------------------------------------------
function readForm(form) {
  const to = form.to.value.trim();
  if (!isAddress(to)) throw new UserError("badAddress");
  let amount;
  try { amount = parseUnits(form.amount.value, token.decimals); }
  catch (e) { throw new UserError(/decimals/.test(e.message) ? "tooManyDecimals" : "badAmount"); }
  if (amount <= 0n) throw new UserError("badAmount");
  return { to, amount };
}

class UserError extends Error {}

function handleError(e) {
  console.error(e);
  if (e instanceof UserError) return status(t(e.message), "err");
  if (e?.code === 4001 || /reject|denied|cancel/i.test(e?.message || "")) return status(t("rejected"), "err");
  if (/insufficient funds|gas/i.test(e?.message || "")) return status(t("needBnb"), "err");
  status(e?.message || String(e), "err");
}

async function sendTx(data, button) {
  if (!chainOk) await switchChain();
  button.disabled = true;
  try {
    status(t("confirmWallet"));
    const hash = await provider.request({
      method: "eth_sendTransaction",
      params: [{ from: account, to: TOKEN, data }],
    });
    const link = `${EXPLORER}/tx/${hash}`;
    status(t("pending"), "", link);
    const receipt = await waitReceipt(hash);
    if (receipt && receipt.status === "0x1") status(t("done"), "ok", link);
    else if (receipt) status(t("failed"), "err", link);
    await Promise.all([loadBalance(), loadToken()]);
    return receipt?.status === "0x1";
  } finally {
    button.disabled = false;
  }
}

async function waitReceipt(hash) {
  for (let i = 0; i < 90; i++) { // BSC blocks are ~1-3 s; give up after ~3 min
    try {
      const r = await rpc("eth_getTransactionReceipt", [hash]);
      if (r) return r;
    } catch {}
    await new Promise((res) => setTimeout(res, 2000));
  }
  return null;
}

$("send-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  try {
    const { to, amount } = readForm(form);
    if (balance !== null && amount > balance) throw new UserError("noBalance");
    if (!confirm(t("confirmSend")(formatUnits(amount, token.decimals, token.decimals), to))) return;
    const ok = await sendTx(encodeCall(SEL.transfer, encAddress(to), encUint(amount)), form.querySelector("[type=submit]"));
    if (ok) form.reset();
  } catch (e) { handleError(e); }
});

$("mint-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  try {
    const { to, amount } = readForm(form);
    if (!confirm(t("confirmMint")(formatUnits(amount, token.decimals, token.decimals), to))) return;
    const ok = await sendTx(encodeCall(SEL.mint, encAddress(to), encUint(amount)), form.querySelector("[type=submit]"));
    if (ok) form.reset();
  } catch (e) { handleError(e); }
});

$("max").addEventListener("click", () => {
  if (balance === null) return;
  $("send-form").amount.value = formatUnits(balance, token.decimals, token.decimals).replace(/,/g, "");
});

// ---- Misc buttons -------------------------------------------------------
$("connect").addEventListener("click", connect);
$("switch").addEventListener("click", () => switchChain().catch(handleError));
$("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(TOKEN); status(t("copied"), "ok"); }
  catch { prompt("", TOKEN); }
});
$("watch").addEventListener("click", async () => {
  if (!provider) return status(t("noProvider"), "err");
  try {
    if (!account) await connect();
    if (!chainOk) await switchChain();
    const ok = await provider.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: TOKEN, symbol: token.symbol.slice(0, 11), decimals: token.decimals,
          image: new URL("icon-512.png", location.href).href,
        },
      },
    });
    if (ok) status(t("watchOk"), "ok");
  } catch (e) { handleError(e); }
});
$("lang").addEventListener("click", () => {
  lang = lang === "ar" ? "en" : "ar";
  try { localStorage.setItem("jry-lang", lang); } catch {}
  applyLang();
});

// PWA install prompt (Android/Chrome). iOS: Share → Add to Home Screen.
let installEvent = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  $("install").hidden = false;
});
$("install").addEventListener("click", async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  $("install").hidden = true;
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// ---- Start --------------------------------------------------------------
applyLang();
renderToken();
if (!provider) setupNoWallet();
else {
  provider.on?.("accountsChanged", (a) => onAccounts(a).catch(handleError));
  provider.on?.("chainChanged", () => checkChain().then(loadBalance).catch(handleError));
  provider.request({ method: "eth_accounts" }).then(onAccounts).catch(() => {});
}
loadToken();
setInterval(() => { if (!document.hidden) loadBalance(); }, 30000);

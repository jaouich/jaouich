// Minimal Stellar/Pi blockchain helpers for App-to-User payments, with no
// external packages: StrKey decoding, XDR encoding of one native payment,
// Ed25519 signing (WebCrypto) and Horizon submission.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const VERSION = { G: 6 << 3, S: 18 << 3 };

function crc16xmodem(bytes) {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function base32decode(s) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error("bad strkey");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

function base32encode(bytes) {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

// "G..." (public) or "S..." (secret seed) -> 32 raw bytes
export function decodeStrKey(key, kind) {
  const raw = base32decode(String(key).trim());
  if (raw.length !== 35 || raw[0] !== VERSION[kind]) throw new Error(`not a ${kind} key`);
  const body = raw.slice(0, 33);
  const crc = raw[33] | (raw[34] << 8);
  if (crc16xmodem(body) !== crc) throw new Error("strkey checksum mismatch");
  return raw.slice(1, 33);
}

export function encodeStrKey(bytes32, kind) {
  const body = new Uint8Array(33);
  body[0] = VERSION[kind];
  body.set(bytes32, 1);
  const crc = crc16xmodem(body);
  const all = new Uint8Array(35);
  all.set(body);
  all[33] = crc & 0xff;
  all[34] = crc >> 8;
  return base32encode(all);
}

// ---------- XDR writer ----------
class Xdr {
  constructor() { this.parts = []; }
  int32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, n); this.parts.push(b); return this; }
  uint32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); this.parts.push(b); return this; }
  int64(n) { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(n)); this.parts.push(b); return this; }
  uint64(n) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n)); this.parts.push(b); return this; }
  fixed(bytes) { this.parts.push(Uint8Array.from(bytes)); return this; }
  varOpaque(bytes) {
    this.uint32(bytes.length).fixed(bytes);
    const pad = (4 - (bytes.length % 4)) % 4;
    if (pad) this.parts.push(new Uint8Array(pad));
    return this;
  }
  bytes() {
    const len = this.parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

const ENVELOPE_TYPE_TX = 2;
const KEY_TYPE_ED25519 = 0;
const PRECOND_TIME = 1;
const MEMO_TEXT = 1;
const OP_PAYMENT = 1;
const ASSET_NATIVE = 0;

// Amount in Pi (string or number, up to 7 decimals) -> stroops (BigInt)
export function toStroops(amount) {
  const [i, f = ""] = String(amount).split(".");
  if (!/^\d+$/.test(i) || !/^\d*$/.test(f) || f.length > 7) throw new Error("bad amount");
  return BigInt(i) * 10000000n + BigInt((f + "0000000").slice(0, 7));
}

// Transaction XDR (protocol 19+ layout; identical bytes to older timeBounds layout)
export function buildPaymentTx({ source, destination, stroops, fee, sequence, memo, minTime = 0, maxTime }) {
  const memoBytes = new TextEncoder().encode(memo);
  if (memoBytes.length > 28) throw new Error("memo too long");
  return new Xdr()
    .int32(KEY_TYPE_ED25519).fixed(source) // sourceAccount (MuxedAccount)
    .uint32(fee) // fee
    .int64(sequence) // seqNum
    .int32(PRECOND_TIME).uint64(minTime).uint64(maxTime) // cond: time bounds
    .int32(MEMO_TEXT).varOpaque(memoBytes) // memo
    .uint32(1) // one operation
    .uint32(0) // operation sourceAccount: none
    .int32(OP_PAYMENT)
    .int32(KEY_TYPE_ED25519).fixed(destination) // destination
    .int32(ASSET_NATIVE) // asset: native Pi
    .int64(stroops) // amount
    .int32(0) // ext
    .bytes();
}

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
const concat = (...arrs) => { const x = new Xdr(); arrs.forEach((a) => x.fixed(a)); return x.bytes(); };

async function importSeed(seed32) {
  const pkcs8 = concat(Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]), seed32);
  return crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
}

// Public key ("G...") that belongs to a secret seed ("S...")
export async function publicKeyOf(seedStrKey) {
  const key = await importSeed(decodeStrKey(seedStrKey, "S"));
  const jwk = await crypto.subtle.exportKey("jwk", key);
  const x = Uint8Array.from(atob(jwk.x.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  return encodeStrKey(x, "G");
}

// Signs a transaction; returns { envelope (base64 XDR), hash (hex txid) }
export async function signTx(txBytes, seedStrKey, networkPassphrase) {
  const seed = decodeStrKey(seedStrKey, "S");
  const key = await importSeed(seed);
  const jwk = await crypto.subtle.exportKey("jwk", key);
  const pub = Uint8Array.from(atob(jwk.x.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const networkId = await sha256(new TextEncoder().encode(networkPassphrase));
  const payload = concat(networkId, new Xdr().int32(ENVELOPE_TYPE_TX).bytes(), txBytes);
  const hash = await sha256(payload);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, hash));
  const envelope = new Xdr()
    .int32(ENVELOPE_TYPE_TX)
    .fixed(txBytes)
    .uint32(1) // one signature
    .fixed(pub.slice(28, 32)) // hint: last 4 bytes of the public key
    .varOpaque(sig)
    .bytes();
  return { envelope: b64(envelope), hash: hex(hash) };
}

export const HORIZON = {
  "Pi Testnet": "https://api.testnet.minepi.com",
  "Pi Network": "https://api.mainnet.minepi.com",
};

// Builds, signs and submits a native Pi payment. Returns the txid.
export async function sendPi({ seed, from, to, amount, memo, network }) {
  const horizon = HORIZON[network];
  if (!horizon) throw new Error(`unknown network ${network}`);
  const source = decodeStrKey(from, "G");
  const acct = await (await fetch(`${horizon}/accounts/${from}`)).json();
  if (!acct.sequence) throw new Error("app wallet account not found");
  let fee = 100000; // 0.01 Pi
  try {
    const fs = await (await fetch(`${horizon}/fee_stats`)).json();
    if (Number(fs.last_ledger_base_fee) > 0) fee = Number(fs.last_ledger_base_fee);
  } catch {}
  const now = Math.floor(Date.now() / 1000);
  const tx = buildPaymentTx({
    source,
    destination: decodeStrKey(to, "G"),
    stroops: toStroops(amount),
    fee,
    sequence: BigInt(acct.sequence) + 1n,
    memo,
    minTime: 0,
    maxTime: now + 180,
  });
  const { envelope, hash } = await signTx(tx, seed, network);
  const r = await fetch(`${horizon}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "tx=" + encodeURIComponent(envelope),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) {
    const codes = res.extras?.result_codes ? JSON.stringify(res.extras.result_codes) : res.title || r.status;
    throw new Error(`submit failed: ${codes}`);
  }
  return res.hash || hash;
}

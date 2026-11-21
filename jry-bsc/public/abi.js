// Minimal ERC-20 ABI encoding/decoding, no dependencies.
// Only what this app needs: a few fixed selectors, address/uint256 args, and string/uint/address results.

export const SEL = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
  owner: "0x8da5cb5b",
  balanceOf: "0x70a08231", // balanceOf(address)
  transfer: "0xa9059cbb", // transfer(address,uint256)
  mint: "0x40c10f19", // mint(address,uint256)
};

const MAX_UINT = (1n << 256n) - 1n;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function isAddress(a) {
  return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
}

export function sameAddress(a, b) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function encAddress(a) {
  if (!isAddress(a)) throw new Error("bad address");
  return a.trim().slice(2).toLowerCase().padStart(64, "0");
}

export function encUint(n) {
  const v = BigInt(n);
  if (v < 0n || v > MAX_UINT) throw new Error("uint256 out of range");
  return v.toString(16).padStart(64, "0");
}

export function encodeCall(selector, ...words) {
  return selector + words.join("");
}

function strip(hex) {
  if (typeof hex !== "string" || !hex.startsWith("0x")) throw new Error("bad hex");
  return hex.slice(2);
}

export function decUint(hex) {
  const h = strip(hex);
  if (!h) throw new Error("empty result");
  return BigInt("0x" + h.slice(0, 64));
}

export function decAddress(hex) {
  const h = strip(hex);
  if (h.length < 64) throw new Error("empty result");
  return "0x" + h.slice(24, 64);
}

function utf8(hexBytes) {
  const bytes = new Uint8Array(hexBytes.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hexBytes.substr(i * 2, 2), 16);
  return new TextDecoder().decode(bytes);
}

// Handles the standard dynamic `string` and the old bytes32 form some tokens return.
export function decString(hex) {
  const h = strip(hex);
  if (!h) throw new Error("empty result");
  if (h.length === 64) return utf8(h.replace(/(00)+$/, ""));
  const off = Number(BigInt("0x" + h.slice(0, 64))) * 2;
  const len = Number(BigInt("0x" + h.slice(off, off + 64)));
  return utf8(h.slice(off + 64, off + 64 + len * 2));
}

// "1,234.5" / "1234,5" -> base units. Throws on bad input or too many decimals.
export function parseUnits(input, decimals) {
  let s = String(input).trim().replace(/[\s_]/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ""); // thousands separators
  else s = s.replace(",", "."); // decimal comma
  if (!/^\d+(\.\d+)?$/.test(s) && !/^\.\d+$/.test(s)) throw new Error("bad amount");
  const [int = "0", frac = ""] = s.split(".");
  if (frac.length > decimals) throw new Error("too many decimals");
  const v = BigInt((int || "0") + frac.padEnd(decimals, "0"));
  if (v > MAX_UINT) throw new Error("amount too large");
  return v;
}

export function formatUnits(value, decimals, maxFrac = 4) {
  const v = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const int = (v / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let frac = (v % base).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  if (!frac && v % base !== 0n && v < base) frac = null; // tiny non-zero amount
  if (frac === null) return "< 0." + "0".repeat(Math.max(0, maxFrac - 1)) + "1";
  return frac ? `${int}.${frac}` : int;
}

export function shortAddress(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

import assert from "node:assert/strict";
import { test } from "node:test";
import * as A from "../public/abi.js";

test("encode transfer", () => {
  const d = A.encodeCall(A.SEL.transfer, A.encAddress("0x4b2118F94181f775F706eC580Bb96199A9Fae57b"), A.encUint(10n ** 18n));
  assert.equal(d, "0xa9059cbb0000000000000000000000004b2118f94181f775f706ec580bb96199a9fae57b0000000000000000000000000000000000000000000000000de0b6b3a7640000");
});
test("bad address", () => { assert.throws(() => A.encAddress("0x123")); assert.equal(A.isAddress("0x4b2118F94181f775F706eC580Bb96199A9Fae57b"), true); });
test("decode string (dynamic)", () => {
  const hex = "0x" + "20".padStart(64, "0") + "3".padStart(64, "0") + "4a5259".padEnd(64, "0");
  assert.equal(A.decString(hex), "JRY");
});
test("decode string (bytes32)", () => { assert.equal(A.decString("0x" + "4a5259".padEnd(64, "0")), "JRY"); });
test("decode uint/address", () => {
  assert.equal(A.decUint("0x" + "12".padStart(64, "0")), 18n);
  assert.equal(A.decAddress("0x" + "ab".repeat(20).padStart(64, "0")), "0x" + "ab".repeat(20));
  assert.throws(() => A.decUint("0x"));
});
test("parseUnits", () => {
  assert.equal(A.parseUnits("1.5", 18), 15n * 10n ** 17n);
  assert.equal(A.parseUnits("1,5", 2), 150n);
  assert.equal(A.parseUnits("1,000,000", 0), 1000000n);
  assert.equal(A.parseUnits(".25", 2), 25n);
  assert.throws(() => A.parseUnits("1.234", 2));
  assert.throws(() => A.parseUnits("-1", 18));
  assert.throws(() => A.parseUnits("abc", 18));
  assert.throws(() => A.parseUnits("", 18));
});
test("formatUnits", () => {
  assert.equal(A.formatUnits(1234567n * 10n ** 18n, 18), "1,234,567");
  assert.equal(A.formatUnits(15n * 10n ** 17n, 18), "1.5");
  assert.equal(A.formatUnits(1n, 18), "< 0.0001");
  assert.equal(A.formatUnits(0n, 18), "0");
  assert.equal(A.formatUnits(5n, 0), "5");
});

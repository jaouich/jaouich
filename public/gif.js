/* Encodeur GIF animé : palette fixe 6x7x6 (252 couleurs) + tramage ordonné, compression LZW. */
(function () {
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function quantize(rgba, w, h) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, d = BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47;
        const r = Math.max(0, Math.min(5, Math.round(rgba[i] * 5 / 255 + d)));
        const g = Math.max(0, Math.min(6, Math.round(rgba[i + 1] * 6 / 255 + d)));
        const b = Math.max(0, Math.min(5, Math.round(rgba[i + 2] * 5 / 255 + d)));
        out[y * w + x] = r * 42 + g * 6 + b;
      }
    }
    return out;
  }

  class Bytes {
    constructor() { this.chunks = []; this.buf = new Uint8Array(1 << 16); this.n = 0; }
    byte(v) { if (this.n === this.buf.length) this.flush(); this.buf[this.n++] = v & 255; }
    le(v) { this.byte(v); this.byte(v >> 8); }
    str(s) { for (const c of s) this.byte(c.charCodeAt(0)); }
    flush() { if (this.n) { this.chunks.push(this.buf.slice(0, this.n)); this.n = 0; } }
    blob() { this.flush(); return new Blob(this.chunks, { type: 'image/gif' }); }
  }

  function lzw(pix, o) {
    const HSIZE = 5003, MAXBITS = 12, MAXMAX = 1 << MAXBITS;
    const htab = new Int32Array(HSIZE).fill(-1), codetab = new Int32Array(HSIZE);
    let nBits = 9, maxcode = (1 << nBits) - 1;
    const clearCode = 256, eofCode = 257;
    let freeEnt = 258, clearFlg = false, curAccum = 0, curBits = 0;
    const accum = new Uint8Array(256); let aCount = 0;
    const flushA = () => { if (aCount > 0) { o.byte(aCount); for (let i = 0; i < aCount; i++) o.byte(accum[i]); aCount = 0; } };
    const add = (b) => { accum[aCount++] = b; if (aCount >= 254) flushA(); };
    const output = (code) => {
      curAccum &= (1 << curBits) - 1;
      curAccum = curBits > 0 ? (curAccum | (code << curBits)) : code;
      curBits += nBits;
      while (curBits >= 8) { add(curAccum & 255); curAccum >>>= 8; curBits -= 8; }
      if (freeEnt > maxcode || clearFlg) {
        if (clearFlg) { nBits = 9; maxcode = (1 << nBits) - 1; clearFlg = false; }
        else { nBits++; maxcode = nBits === MAXBITS ? MAXMAX : (1 << nBits) - 1; }
      }
      if (code === eofCode) { while (curBits > 0) { add(curAccum & 255); curAccum >>>= 8; curBits -= 8; } flushA(); }
    };
    let i = 0, ent = pix[i++];
    output(clearCode);
    outer: while (i < pix.length) {
      const c = pix[i++], fcode = (c << MAXBITS) + ent;
      let h = (c << 4) ^ ent;
      if (htab[h] === fcode) { ent = codetab[h]; continue; }
      if (htab[h] >= 0) {
        const disp = h === 0 ? 1 : HSIZE - h;
        do { h -= disp; if (h < 0) h += HSIZE; if (htab[h] === fcode) { ent = codetab[h]; continue outer; } } while (htab[h] >= 0);
      }
      output(ent); ent = c;
      if (freeEnt < MAXMAX) { codetab[h] = freeEnt++; htab[h] = fcode; }
      else { htab.fill(-1); freeEnt = 258; clearFlg = true; output(clearCode); }
    }
    output(ent); output(eofCode);
  }

  class GifWriter {
    constructor(w, h) {
      this.w = w; this.h = h; const o = this.o = new Bytes();
      o.str('GIF89a'); o.le(w); o.le(h); o.byte(0xF7); o.byte(0); o.byte(0);
      for (let i = 0; i < 256; i++) {
        if (i < 252) { o.byte(Math.round(Math.floor(i / 42) * 255 / 5)); o.byte(Math.round((Math.floor(i / 6) % 7) * 255 / 6)); o.byte(Math.round((i % 6) * 255 / 5)); }
        else { o.byte(0); o.byte(0); o.byte(0); }
      }
      o.byte(0x21); o.byte(0xFF); o.byte(11); o.str('NETSCAPE2.0'); o.byte(3); o.byte(1); o.le(0); o.byte(0);
    }
    frame(rgba, delayCs) {
      const o = this.o;
      o.byte(0x21); o.byte(0xF9); o.byte(4); o.byte(4); o.le(delayCs); o.byte(0); o.byte(0);
      o.byte(0x2C); o.le(0); o.le(0); o.le(this.w); o.le(this.h); o.byte(0);
      o.byte(8);
      lzw(quantize(rgba, this.w, this.h), o);
      o.byte(0);
    }
    finish() { this.o.byte(0x3B); return this.o.blob(); }
  }

  window.GifWriter = GifWriter;
})();

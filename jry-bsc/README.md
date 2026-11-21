# JRY · BNB Smart Chain

موقع + تطبيق (PWA) للتوكن **JRY** على BNB Smart Chain.
عقد التوكن: [`0x4b2118F94181f775F706eC580Bb96199A9Fae57b`](https://bscscan.com/token/0x4b2118F94181f775F706eC580Bb96199A9Fae57b)

> مشروع منفصل على `pi-oasis`: هاد JRY ديال BSC ماعندها حتى علاقة بـ JRY ديال اللعبة على Pi.

## شنو كيدير
- كيقرا من البلوكشين: الإسم، الرمز، العرض الكلي، الكسور العشرية، والمالك. وإلا كان المالك ماشي `0x0` كيبان تنبيه بلي `mint` مفتوح.
- ربط المحفظة (MetaMask، Trust Wallet، أو أي محفظة كتحط `window.ethereum`)، وكيبدّل للشبكة BSC بوحدو.
- الرصيد، صيفط JRY، زر «زيد JRY للمحفظة».
- **لوحة المالك** (كتبان غير لعنوان `owner()`): `mint` مع تأكيد قبل الإرسال.
- إلا ماكانتش محفظة فالمتصفح: روابط كيحلّو الموقع داخل MetaMask أو Trust Wallet.
- PWA: كيتّنصب فالتيليفون بحال تطبيق، وكيتحل حتى بلا أنترنت (البيانات كتحتاج أنترنت).
- عربي (افتراضي) وإنجليزي.

بلا build وبلا مكتبات: HTML/CSS/JS عادي. التشفير ديال ABI فـ `public/abi.js`.

## الملفات
```
public/index.html   الصفحة
public/app.js       المنطق: RPC، المحفظة، المعاملات
public/abi.js       تشفير/فك ERC-20 (مختبر)
public/sw.js        service worker (offline)
public/_headers     رؤوس الأمان لـ Cloudflare Pages
tests/              اختبارات abi + اختبار المتصفح (Playwright، شبكة ومحفظة مزيفين)
```

## التشغيل
```bash
npm run dev     # http://localhost:8080
npm test        # اختبارات abi.js
node tests/e2e.mjs /tmp   # اختبار المتصفح (خاص Playwright)
```

## النشر على Cloudflare Pages
```bash
npm run deploy  # wrangler pages deploy public --project-name jry-bsc
```
أو من لوحة Cloudflare: Pages → Create → Upload، واختار الدوسي `public`.

## قبل الإطلاق (مهم)
1. **Verify** للكود ديال العقد على BscScan (Contract → Verify and Publish) باش الناس يشوفو الكود.
2. شوف `TeamToken.sol`: واش فيه رسوم على التحويل (`feeWallet`)؟ إلا كاين، كتبها بوضوح فالموقع.
3. `mint` بلا حد = خطر فعيون الناس. الحلول: تطبع العرض الكلي ومن بعد `renounceOwnership()` (نهائي، مايترجعش)، ولا تنقل الملكية لـ multisig. هاد الزر ماحطيتوش فالموقع عمدا.
4. فوّت معلومات التوكن واللوغو لـ BscScan (Update Token Info).
5. ماتوعد حتى واحد بربح ولا بثمن.

# Payment tests. Start the local Worker first: node --no-warnings tests/harness.mjs
# (fake Pi API + SQLite instead of D1; uses only fake test keys)
B=http://localhost:3457
P() { curl -s -X POST $B$1 -H "Content-Type: application/json" ${3:+-H "Authorization: Bearer $3"} -d "$2"; }
tok() { P /api/auth "{\"accessToken\":\"$1\"$2}" | python3 -c "import sys,json;print(json.load(sys.stdin)['session'])"; }
pay() { curl -s -X POST $B/__test/pay -d "$1" >/dev/null; }
SA=$(tok tokA); SB=$(tok tokB ',"ref":"alice"')
pass=0; fail=0
check() { if echo "$2" | grep -q "$3"; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1 -> $2"; fail=$((fail+1)); fi; }
pay '{"id":"p1","uid":"uB","amount":0.25}'
check "approve valid payment" "$(P /api/payments/approve '{"paymentId":"p1"}' $SB)" '"ok":true'
check "approve someone else's payment" "$(P /api/payments/approve '{"paymentId":"p1"}' $SA)" notYours
pay '{"id":"p2","uid":"uB","amount":0.01}'
check "wrong amount rejected" "$(P /api/payments/approve '{"paymentId":"p2"}' $SB)" badPayment
pay '{"id":"p3","uid":"uB","amount":0.25,"type":"gold"}'
check "wrong product rejected" "$(P /api/payments/approve '{"paymentId":"p3"}' $SB)" badPayment
pay '{"id":"p4","uid":"uB","amount":0.25,"direction":"app_to_user"}'
check "wrong direction rejected" "$(P /api/payments/approve '{"paymentId":"p4"}' $SB)" badPayment
pay '{"id":"p5","uid":"uB","amount":0.25,"cancelled":true}'
check "cancelled rejected" "$(P /api/payments/approve '{"paymentId":"p5"}' $SB)" badPayment
check "complete before tx sent rejected" "$(P /api/payments/complete '{"paymentId":"p1","txid":"tx1"}' $SB)" badPayment
pay '{"id":"p1","uid":"uB","amount":0.25,"txid":"tx1"}'
check "complete with wrong txid rejected" "$(P /api/payments/complete '{"paymentId":"p1","txid":"FAKE"}' $SB)" badPayment
check "complete valid" "$(P /api/payments/complete '{"paymentId":"p1","txid":"tx1"}' $SB)" '"vipUntil":[1-9]'
V1=$(P /api/payments/complete '{"paymentId":"p1","txid":"tx1"}' $SB | grep -o '"vipUntil":[0-9]*')
V2=$(P /api/payments/complete '{"paymentId":"p1","txid":"tx1"}' $SB | grep -o '"vipUntil":[0-9]*')
check "repeat complete grants once" "$([ "$V1" = "$V2" ] && echo same)" same
pay '{"id":"p9","uid":"uB","amount":0.25,"txid":"tx9"}'
check "complete never-approved payment rejected" "$(P /api/payments/complete '{"paymentId":"p9","txid":"tx9"}' $SB)" badPayment
pay '{"id":"p6","uid":"uA","amount":0.25}'
P /api/payments/approve '{"paymentId":"p6"}' $SA >/dev/null
pay '{"id":"p6","uid":"uA","amount":0.25,"txid":"tx6"}'
check "incomplete payment resumed" "$(P /api/payments/incomplete '{"payment":{"identifier":"p6","transaction":{"txid":"FAKE"}}}')" '"ok":true'
check "alice VIP after resume" "$(curl -s $B/api/me -H "Authorization: Bearer $SA")" '"vipUntil":[1-9]'
check "alice got 10% of bob's payment (10% of 0.175)" "$(curl -s $B/api/me -H "Authorization: Bearer $SA")" '"referralBalance":0.0175'
check "Pi /complete called exactly twice (p1, p6)" "$(curl -s $B/__test/completes)" '^2$'
check "prize pool = 15% of 0.175 x 2 payments" "$(curl -s $B/api/leaderboard)" '"prizePool":0.0525'
check "Developer Portal app sign-in (Pi /v2/me)" "$(P /api/auth '{"accessToken":"tokC"}')" '"username":"carol"'
check "unknown token refused" "$(P /api/auth '{"accessToken":"nope"}')" session
check "same user from 2nd app keeps account (VIP, referrals)" "$(P /api/auth '{"accessToken":"tokA2"}')" '"referralBalance":0.0175,"referralCount":1'
check "no session -> refused" "$(P /api/payments/approve '{"paymentId":"p1"}')" session
echo "== $pass passed, $fail failed"

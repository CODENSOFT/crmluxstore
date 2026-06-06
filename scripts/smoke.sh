#!/usr/bin/env bash
set -e
B=http://localhost:3010
J=/tmp/cj.txt
JM=/tmp/cjm.txt
rm -f $J $JM
pass(){ echo "✅ $1"; }
fail(){ echo "❌ $1"; echo "$2"; exit 1; }
# jq-free JSON field extractor (greps "field":"value" or "field":value)
field(){ node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(eval('j'+process.argv[1])??'')}catch(e){console.log('')}})" "$1"; }

echo "=== 1. Login admin ==="
R=$(curl -s -c $J -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@crm.local","password":"admin123"}')
echo "$R" | grep -q '"ok":true' && pass "login admin" || fail "login admin" "$R"

echo "=== 2. /api/auth/me ==="
R=$(curl -s -b $J $B/api/auth/me)
echo "$R" | grep -q '"role":"admin"' && pass "me=admin" || fail "me" "$R"

echo "=== 3. Create warehouses ==="
WA=$(curl -s -b $J -X POST $B/api/warehouses -H 'Content-Type: application/json' -d '{"name":"Depozit Central"}' | field '.data._id')
WB=$(curl -s -b $J -X POST $B/api/warehouses -H 'Content-Type: application/json' -d '{"name":"Depozit Spalatorie"}' | field '.data._id')
[ -n "$WA" ] && [ -n "$WB" ] && pass "warehouses A=$WA B=$WB" || fail "warehouses" "$WA $WB"

echo "=== 4. Create product with initial stock 100 in A ==="
P=$(curl -s -b $J -X POST $B/api/products -H 'Content-Type: application/json' -d "{\"name\":\"Sampon auto activ 5L\",\"unit\":\"litri\",\"price\":150,\"sku\":\"SH-5L\",\"warehouse\":\"$WA\",\"quantity\":100}" | field '.data._id')
[ -n "$P" ] && pass "product=$P" || fail "product" "$P"

echo "=== 5. Admin order: 10 litri from A (auto-approve, stock -10) ==="
R=$(curl -s -b $J -X POST $B/api/orders -H 'Content-Type: application/json' -d "{\"items\":[{\"product\":\"$P\",\"warehouse\":\"$WA\",\"quantity\":10}]}")
echo "$R" | grep -q '"status":"approved"' && pass "order approved" || fail "order" "$R"
TOT=$(echo "$R" | field '.data.total'); [ "$TOT" = "1500" ] && pass "total=1500" || fail "total" "$TOT"

echo "=== 6. Verify stock 100-10=90 in A ==="
ST=$(curl -s -b $J $B/api/products/$P | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const s=j.data.stock.find(x=>String(x.warehouse._id||x.warehouse)==='$WA');console.log(s.quantity)})")
[ "$ST" = "90" ] && pass "stock A=90" || fail "stock after order" "$ST"

echo "=== 7. Arrival +50 in A => 140 ==="
curl -s -b $J -X POST $B/api/arrivals -H 'Content-Type: application/json' -d "{\"product\":\"$P\",\"warehouse\":\"$WA\",\"quantity\":50,\"supplier\":\"ACME\"}" >/dev/null
ST=$(curl -s -b $J $B/api/products/$P | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const s=j.data.stock.find(x=>String(x.warehouse._id||x.warehouse)==='$WA');console.log(s.quantity)})")
[ "$ST" = "140" ] && pass "stock A=140 after arrival" || fail "arrival" "$ST"

echo "=== 8. Transfer 40 A->B ==="
curl -s -b $J -X POST $B/api/transfers -H 'Content-Type: application/json' -d "{\"product\":\"$P\",\"fromWarehouse\":\"$WA\",\"toWarehouse\":\"$WB\",\"quantity\":40}" >/dev/null
ST=$(curl -s -b $J $B/api/products/$P | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const a=j.data.stock.find(x=>String(x.warehouse._id||x.warehouse)==='$WA').quantity;const b=j.data.stock.find(x=>String(x.warehouse._id||x.warehouse)==='$WB').quantity;console.log(a+'/'+b)})")
[ "$ST" = "100/40" ] && pass "after transfer A=100 B=40" || fail "transfer" "$ST"

echo "=== 9. Write-off 10 from B => 30 ==="
curl -s -b $J -X POST $B/api/writeoffs -H 'Content-Type: application/json' -d "{\"product\":\"$P\",\"warehouse\":\"$WB\",\"quantity\":10,\"reason\":\"Expirat\"}" >/dev/null
ST=$(curl -s -b $J $B/api/products/$P | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const b=j.data.stock.find(x=>String(x.warehouse._id||x.warehouse)==='$WB').quantity;console.log(b)})")
[ "$ST" = "30" ] && pass "stock B=30 after writeoff" || fail "writeoff" "$ST"

echo "=== 10. Over-writeoff should FAIL ==="
R=$(curl -s -b $J -X POST $B/api/writeoffs -H 'Content-Type: application/json' -d "{\"product\":\"$P\",\"warehouse\":\"$WB\",\"quantity\":9999}")
echo "$R" | grep -q '"ok":false' && pass "insufficient stock rejected" || fail "should reject" "$R"

echo "=== 11. Create manager ==="
curl -s -b $J -X POST $B/api/users -H 'Content-Type: application/json' -d '{"name":"Ion Manager","email":"ion@crm.local","password":"ion12345","role":"manager"}' >/dev/null
pass "manager created"

echo "=== 12. Manager login + create order (pending) ==="
curl -s -c $JM -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"email":"ion@crm.local","password":"ion12345"}' >/dev/null
MO=$(curl -s -b $JM -X POST $B/api/orders -H 'Content-Type: application/json' -d "{\"items\":[{\"product\":\"$P\",\"warehouse\":\"$WA\",\"quantity\":5}]}")
echo "$MO" | grep -q '"status":"pending"' && pass "manager order pending" || fail "manager order" "$MO"
# responsible must be the manager himself
echo "$MO" | grep -q '"name":"Ion Manager"' && pass "responsible=manager(self)" || fail "responsible" "$MO"
MOID=$(echo "$MO" | field '.data._id')

echo "=== 13. Stock unchanged while pending (still 100 in A) ==="
ST=$(curl -s -b $J $B/api/products/$P | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const a=j.data.stock.find(x=>String(x.warehouse._id||x.warehouse)==='$WA').quantity;console.log(a)})")
[ "$ST" = "100" ] && pass "stock unchanged (pending)=100" || fail "pending stock" "$ST"

echo "=== 14. Admin approves manager order => stock 100-5=95 ==="
curl -s -b $J -X PATCH $B/api/orders/$MOID -H 'Content-Type: application/json' -d '{"action":"approve"}' >/dev/null
ST=$(curl -s -b $J $B/api/products/$P | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const a=j.data.stock.find(x=>String(x.warehouse._id||x.warehouse)==='$WA').quantity;console.log(a)})")
[ "$ST" = "95" ] && pass "stock=95 after approval" || fail "approval stock" "$ST"

echo "=== 15. Task with due date for manager ==="
R=$(curl -s -b $J -X POST $B/api/tasks -H 'Content-Type: application/json' -d '{"title":"Verifica stoc","dueDate":"2026-07-01","priority":"high"}')
echo "$R" | grep -q '"ok":true' && pass "task created" || fail "task" "$R"

echo "=== 16. Make API ping (x-api-key) ==="
KEY=596d0a2961cfe6dd04ffa5f7845d795a771920ce1cd991c2
R=$(curl -s $B/api/make/ping -H "x-api-key: $KEY")
echo "$R" | grep -q '"ok":true' && pass "make ping ok" || fail "make ping" "$R"
R=$(curl -s $B/api/make/ping -H "x-api-key: WRONG")
echo "$R" | grep -q '"ok":false' && pass "make ping rejects bad key" || fail "make auth" "$R"

echo "=== 17. Make creates order by SKU (pending) ==="
R=$(curl -s $B/api/make/orders -H "x-api-key: $KEY" -H 'Content-Type: application/json' -X POST -d "{\"items\":[{\"sku\":\"SH-5L\",\"warehouseId\":\"$WA\",\"quantity\":3}],\"customerName\":\"Web client\"}")
echo "$R" | grep -q '"number"' && pass "make order created" || fail "make order" "$R"

echo "=== 18. Make arrival via API +20 => 115 ==="
curl -s $B/api/make/arrivals -H "x-api-key: $KEY" -H 'Content-Type: application/json' -X POST -d "{\"sku\":\"SH-5L\",\"warehouseId\":\"$WA\",\"quantity\":20}" >/dev/null
ST=$(curl -s -b $J $B/api/products/$P | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const a=j.data.stock.find(x=>String(x.warehouse._id||x.warehouse)==='$WA').quantity;console.log(a)})")
[ "$ST" = "115" ] && pass "stock=115 after make arrival" || fail "make arrival" "$ST"

echo "=== 19. Manager cannot create user (403) ==="
R=$(curl -s -b $JM -X POST $B/api/users -H 'Content-Type: application/json' -d '{"name":"x","email":"x@x.com","password":"123"}')
echo "$R" | grep -q '"ok":false' && pass "manager blocked from creating users" || fail "rbac" "$R"

echo ""
echo "🎉 TOATE TESTELE AU TRECUT"

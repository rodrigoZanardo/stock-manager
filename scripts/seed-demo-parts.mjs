// Fills a Stock Manager with auto parts for the public demo: creates each SKU that is missing and books its starting stock.
// Usage: GATEWAY_URL=https://... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-demo-parts.mjs
const { GATEWAY_URL, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!GATEWAY_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set GATEWAY_URL, ADMIN_EMAIL and ADMIN_PASSWORD.');
  process.exit(1);
}

// [sku, name, starting stock, minimum, maximum]
const PARTS = [
  ['FO-1001', 'Filtro de óleo', 24, 6, 60],
  ['FA-1002', 'Filtro de ar do motor', 18, 5, 40],
  ['FC-1003', 'Filtro de cabine', 15, 4, 40],
  ['PF-2001', 'Pastilha de freio dianteira', 20, 6, 50],
  ['DF-2002', 'Disco de freio ventilado', 8, 2, 20],
  ['FL-2003', 'Fluido de freio DOT 4 500 ml', 30, 8, 60],
  ['VI-3001', 'Vela de ignição iridium', 40, 12, 100],
  ['CI-3002', 'Cabo de vela (jogo)', 6, 2, 15],
  ['BI-3003', 'Bobina de ignição', 5, 2, 12],
  ['CR-4001', 'Correia dentada', 7, 2, 20],
  ['TC-4002', 'Tensor da correia', 4, 2, 12],
  ['BA-4003', "Bomba d'água", 3, 2, 10],
  ['AM-5001', 'Amortecedor dianteiro', 6, 2, 16],
  ['BT-5002', 'Bieleta da barra estabilizadora', 10, 4, 30],
  ['OL-6001', 'Óleo de motor 5W-30 1 L', 48, 12, 120],
  ['AR-6002', 'Aditivo de radiador 1 L', 2, 4, 30],
  ['LP-7001', 'Lâmpada H4 12 V', 14, 4, 40],
  ['BT-7002', 'Bateria 60 Ah', 3, 2, 10],
];

const base = GATEWAY_URL.replace(/\/$/, '');
async function call(method, path, token, body) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90_000), // free hosting wakes slowly
  });
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const { accessToken } = await call('POST', '/auth/login', undefined, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
const existing = new Set((await call('GET', '/products', accessToken)).map((p) => p.sku));
for (const [sku, name, stock, minQuantity, maxQuantity] of PARTS) {
  if (existing.has(sku)) {
    console.log(`${sku} already there, skipped`);
    continue;
  }
  const product = await call('POST', '/products', accessToken, { sku, name, minQuantity, maxQuantity });
  await call('POST', `/products/${product.id}/movements`, accessToken, { type: 'IN', quantity: stock, note: 'Estoque inicial da demo' });
  console.log(`${sku} ${name}: ${stock}`);
}

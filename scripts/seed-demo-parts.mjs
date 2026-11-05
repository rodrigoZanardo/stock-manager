// Fills a Stock Manager with auto parts for the public demo: creates each SKU that is missing and books its starting stock;
// an existing SKU without a bin location or a price only gets those.
// Usage: GATEWAY_URL=https://... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-demo-parts.mjs
const { GATEWAY_URL, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!GATEWAY_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set GATEWAY_URL, ADMIN_EMAIL and ADMIN_PASSWORD.');
  process.exit(1);
}

// [sku, name, starting stock, minimum, maximum, bin location, price, cost] (money in cents, BRL) — one aisle (Rua) per family: filters R01, brakes R02, ignition R03...
const PARTS = [
  ['FO-1001', 'Filtro de óleo', 24, 6, 60, 'R01-B01-A01-P010-N1', 3990, 2150],
  ['FA-1002', 'Filtro de ar do motor', 18, 5, 40, 'R01-B01-A01-P020-N2', 5990, 3200],
  ['FC-1003', 'Filtro de cabine', 15, 4, 40, 'R01-B01-A02-P030-N1', 4590, 2400],
  ['PF-2001', 'Pastilha de freio dianteira', 20, 6, 50, 'R02-B01-A01-P010-N1', 18990, 10500],
  ['DF-2002', 'Disco de freio ventilado', 8, 2, 20, 'R02-B01-A01-P020-N1', 32990, 19800],
  ['FL-2003', 'Fluido de freio DOT 4 500 ml', 30, 8, 60, 'R02-B02-A01-P005-N2', 3490, 1890],
  ['VI-3001', 'Vela de ignição iridium', 40, 12, 100, 'R03-B01-A01-P010-N1', 6990, 3900],
  ['CI-3002', 'Cabo de vela (jogo)', 6, 2, 15, 'R03-B01-A01-P020-N2', 17990, 9800],
  ['BI-3003', 'Bobina de ignição', 5, 2, 12, 'R03-B01-A02-P030-N1', 28990, 16500],
  ['CR-4001', 'Correia dentada', 7, 2, 20, 'R04-B01-A01-P010-N1', 14990, 8200],
  ['TC-4002', 'Tensor da correia', 4, 2, 12, 'R04-B01-A01-P020-N1', 19990, 11200],
  ['BA-4003', "Bomba d'água", 3, 2, 10, 'R04-B02-A01-P040-N1', 24990, 14300],
  ['AM-5001', 'Amortecedor dianteiro', 6, 2, 16, 'R05-B01-A01-P060-N1', 42990, 25800],
  ['BT-5002', 'Bieleta da barra estabilizadora', 10, 4, 30, 'R05-B01-A02-P070-N2', 8990, 4700],
  ['OL-6001', 'Óleo de motor 5W-30 1 L', 48, 12, 120, 'R06-B01-A01-P010-N1', 4790, 2950],
  ['AR-6002', 'Aditivo de radiador 1 L', 2, 4, 30, 'R06-B01-A01-P030-N1', 2990, 1550],
  ['LP-7001', 'Lâmpada H4 12 V', 14, 4, 40, 'R07-B01-A02-P010-N3', 2490, 1190],
  ['BT-7002', 'Bateria 60 Ah', 3, 2, 10, 'R07-B02-A01-P050-N1', 54990, 38500],
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
const existing = new Map((await call('GET', '/products', accessToken)).map((p) => [p.sku, p]));
for (const [sku, name, stock, minQuantity, maxQuantity, location] of PARTS) {
  const found = existing.get(sku);
  if (found) {
    if (found.location && found.price != null) {
      console.log(`${sku} already there, skipped`);
      continue;
    }
    // PATCH needs the editable fields; send the stored ones so only what is missing changes
    const fill = { location: found.location ?? location, price: found.price ?? price, cost: found.cost ?? cost };
    await call('PATCH', `/products/${found.id}`, accessToken, { name: found.name, minQuantity: found.minQuantity, maxQuantity: found.maxQuantity, ...fill });
    console.log(`${sku} already there, set location ${fill.location}, price ${fill.price}, cost ${fill.cost}`);
    continue;
  }
  const product = await call('POST', '/products', accessToken, { sku, name, minQuantity, maxQuantity, location, price, cost });
  await call('POST', `/products/${product.id}/movements`, accessToken, { type: 'IN', quantity: stock, note: 'Estoque inicial da demo' });
  console.log(`${sku} ${name} at ${location}: ${stock}`);
}

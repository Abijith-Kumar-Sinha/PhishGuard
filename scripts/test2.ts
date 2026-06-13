import { analyze } from '../src/algorithms/scoring'
for (const d of ['xn--pypal-4ve.com', 'xn--80ak6aa92e.com', 'paypal.com', 'hdfcbank-kyc.xyz']) {
  const v = analyze(d)
  console.log(d.padEnd(24), v.level.toUpperCase().padEnd(11), 'host='+v.host.padEnd(16), 'brand:'+(v.brand?v.brand.name:'-'))
}

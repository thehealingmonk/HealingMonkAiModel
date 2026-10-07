// Server-side security helpers: payment signatures, patient-record linkage,
// rate limiting, and which URLs the app serves / lets search engines index.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = 'test_secret';

const { verifyPaymentSignature } = await import('@/lib/server/razorpay');
const { isLinkedPatient } = await import('@/lib/server/patientLink');
const { rateLimit } = await import('@/lib/server/rateLimit');
const { isAppPath, isIndexablePath, PUBLIC_ROUTES } = await import('@/lib/seo');
const { requireRole } = await import('@/middleware/auth');

const sign = (order, pay) => crypto.createHmac('sha256', 'test_secret').update(`${order}|${pay}`).digest('hex');

test('razorpay signature binds order and payment', () => {
  const sig = sign('order_A', 'pay_1');
  assert.equal(verifyPaymentSignature({ orderId: 'order_A', paymentId: 'pay_1', signature: sig }), true);
  // A valid signature for order A must not validate against a different order
  // (what the verify routes now enforce by using the STORED order id).
  assert.equal(verifyPaymentSignature({ orderId: 'order_B', paymentId: 'pay_1', signature: sig }), false);
  assert.equal(verifyPaymentSignature({ orderId: 'order_A', paymentId: 'pay_1', signature: '' }), false);
  assert.equal(verifyPaymentSignature({ orderId: 'order_A', paymentId: 'pay_1', signature: 'x'.repeat(64) }), false);
});

test('only staff-provisioned patient logins see clinic records', () => {
  assert.equal(isLinkedPatient({ role: 'patient', email: 'a@b.co', createdBy: null }), false, 'self-signup');
  assert.equal(isLinkedPatient({ role: 'patient', email: 'a@b.co', patientLinked: true }), true);
  assert.equal(isLinkedPatient({ role: 'patient', email: 'a@b.co', createdBy: 'adminId' }), true);
  assert.equal(isLinkedPatient({ role: 'doctor', email: 'a@b.co', patientLinked: true }), false);
  assert.equal(isLinkedPatient({ role: 'patient', email: '', patientLinked: true }), false);
  assert.equal(isLinkedPatient(null), false);
});

test('requireRole refuses other roles with 403', () => {
  assert.equal(requireRole({ role: 'admin' }, 'admin'), null);
  assert.equal(requireRole({ role: 'patient' }, 'admin', 'doctor')?.status, 403);
  assert.equal(requireRole({ role: 'reception' }, 'admin')?.status, 403);
});

test('rate limiter allows `limit` hits per window then returns 429', () => {
  const key = `t-${Math.random()}`;
  for (let i = 0; i < 3; i++) assert.equal(rateLimit(key, 3, 60_000), null);
  const res = rateLimit(key, 3, 60_000);
  assert.equal(res?.status, 429);
  assert.ok(Number(res.headers.get('Retry-After')) > 0);
  assert.equal(rateLimit(`${key}-other`, 3, 60_000), null, 'keys are independent');
});

test('every SPA route is served; unknown URLs 404', () => {
  for (const p of ['/', '/pricing', '/login', '/ergo', '/assessment', '/assessment/positions', '/assessment/capture',
    '/assessment/report/abc', '/r/jane-doe-x1y2', '/m/tok', '/admin', '/admin/patient/1', '/doctor/positions',
    '/reception/billing', '/patient']) assert.ok(isAppPath(p), p);
  for (const p of ['/nope', '/assessmentx', '/r', '/r/a/b', '/administrator', '/wp-login.php']) assert.ok(!isAppPath(p), p);
});

test('only public marketing pages are indexable, and all are in the sitemap', () => {
  for (const r of PUBLIC_ROUTES) assert.ok(isIndexablePath(r.path), r.path);
  for (const p of ['/admin', '/login', '/r/x', '/assessment', '/patient', '/m/t', '/ergo']) assert.ok(!isIndexablePath(p), p);
});

// Regression tests for the 2026-10 security audit (see HEALINGMONK_AI_SECURITY_REPORT.md).
// Every case here reproduces a confirmed defect; none needs a database — each
// request is rejected before any query runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-for-unit-tests-only';
process.env.APP_BASE_URL = 'https://ai.example.test';

const { NextRequest } = await import('next/server');
const mailer = await import('@/lib/server/mailer');
const auth = await import('@/middleware/auth');
const signal = await import('@/app/api/meetings/signal/route');
const publicReport = await import('@/app/api/public/reports/[id]/route');

// ---- SEC-01: HTML injection in transactional email ----

test('SEC-01 escapeHtml neutralises markup and attribute breakouts', () => {
  assert.equal(mailer.escapeHtml('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  assert.equal(mailer.escapeHtml(null), '');
});

test('SEC-01 safeUrl only allows http(s) links', () => {
  assert.equal(mailer.safeUrl('https://ai.example.test/r/abc'), 'https://ai.example.test/r/abc');
  assert.equal(mailer.safeUrl('javascript:alert(1)'), '');
  assert.equal(mailer.safeUrl('https://x.test/"><script>'), '');
  assert.equal(mailer.safeUrl(undefined), '');
});

test('SEC-01 public-booking email cannot carry attacker HTML', () => {
  const evil = '<a href="https://phish.test">Verify your account</a>';
  const { html } = mailer.appointmentBookedEmail({ patientName: evil, when: '1 Jan', reason: `<img src=x onerror=alert(1)>` });
  assert.ok(!html.includes('<a href="https://phish.test"'), 'link must be escaped');
  assert.ok(!html.includes('<img'), 'img must be escaped');
  assert.ok(html.includes('&lt;a href=&quot;https://phish.test&quot;&gt;'));
});

test('SEC-01 report email drops non-http report links', () => {
  const { html } = mailer.reportReadyEmail({ patientName: 'A', reportUrl: 'javascript:alert(1)' });
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('View your full report'));
});

test('BUG-RECEIPT card/UPI receipts are no longer labelled "Cash"', () => {
  assert.equal(mailer.methodLabel('card'), 'Card');
  assert.equal(mailer.methodLabel('upi'), 'UPI');
  assert.equal(mailer.methodLabel('online'), 'Online (Razorpay)');
  assert.equal(mailer.methodLabel('cash'), 'Cash');
  assert.ok(mailer.paymentReceiptEmail({ patientName: 'A', amount: 100, method: 'upi' }).html.includes('UPI'));
});

test('plain-text email part decodes the entities it was built from', () => {
  assert.equal(mailer.htmlToText('<p>Date &amp; time &lt;x&gt;</p>'), 'Date & time <x>');
});

// ---- SEC-03: sessions survive password reset / role change / deactivation ----

test('SEC-03 tokenIsCurrent compares the token generation with the account', () => {
  assert.equal(auth.tokenIsCurrent({ tv: 0 }, { tokenVersion: 0 }), true);
  assert.equal(auth.tokenIsCurrent({}, { tokenVersion: 0 }), true, 'legacy token (no tv) still valid at v0');
  assert.equal(auth.tokenIsCurrent({}, {}), true, 'legacy account (no field) still valid');
  assert.equal(auth.tokenIsCurrent({ tv: 0 }, { tokenVersion: 1 }), false, 'revoked');
  assert.equal(auth.tokenIsCurrent({}, { tokenVersion: 1 }), false, 'legacy token revoked after bump');
  assert.equal(auth.tokenIsCurrent({ tv: '1' }, { tokenVersion: 1 }), false, 'non-numeric tv is not trusted');
  assert.equal(auth.tokenIsCurrent({ tv: 0 }, null), false);
});

test('SEC-03 revokeSessions bumps the generation', () => {
  const u = {};
  auth.revokeSessions(u);
  assert.equal(u.tokenVersion, 1);
  auth.revokeSessions(u);
  assert.equal(u.tokenVersion, 2);
});

test('SEC-03 signToken embeds the generation', () => {
  const t = auth.signToken({ _id: { toString: () => 'a'.repeat(24) }, role: 'admin', tokenVersion: 3 });
  assert.equal(jwt.decode(t).tv, 3);
});

const reqWith = (token) => new NextRequest('http://localhost/api/auth/me', { headers: { authorization: `Bearer ${token}` } });

test('SEC-04 tokens signed with another algorithm are refused before any DB lookup', async () => {
  const hs512 = jwt.sign({ sub: 'a'.repeat(24) }, process.env.JWT_SECRET, { algorithm: 'HS512' });
  assert.equal(await auth.getUser(reqWith(hs512)), null);
  const unsigned = jwt.sign({ sub: 'a'.repeat(24) }, '', { algorithm: 'none' });
  assert.equal(await auth.getUser(reqWith(unsigned)), null);
});

test('SEC-04 tokens with a malformed subject are refused before any DB lookup', async () => {
  const bad = jwt.sign({ sub: { $ne: null } }, process.env.JWT_SECRET);
  assert.equal(await auth.getUser(reqWith(bad)), null);
});

// ---- SEC-05: signaling relay input validation ----

const post = (body) =>
  signal.POST(new NextRequest('http://localhost/api/meetings/signal', { method: 'POST', body: JSON.stringify(body) }));

test('SEC-05 signaling rejects operator objects in place of the room token', async () => {
  const res = await post({ token: { $ne: '' }, from: 'patient', kind: 'join' });
  assert.equal(res.status, 400);
});

test('SEC-05 signaling rejects unknown kinds and oversize payloads', async () => {
  assert.equal((await post({ token: 't', from: 'patient', kind: 'evil' })).status, 400);
  assert.equal((await post({ token: 't', from: 'patient', kind: 'chat', to: { $ne: 1 } })).status, 400);
  assert.equal((await post({ token: 't', from: 'patient', kind: 'chat', data: 'x'.repeat(70_000) })).status, 413);
});

// ---- SEC-08: public report responses must never be cached or indexed ----

test('SEC-08 public report lookups with an invalid id 404 with private headers', async () => {
  const res = await publicReport.GET(new NextRequest('http://localhost/api/public/reports/x'), { params: { id: '../$where' } });
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.match(res.headers.get('x-robots-tag'), /noindex/);
});

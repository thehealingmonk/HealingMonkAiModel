// Read-only: export every bill (hm_payments) recorded by reception staff to a
// CSV that opens in Excel. Pass --all to include bills from every role/online.
// Usage: node --env-file=.env scripts/export-bills.mjs [--all] [outfile.csv]
import fs from 'node:fs';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

const args = process.argv.slice(2);
const includeAll = args.includes('--all');
const outFile = args.find((a) => !a.startsWith('--')) || `reception-bills-${new Date().toISOString().slice(0, 10)}.csv`;

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '');

async function run() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;

  const users = await db.collection('hm_users').find({}).project({ name: 1, role: 1 }).toArray();
  const userById = new Map(users.map((u) => [u._id.toString(), u]));

  const filter = {};
  if (!includeAll) {
    const receptionIds = users.filter((u) => u.role === 'reception').map((u) => u._id);
    filter.collectedBy = { $in: receptionIds };
  }
  const payments = await db.collection('hm_payments').find(filter).sort({ createdAt: -1 }).toArray();

  const patientIds = [...new Set(payments.map((p) => p.patient?.toString()).filter(Boolean))]
    .map((id) => new mongoose.Types.ObjectId(id));
  const patients = await db.collection('hm_patients').find({ _id: { $in: patientIds } })
    .project({ name: 1, patientId: 1, mobile: 1, assignedDoctor: 1 }).toArray();
  const patientById = new Map(patients.map((p) => [p._id.toString(), p]));

  const header = ['Date', 'Patient', 'Patient ID', 'Mobile', 'Assigned doctor', 'Service', 'Amount (INR)',
    'Method', 'Status', 'Notes', 'Collected by', 'Collected by role', 'Bill ID'];
  const lines = [header.join(',')];
  let totalPaid = 0;
  for (const p of payments) {
    const pt = patientById.get(p.patient?.toString()) || {};
    const doc = userById.get(pt.assignedDoctor?.toString());
    const by = userById.get(p.collectedBy?.toString());
    if (p.status === 'paid') totalPaid += p.amount;
    lines.push([
      fmtDate(p.createdAt), pt.name, pt.patientId, pt.mobile, doc?.name, p.plan, (p.amount / 100).toFixed(2),
      p.method, p.status, p.notes, by?.name, by?.role, p._id.toString(),
    ].map(csvCell).join(','));
  }
  lines.push('', ['', '', '', '', '', 'Total paid', (totalPaid / 100).toFixed(2)].map(csvCell).join(','));

  // BOM so Excel reads ₹/Hindi text as UTF-8.
  fs.writeFileSync(outFile, '﻿' + lines.join('\r\n'), 'utf8');
  console.log(`✓ ${payments.length} bills → ${outFile} (total paid ₹${(totalPaid / 100).toFixed(2)})`);
  await mongoose.disconnect();
  process.exit(0);
}
run().catch((e) => { console.error('Failed:', e.message); process.exit(1); });

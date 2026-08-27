import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { PatientDocument } from '@/lib/server/models/PatientDocument';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Fetch a single document WITH its base64 payload — used to preview or download
// a file on demand (the list endpoint omits the heavy data).
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  await connectDB();
  const doc = await PatientDocument.findOne({ _id: params.docId, patient: params.id });
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  return NextResponse.json({ document: doc.toJSONSafe(true) });
}

// Remove a document. Reception / doctor / admin.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  await connectDB();
  const doc = await PatientDocument.findOneAndDelete({ _id: params.docId, patient: params.id });
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  return NextResponse.json({ ok: true, id: params.docId });
}

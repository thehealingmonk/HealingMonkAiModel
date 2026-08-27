import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Patient } from '@/lib/server/models/Patient';
import { PatientDocument } from '@/lib/server/models/PatientDocument';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Max characters for one file's data URL (~5 MB after base64 overhead ≈ 3.7 MB file).
const MAX_FILE_CHARS = 5_000_000;
// Files accepted in a single upload request.
const MAX_FILES_PER_REQUEST = 10;
const ALLOWED_CATEGORIES = ['report', 'xray', 'prescription', 'scan', 'other'];

// List a patient's documents (metadata only — no base64 payloads, so the list
// stays light). The client fetches an individual file's data when previewing.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  await connectDB();
  const docs = await PatientDocument.find({ patient: params.id }).sort({ createdAt: -1 });
  return NextResponse.json({ documents: docs.map((d: any) => d.toJSONSafe(false)) });
}

// Upload one or more documents for a patient. Reception / doctor / admin only.
// Body: { documents: [{ name, data, mime?, size?, category? }, ...] }.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const patient = await Patient.findById(params.id);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) || {};
    // Accept either a single document or an array under `documents`.
    const incoming = Array.isArray(body.documents)
      ? body.documents
      : body.data
        ? [body]
        : [];

    if (incoming.length === 0) {
      return NextResponse.json({ error: 'No documents provided' }, { status: 400 });
    }
    if (incoming.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { error: `At most ${MAX_FILES_PER_REQUEST} files per upload` },
        { status: 400 }
      );
    }

    const toCreate: Record<string, unknown>[] = [];
    for (const doc of incoming) {
      const data = doc?.data;
      if (typeof data !== 'string' || !/^data:(image\/|application\/pdf)/.test(data)) {
        return NextResponse.json(
          { error: 'Each file must be an image or PDF data URL' },
          { status: 400 }
        );
      }
      if (data.length > MAX_FILE_CHARS) {
        return NextResponse.json({ error: 'One file is too large (max ~3.7 MB)' }, { status: 400 });
      }
      const category =
        typeof doc.category === 'string' && ALLOWED_CATEGORIES.includes(doc.category)
          ? doc.category
          : 'other';
      toCreate.push({
        patient: patient._id,
        name: (typeof doc.name === 'string' ? doc.name : 'Document').slice(0, 200),
        mime: typeof doc.mime === 'string' ? doc.mime.slice(0, 100) : '',
        size: Number.isFinite(doc.size) ? Number(doc.size) : 0,
        category,
        data,
        uploadedBy: user._id,
        uploadedByName: user.name || '',
      });
    }

    const created = await PatientDocument.insertMany(toCreate);
    return NextResponse.json({
      documents: created.map((d: any) => d.toJSONSafe(false)),
    });
  } catch (err) {
    console.error('upload patient document error', err);
    return NextResponse.json({ error: 'Could not upload documents' }, { status: 500 });
  }
}

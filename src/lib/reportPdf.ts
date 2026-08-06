import { jsPDF } from 'jspdf';
import {
  PatientInfo,
  AssessmentCapture,
  ExtraShot,
  getAssessment,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  Severity,
} from '@/lib/clinicalKnowledge';

/**
 * Build and download the clinical report as a real PDF file, composed directly
 * from the patient data and the captured (AI-annotated) snapshots. This is
 * deliberately programmatic (not an HTML screenshot) so the output is crisp,
 * consistent across browsers, and never drops styling — important for a medical
 * document. Callers should fall back to window.print() if this throws.
 */

const SEVERITY_SCORE: Record<Severity, number> = { normal: 0, mild: 1, moderate: 2, severe: 3 };

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function bmi(height: string, weight: string): string {
  const h = parseFloat(height) / 100;
  const w = parseFloat(weight);
  if (!h || !w) return '—';
  return (w / (h * h)).toFixed(1);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function downloadReportPdf(
  patient: PatientInfo,
  captures: AssessmentCapture[],
  extraShots: ExtraShot[] = []
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = 16;

  const findings = captures
    .map((c) => ({ capture: c, assessment: getAssessment(c.assessmentId)! }))
    .filter((f) => f.assessment);

  const flagged = findings.filter((f) => f.capture.severity && f.capture.severity !== 'normal');
  const totalPenalty = findings.reduce((s, f) => s + (f.capture.severity ? SEVERITY_SCORE[f.capture.severity] : 0), 0);
  const overallScore = Math.max(0, Math.round(100 - (totalPenalty / (findings.length * 3 || 1)) * 100));

  // Ensure there is room for `need` mm; add a page otherwise.
  const ensure = (need: number) => {
    if (y + need > pageH - margin) {
      doc.addPage();
      y = 16;
    }
  };

  // ---- Header ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(16, 185, 129);
  doc.text('HealingMonk', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('Clinical Posture & Movement Report', margin, y + 5.5);
  doc.setTextColor(120);
  doc.text(new Date().toLocaleDateString(), pageW - margin, y, { align: 'right' });
  y += 12;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // ---- Patient ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('Patient', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const info: [string, string][] = [
    ['Name', patient.name || '—'],
    ['Age / Gender', [patient.age, patient.gender].filter(Boolean).join(' / ') || '—'],
    ['Phone', patient.phone || '—'],
    ['Email', patient.email || '—'],
    ['Height', patient.height ? `${patient.height} cm` : '—'],
    ['Weight', patient.weight ? `${patient.weight} kg` : '—'],
    ['BMI', bmi(patient.height, patient.weight)],
    ['Pain Areas', patient.painAreas.join(', ') || '—'],
  ];
  const colW = contentW / 2;
  info.forEach(([label, value], i) => {
    const col = i % 2;
    const x = margin + col * colW;
    if (col === 0 && i > 0) y += 6;
    doc.setTextColor(148, 163, 184);
    doc.text(`${label}:`, x, y);
    doc.setTextColor(51, 65, 85);
    doc.text(doc.splitTextToSize(value, colW - 24), x + 24, y);
  });
  y += 8;
  if (patient.complaint) {
    doc.setTextColor(148, 163, 184);
    doc.text('Complaint:', margin, y);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(patient.complaint, contentW - 24);
    doc.text(lines, margin + 24, y);
    y += lines.length * 4.5 + 2;
  }

  // ---- Summary tiles ----
  y += 2;
  ensure(20);
  const tiles: [string, string, [number, number, number]][] = [
    [`${overallScore}/100`, 'Posture Health Score', [16, 185, 129]],
    [`${findings.length}`, 'Assessments', [30, 41, 59]],
    [`${flagged.length}`, 'Need Attention', [239, 68, 68]],
  ];
  const tileW = (contentW - 8) / 3;
  tiles.forEach(([big, small, rgb], i) => {
    const x = margin + i * (tileW + 4);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, tileW, 16, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.text(big, x + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(small, x + 4, y + 12.5);
  });
  y += 22;

  // ---- Disclaimer ----
  ensure(16);
  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(252, 211, 77);
  doc.roundedRect(margin, y, contentW, 14, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(146, 64, 14);
  doc.text('Automated report — not a medical diagnosis', margin + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 83, 9);
  doc.text(
    doc.splitTextToSize(
      'All values are approximate camera-based estimates and are not medically verified. Final judgement rests with the treating clinician.',
      contentW - 6
    ),
    margin + 3,
    y + 9
  );
  y += 20;

  // ---- Findings ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  ensure(8);
  doc.text('Findings', margin, y);
  y += 6;

  for (const { capture, assessment } of findings) {
    const imgW = 46;
    const blockH = 42;
    ensure(blockH + 4);

    // Snapshot (AI-annotated). Fall back to the raw frame; skip if neither loads.
    const src = capture.imageData || capture.rawImageData;
    let imgH = 34;
    if (src) {
      try {
        const img = await loadImage(src);
        // Fit inside imgW × maxH preserving aspect ratio so a portrait full-body
        // photo is never squished — a distorted pose would misrepresent the
        // alignment the report is measuring. Centered within the image column.
        const maxH = 40;
        const ratio = img.width / img.height || 1;
        let w = imgW;
        let h = imgW / ratio;
        if (h > maxH) {
          h = maxH;
          w = maxH * ratio;
        }
        imgH = h;
        doc.addImage(src, 'JPEG', margin + (imgW - w) / 2, y, w, h);
      } catch {
        /* ignore a broken image, keep the text */
      }
    }

    const tx = margin + imgW + 5;
    const tw = contentW - imgW - 5;
    let ty = y + 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(assessment.name, tw), tx, ty);
    ty += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${assessment.bodyRegion} · ${assessment.category} · ${assessment.patientPosition}`, tx, ty);
    ty += 5.5;

    // Value + severity chip
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const valStr = capture.value !== null ? `${capture.value}${assessment.unit}` : 'N/A';
    doc.setTextColor(15, 23, 42);
    doc.text(`${assessment.measurementName}: ${valStr}`, tx, ty);
    if (capture.severity) {
      const [r, g, b] = hexToRgb(SEVERITY_COLOR[capture.severity]);
      const label = SEVERITY_LABEL[capture.severity];
      doc.setFontSize(8);
      const cw = doc.getTextWidth(label) + 6;
      doc.setFillColor(r, g, b);
      doc.roundedRect(tx, ty + 1.5, cw, 5, 1, 1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(label, tx + 3, ty + 5);
    }
    ty += 9;

    // Ideal + plumb verdict
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Ideal: ${assessment.ranges.normal}`, tx, ty);
    if (capture.plumbLine) {
      const ok = capture.plumbLine.aligned;
      doc.setTextColor(ok ? 22 : 239, ok ? 163 : 68, ok ? 74 : 68);
      doc.text(
        ok ? 'Plumb: position correct' : `Plumb: adjust · ${capture.plumbLine.score.toFixed(0)}% off`,
        tx + 40,
        ty
      );
    }
    ty += 5;

    // Exercises
    doc.setTextColor(120, 113, 108);
    doc.setFontSize(8);
    const ex = assessment.exercises.map((e) => e.name).join(', ');
    doc.text(doc.splitTextToSize(`Exercises: ${ex}`, tw), tx, ty);

    y += blockH;
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y - 2, pageW - margin, y - 2);
  }

  // ---- Additional angle photos ----
  if (extraShots.length) {
    ensure(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(`Additional Views (${extraShots.length})`, margin, y);
    y += 6;

    const cols = 3;
    const gap = 4;
    const cellW = (contentW - gap * (cols - 1)) / cols;
    let col = 0;
    let rowH = 0;
    for (const shot of extraShots) {
      const src = shot.imageData || shot.rawImageData;
      if (!src) continue;
      let h = 30;
      try {
        const img = await loadImage(src);
        h = (cellW * img.height) / img.width;
      } catch {
        continue;
      }
      if (col === 0) ensure(h + 8);
      const x = margin + col * (cellW + gap);
      try {
        doc.addImage(src, 'JPEG', x, y, cellW, h);
      } catch {
        /* skip a broken image */
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(doc.splitTextToSize(shot.label, cellW), x, y + h + 3);
      rowH = Math.max(rowH, h + 7);
      col += 1;
      if (col === cols) {
        y += rowH;
        col = 0;
        rowH = 0;
      }
    }
    if (col > 0) y += rowH;
  }

  // ---- Footer disclaimer on every page ----
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `HealingMonk · estimate, not medically verified · Page ${p} of ${pages}`,
      pageW / 2,
      pageH - 6,
      { align: 'center' }
    );
  }

  const safeName = (patient.name || 'patient').replace(/[^\w\-]+/g, '_');
  doc.save(`HealingMonk-Report-${safeName}.pdf`);
}

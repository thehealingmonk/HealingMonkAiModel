import { CheckCircle2, XCircle, User, Users, Ruler, Box } from 'lucide-react';
import { BodyFitResult, FitCheck, FitReport, MeasurementMode } from '@/lib/ergo/ergoTypes';
import { RISK_COLOR, RISK_LABEL, MEASUREMENT_MODE_LABEL } from '@/lib/ergo/ergoKnowledge';

const VERDICT_TEXT: Record<FitCheck['verdict'], string> = {
  fits: 'Fits',
  'too-low': 'Too low',
  'too-high': 'Too high',
  'too-shallow': 'Too shallow',
  'too-deep': 'Too deep',
  'too-narrow': 'Too narrow',
  'too-close': 'Too close',
  'too-far': 'Too far',
  'no-legroom': 'No leg room',
};

const MODE_SHORT: Record<MeasurementMode, string> = {
  'user-measured': 'tape / typed',
  calibrated: 'photo-measured',
  estimated: 'population average',
  unknown: 'unknown',
};

function CheckLine({ who, c }: { who: string; c: FitCheck | undefined }) {
  if (!c) return null;
  const ok = c.verdict === 'fits' || c.band === 'negligible' || c.band === 'low';
  return (
    <div className="flex items-start gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: RISK_COLOR[c.band] }} />
      ) : (
        <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: RISK_COLOR[c.band] }} />
      )}
      <div className="min-w-0">
        <span className="text-slate-400">{who}: </span>
        <span className="text-slate-200">
          ideal {Math.round(c.minCm)}–{Math.round(c.maxCm)} cm →{' '}
          <b style={{ color: RISK_COLOR[c.band] }}>
            {VERDICT_TEXT[c.verdict]}
            {c.deltaCm !== 0 ? ` by ${Math.abs(Math.round(c.deltaCm))} cm` : ''}
          </b>
        </span>
      </div>
    </div>
  );
}

function ScoreBox({ fit }: { fit: BodyFitResult }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {fit.who === 'person' ? <User className="w-4 h-4 text-emerald-400" /> : <Users className="w-4 h-4 text-sky-400" />}
        <span className="truncate">{fit.label}</span>
      </div>
      <p className="text-xs text-slate-400 mt-0.5">
        {fit.statureCm} cm · {MODE_SHORT[fit.statureMode]}
      </p>
      <p className={`text-xs mt-2 font-medium ${fit.suitable === false ? 'text-orange-300' : fit.suitable ? 'text-emerald-300' : 'text-slate-400'}`}>
        {fit.suitable === true ? '✔ ' : fit.suitable === false ? '✖ ' : ''}
        {fit.summary}
      </p>
      {fit.predicted && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-black/20 p-2">
            <p className="text-[10px] text-slate-500">Predicted RULA</p>
            <p className="text-lg font-bold" style={{ color: RISK_COLOR[fit.predicted.rula.band] }}>
              {fit.predicted.rula.grandScore}
              <span className="text-xs text-slate-500">/7</span>
            </p>
            <p className="text-[10px]" style={{ color: RISK_COLOR[fit.predicted.rula.band] }}>{RISK_LABEL[fit.predicted.rula.band]}</p>
          </div>
          <div className="rounded-lg bg-black/20 p-2">
            <p className="text-[10px] text-slate-500">Predicted REBA</p>
            <p className="text-lg font-bold" style={{ color: RISK_COLOR[fit.predicted.reba.band] }}>
              {fit.predicted.reba.grandScore}
              <span className="text-xs text-slate-500">/15</span>
            </p>
            <p className="text-[10px]" style={{ color: RISK_COLOR[fit.predicted.reba.band] }}>{RISK_LABEL[fit.predicted.reba.band]}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Side-by-side fit of the measured workstation for (a) this person and (b) the
 * average human, with the RULA/REBA score each would end up with.
 */
export default function ErgoFitCompare({ report }: { report: FitReport }) {
  const { person, average } = report;
  const keys: FitCheck['key'][] = [];
  for (const c of [...(person?.checks ?? []), ...average.checks]) if (!keys.includes(c.key)) keys.push(c.key);
  const bodies = [person, average].filter(Boolean) as BodyFitResult[];

  return (
    <div className="space-y-3">
      {/* Body sizes */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300 space-y-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
          <Ruler className="w-4 h-4 text-emerald-400" /> Body size
        </p>
        {person ? (
          <p>
            This person: <b>{person.statureCm} cm</b> tall ({MODE_SHORT[person.statureMode]})
            {report.shoulderWidthCm != null && (
              <>
                {' '}· shoulders <b>{report.shoulderWidthCm} cm</b> wide ({MODE_SHORT[report.shoulderMode]})
              </>
            )}{' '}
            · hips ~{person.dims.hipBreadthCm} cm · seated elbow ~{person.dims.sittingElbowHeightCm} cm above the seat
          </p>
        ) : (
          <p className="text-slate-400">Person’s height not given — comparing with the average human only.</p>
        )}
        <p>
          {average.label}: <b>{average.statureCm} cm</b> · shoulders ~{average.dims.shoulderBreadthCm} cm · hips ~
          {average.dims.hipBreadthCm} cm
        </p>
      </div>

      <div className={`grid gap-3 ${bodies.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {bodies.map((b) => (
          <ScoreBox key={b.who} fit={b} />
        ))}
      </div>

      {keys.map((k) => {
        const pc = person?.checks.find((c) => c.key === k);
        const ac = average.checks.find((c) => c.key === k);
        const any = (pc ?? ac)!;
        const rec = pc ?? ac!;
        return (
          <div key={k} className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{any.label}</span>
              <span className="text-sm font-bold text-slate-100">
                {any.measuredCm} cm <span className="text-[10px] font-normal text-slate-500">{MEASUREMENT_MODE_LABEL[any.mode]}</span>
              </span>
            </div>
            <CheckLine who="This person" c={pc} />
            <CheckLine who="Average human" c={ac} />
            <p className="text-xs text-emerald-300/90">{rec.recommendation}</p>
            <p className="text-[10px] text-slate-500">
              {rec.criterion} — {rec.standard}
            </p>
          </div>
        );
      })}

      {report.items.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-200 mb-1.5">
            <Box className="w-4 h-4 text-sky-400" /> Other measured objects
          </p>
          {report.items.map((it) => (
            <p key={it.id} className="text-xs text-slate-300">
              {it.label}: {it.heightCm != null ? `${it.heightCm} cm tall` : ''}
              {it.heightCm != null && it.widthCm != null ? ' × ' : ''}
              {it.widthCm != null ? `${it.widthCm} cm wide` : ''}
              {it.errCm != null ? ` (± ${it.errCm} cm)` : ''}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

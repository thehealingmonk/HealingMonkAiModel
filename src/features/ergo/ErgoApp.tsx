import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ErgoSetup from './ErgoSetup';
import ErgoCapture from './ErgoCapture';
import ErgoWorkstationScan from './ErgoWorkstationScan';
import ErgoObjectMeasure from './ErgoObjectMeasure';
import ErgoInputs from './ErgoInputs';
import ErgoReport from './ErgoReport';
import {
  ErgoEnvironment,
  ErgoTask,
  ErgoManualInputs,
  ErgoResult,
  ErgoObjectInputs,
  ErgoCalibration,
  ErgoPersonInputs,
  MeasuredItem,
} from '@/lib/ergo/ergoTypes';
import { defaultManualInputs, bandRank } from '@/lib/ergo/ergoKnowledge';
import { buildFitReport, hasFitData } from '@/lib/ergo/furnitureFit';
import { assessErgonomics } from '@/lib/ergo/ergoEngine';
import { assessRelationships, dominantMode } from '@/lib/ergo/relationshipEngine';
import { emptyCalibration } from '@/lib/ergo/calibration';
import { ErgoCaptures, ErgoWorkstationCapture } from './ergoTypes';

// The full ErgoAI flow as a self-contained step machine. A hard refresh returns
// the user to the start (state lives here, like the clinical PublicApp flow).
//
// Flow: setup → capture (human) → workstation (objects, skippable) → measure
// (calibration/manual, skippable) → inputs (task factors) → report. The
// workstation + measure steps are the NEW workplace layer; skipping them yields
// the original human-only report unchanged.
type Step = 'setup' | 'capture' | 'workstation' | 'measure' | 'inputs' | 'report';

const defaultObjectInputs: ErgoObjectInputs = {
  deskHeightCm: null,
  chairSeatHeightCm: null,
  monitorDistanceCm: null,
  footrestPresent: null,
};

const defaultPerson: ErgoPersonInputs = {
  statureCm: null,
  statureMode: 'unknown',
  shoulderWidthCm: null,
  shoulderMode: 'unknown',
  population: 'in-adult',
};

export default function ErgoApp() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('setup');
  const [environment, setEnvironment] = useState<ErgoEnvironment>('office');
  const [task, setTask] = useState<ErgoTask>('computer');
  const [captures, setCaptures] = useState<ErgoCaptures>({ side: null, front: null });
  const [workstation, setWorkstation] = useState<ErgoWorkstationCapture | null>(null);
  const [objectInputs, setObjectInputs] = useState<ErgoObjectInputs>(defaultObjectInputs);
  const [calibration, setCalibration] = useState<ErgoCalibration>(emptyCalibration);
  const [person, setPerson] = useState<ErgoPersonInputs>(defaultPerson);
  const [items, setItems] = useState<MeasuredItem[]>([]);
  const [manual, setManual] = useState<ErgoManualInputs>(defaultManualInputs);
  const [result, setResult] = useState<ErgoResult | null>(null);
  const [genError, setGenError] = useState('');

  const restart = () => {
    setGenError('');
    setCaptures({ side: null, front: null });
    setWorkstation(null);
    setObjectInputs(defaultObjectInputs);
    setCalibration(emptyCalibration);
    setPerson(defaultPerson);
    setItems([]);
    setManual(defaultManualInputs);
    setResult(null);
    setStep('setup');
  };

  // Build the merged result: the existing posture engine PLUS the new workplace
  // relationship findings (only when a workstation frame was captured).
  const generate = (m: ErgoManualInputs) => {
    setGenError('');
    try {
      const base = assessErgonomics(
        environment,
        task,
        captures.side?.angles ?? null,
        captures.front?.angles ?? null,
        m
      );
      if (workstation) {
        const findings = assessRelationships(
          workstation.landmarks,
          workstation.angles,
          workstation.objects,
          objectInputs,
          calibration,
          workstation.frameW
        );
        base.objects = workstation.objects;
        base.findings = findings;
        base.measurementMode = dominantMode(findings);
      }
      // Furniture ↔ body fit, for this person and for the average human.
      if (hasFitData(objectInputs, person, items)) {
        const fit = buildFitReport(person, objectInputs, items, m);
        base.fit = fit;
        const seen = new Set(base.recommendations.map((r) => r.text));
        for (const c of fit.person?.checks ?? fit.average.checks) {
          if (bandRank(c.band) < bandRank('medium') || seen.has(c.recommendation)) continue;
          seen.add(c.recommendation);
          base.recommendations.push({ priority: bandRank(c.band) >= bandRank('high') ? 1 : 2, text: c.recommendation });
        }
        base.recommendations.sort((a, b) => a.priority - b.priority);
      }
      setResult(base);
      setStep('report');
    } catch (err) {
      // E.g. no usable pose in the captured frames — say so instead of a dead click.
      console.error('ergo assessment failed', err);
      setGenError(
        'We could not analyse the captured posture. Please go back and recapture the side view with your whole upper body visible.'
      );
    }
  };

  if (step === 'setup') {
    return (
      <ErgoSetup
        environment={environment}
        task={task}
        onChange={(env, tsk) => {
          setEnvironment(env);
          setTask(tsk);
        }}
        onContinue={() => setStep('capture')}
        onExit={() => navigate('/')}
      />
    );
  }

  if (step === 'capture') {
    return (
      <ErgoCapture
        onBack={() => setStep('setup')}
        onArItems={(its) => setItems((prev) => [...prev, ...its])}
        onComplete={(caps) => {
          setCaptures(caps);
          setStep('workstation');
        }}
      />
    );
  }

  if (step === 'workstation') {
    return (
      <ErgoWorkstationScan
        onBack={() => setStep('capture')}
        onArItems={(its) => setItems((prev) => [...prev, ...its])}
        onComplete={(cap) => {
          setWorkstation(cap);
          // Even when skipped, the measure step can still measure the body
          // photos or an uploaded photo (and is itself optional).
          setStep('measure');
        }}
      />
    );
  }

  if (step === 'measure') {
    return (
      <ErgoObjectMeasure
        workstation={workstation}
        captures={captures}
        initialInputs={objectInputs}
        initialPerson={person}
        initialItems={items}
        initialCalibration={calibration}
        onBack={() => setStep('workstation')}
        onContinue={(inp, per, its, cal) => {
          setObjectInputs(inp);
          setPerson(per);
          setItems(its);
          setCalibration(cal);
          setStep('inputs');
        }}
      />
    );
  }

  if (step === 'inputs') {
    return (
      <>
      {genError && (
        <div role="alert" className="fixed inset-x-0 top-0 z-50 bg-red-600 px-4 py-3 text-center text-sm font-medium text-white">
          {genError}{' '}
          <button type="button" className="ml-2 underline" onClick={() => { setGenError(''); setStep('capture'); }}>
            Recapture
          </button>
        </div>
      )}
      <ErgoInputs
        task={task}
        initial={manual}
        onBack={() => setStep('measure')}
        onGenerate={(m) => {
          setManual(m);
          generate(m);
        }}
      />
      </>
    );
  }

  if (step === 'report' && result) {
    return (
      <ErgoReport
        result={result}
        captures={captures}
        workstation={workstation}
        onBack={() => setStep('inputs')}
        onRestart={restart}
      />
    );
  }

  // Fallback (e.g. report step reached without a result): restart from setup.
  return (
    <ErgoSetup
      environment={environment}
      task={task}
      onChange={(env, tsk) => {
        setEnvironment(env);
        setTask(tsk);
      }}
      onContinue={() => setStep('capture')}
      onExit={() => navigate('/')}
    />
  );
}

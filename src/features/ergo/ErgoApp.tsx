import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ErgoSetup from './ErgoSetup';
import ErgoCapture from './ErgoCapture';
import ErgoInputs from './ErgoInputs';
import ErgoReport from './ErgoReport';
import { ErgoEnvironment, ErgoTask, ErgoManualInputs, ErgoResult } from '@/lib/ergo/ergoTypes';
import { defaultManualInputs } from '@/lib/ergo/ergoKnowledge';
import { assessErgonomics } from '@/lib/ergo/ergoEngine';
import { ErgoCaptures } from './ergoTypes';

type Step = 'setup' | 'capture' | 'inputs' | 'report';

// The full ErgoAI flow as a self-contained step machine. A hard refresh returns
// the user to the start (state lives here, like the clinical PublicApp flow).
export default function ErgoApp() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('setup');
  const [environment, setEnvironment] = useState<ErgoEnvironment>('office');
  const [task, setTask] = useState<ErgoTask>('computer');
  const [captures, setCaptures] = useState<ErgoCaptures>({ side: null, front: null });
  const [manual, setManual] = useState<ErgoManualInputs>(defaultManualInputs);
  const [result, setResult] = useState<ErgoResult | null>(null);

  const restart = () => {
    setCaptures({ side: null, front: null });
    setManual(defaultManualInputs);
    setResult(null);
    setStep('setup');
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
        onComplete={(caps) => {
          setCaptures(caps);
          setStep('inputs');
        }}
      />
    );
  }

  if (step === 'inputs') {
    return (
      <ErgoInputs
        task={task}
        initial={manual}
        onBack={() => setStep('capture')}
        onGenerate={(m) => {
          setManual(m);
          setResult(
            assessErgonomics(environment, task, captures.side?.angles ?? null, captures.front?.angles ?? null, m)
          );
          setStep('report');
        }}
      />
    );
  }

  if (step === 'report' && result) {
    return (
      <ErgoReport
        result={result}
        captures={captures}
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

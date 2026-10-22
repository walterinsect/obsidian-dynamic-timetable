import React from 'react';
import { post } from '../vscodeApi';

const Icon = ({ name }: { name: string }) => (
  <span className={`codicon codicon-${name}`} aria-hidden="true" />
);

const Btn = (p: { label: string; icon: string; onClick: () => void }) => (
  <button className="dt-button" title={p.label} aria-label={p.label} onClick={p.onClick}>
    <Icon name={p.icon} />
  </button>
);

export const ButtonContainer = () => (
  <div className="dt-button-container">
    <Btn label="Complete task" icon="pass" onClick={() => post({ type: 'complete' })} />
    <Btn label="Interrupt task" icon="circle-slash" onClick={() => post({ type: 'interrupt' })} />
    <Btn label="Refresh" icon="refresh" onClick={() => post({ type: 'refresh' })} />
  </div>
);

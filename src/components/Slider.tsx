import React from 'react';

// A labelled range input showing its current value
export const Slider: React.FC<{
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, value, display, min, max, step = 1, onChange }) => (
  <label className="flex flex-col gap-0.5">
    <span className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums text-ui-muted">{display}</span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-ui-accent"
    />
  </label>
);

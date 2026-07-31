import type { ParseMode } from '@/types';

export interface InputPanelProps {
  input: string;
  onInputChange: (value: string) => void;
  mode: ParseMode;
  onModeChange: (mode: ParseMode) => void;
}

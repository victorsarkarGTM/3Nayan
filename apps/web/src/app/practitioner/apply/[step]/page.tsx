import { notFound } from 'next/navigation';
import type { StepNumber } from '@3nayan/shared';
import { Wizard } from '@/components/apply/Wizard';

export default async function ApplyStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  const n = Number(step);
  if (![1, 2, 3, 4, 5, 6].includes(n)) notFound();
  return <Wizard step={n as StepNumber} />;
}

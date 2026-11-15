import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import type { StepNumber } from '@3nayan/shared';
import { STEP_TITLES, Step1, Step2, Step3, Step4, Step5, Step6 } from '@/components/apply/steps';
import { useApplication } from '@/components/apply/useApplication';
import { H1, Muted, Notice, Screen } from '@/components/ui';
import { color } from '@/theme';

const STEPS = { 1: Step1, 2: Step2, 3: Step3, 4: Step4, 5: Step5, 6: Step6 } as const;

export default function ApplyStep() {
  const params = useLocalSearchParams<{ step: string }>();
  const n = Math.min(6, Math.max(1, Number(params.step) || 1)) as StepNumber;
  const ctx = useApplication();
  const status = ctx.app?.practitioner?.status;
  const editable = status === 'draft' || status === 'changes_requested';
  useEffect(() => {
    if (status && !editable) router.replace('/practitioner/status');
  }, [status, editable]);
  const Body = STEPS[n];
  const steps = ctx.app?.completeness?.steps;
  return (
    <Screen>
      <Muted>Step {n} of 6</Muted>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {([1, 2, 3, 4, 5, 6] as StepNumber[]).map((s) => (
          <Text key={s} accessibilityRole="link" accessibilityLabel={`Step ${s}, ${STEP_TITLES[s]}, ${steps?.[s] ? 'complete' : 'incomplete'}`}
            onPress={() => router.replace(`/apply/${s}`)}
            style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: s === n ? color.primary : steps?.[s] ? color.success : color.line }} />
        ))}
      </View>
      <H1>{STEP_TITLES[n]}</H1>
      {ctx.saving === 'saved' && <Muted>Saved</Muted>}
      {ctx.saving === 'error' && ctx.saveError && <Notice tone="danger">{ctx.saveError}</Notice>}
      {!ctx.app?.snapshot ? <Muted>Loading your application…</Muted> : <Body key={n} ctx={ctx} next={() => router.replace(n < 6 ? `/apply/${n + 1}` : '/practitioner/status')} />}
    </Screen>
  );
}

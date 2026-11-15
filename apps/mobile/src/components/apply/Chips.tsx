import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, radius, space } from '@/theme';

export function Chips({ options, selected, onToggle }: { options: Array<{ id: string; label: string }>; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <View style={s.wrap}>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <Pressable key={o.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={o.label}
            onPress={() => onToggle(o.id)} style={[s.chip, on && s.on]}>
            <Text style={[s.text, on && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: { borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, paddingHorizontal: space(3), paddingVertical: space(2), backgroundColor: color.surface },
  on: { backgroundColor: color.primary, borderColor: color.primary },
  text: { color: color.ink, fontSize: 14 },
});

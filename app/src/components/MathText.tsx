import React from 'react';
import { Text as RNText, View } from 'react-native';
import { Text } from './ui';
import { splitMath } from '@/lib/mathText';
import { useTheme } from '@/theme/ThemeProvider';

/** Renders **bold** and math ($…$ → readable Unicode) with larger body text and generous line height. */
export function MathText({ children, size = 17 }: { children: string; size?: number }) {
  const { colors } = useTheme();
  const paragraphs = children.split(/\n{2,}/);
  return (
    <View style={{ gap: 10 }}>
      {paragraphs.map((p, pi) => (
        <RNText key={pi} maxFontSizeMultiplier={1.6} style={{ color: colors.text, fontSize: size, lineHeight: size * 1.55 }} selectable>
          {splitMath(p).map((part, i) =>
            part.math ? (
              <RNText key={i} style={{ fontStyle: 'italic', fontFamily: 'serif', fontSize: size + 1, color: colors.accentText, fontWeight: part.display ? '600' : '400' }}>
                {part.display ? `\n${part.text}\n` : part.text}
              </RNText>
            ) : (
              part.text.split(/\*\*(.+?)\*\*/g).map((seg, j) =>
                j % 2 ? (
                  <RNText key={`${i}-${j}`} style={{ fontWeight: '700' }}>
                    {seg}
                  </RNText>
                ) : (
                  <RNText key={`${i}-${j}`}>{seg}</RNText>
                )
              )
            )
          )}
        </RNText>
      ))}
    </View>
  );
}

export { Text };

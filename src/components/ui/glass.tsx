import { BlurView } from 'expo-blur';
import { useState, type ElementType } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { glass, shadows, radius as radii } from '@/constants/theme';

export type GlassProps = ViewProps & {
  radius?: number;
  variant?: keyof typeof glass;
  dashed?: boolean;
  flat?: boolean;
  borderColor?: string;
  onPress?: () => void;
  disabled?: boolean;
};

export function Glass({
  radius = radii.card,
  variant = 'regular',
  dashed,
  flat,
  borderColor,
  onPress,
  disabled,
  style,
  children,
  ...rest
}: GlassProps) {
  const material = glass[variant];
  const [size, setSize] = useState({ width: 0, height: 0 });
  const stroke = borderColor ?? material.border;
  const Container: ElementType = onPress ? Pressable : View;
  return (
    <Container
      onPress={onPress}
      {...(onPress && { disabled })}
      style={[
        { borderRadius: radius },
        !flat && variant === 'regular' && { boxShadow: shadows.glass },
        style,
      ]}
      {...rest}>
      <View
        pointerEvents="none"
        onLayout={dashed ? (event) => setSize(event.nativeEvent.layout) : undefined}
        style={[
          StyleSheet.absoluteFill,
          styles.surface,
          { borderRadius: radius },
          !dashed && { borderWidth: 1, borderColor: stroke },
        ]}>
        <BlurView
          intensity={material.blur}
          tint="systemUltraThinMaterialLight"
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundImage: material.fill }]} />
        {dashed && size.width > 0 && (
          <Svg width={size.width} height={size.height}>
            <Rect
              x={0.75}
              y={0.75}
              width={size.width - 1.5}
              height={size.height - 1.5}
              rx={radius}
              fill="none"
              stroke={stroke}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          </Svg>
        )}
      </View>
      {children}
    </Container>
  );
}

const styles = StyleSheet.create({
  surface: { overflow: 'hidden' },
});

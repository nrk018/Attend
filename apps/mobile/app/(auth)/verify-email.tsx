import { useState } from 'react';
import { StyleSheet, Alert, View, Text, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, ENDPOINTS } from '@/lib/api';
import { ScreenContainer } from '@/components/layout';
import { GlassCard, GlassButton, IconBadge } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

const logoDark = require('@/assets/images/logo-dark.png');

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [loading, setLoading] = useState(false);

  const handleResend = async () => {
    if (!email) return;
    setLoading(true);
    try {
      await api.post(ENDPOINTS.RESEND_VERIFICATION, { email });
      Alert.alert('Sent', 'Check your inbox for the verification link.');
    } catch {
      Alert.alert('Error', 'Could not send verification email. Try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer safeBottom>
      <View style={styles.container}>
        <Image source={logoDark} style={styles.logo} resizeMode="contain" />

        <GlassCard style={styles.card}>
          <IconBadge variant="warning" size="lg" style={styles.iconBadge}>
            <Ionicons name="mail-unread" size={28} color={colors.warning} />
          </IconBadge>

          <Text style={styles.title}>Verify your email</Text>

          <Text style={styles.subtitle}>
            Your account is waiting to be activated. A Platform Admin or Super
            Admin can approve you in the College Administration desktop app
            (Approvals). You can also open the verification link sent to{' '}
            <Text style={styles.emailText}>{email || 'your email'}</Text> in a
            browser as http:// (not https), then sign in.
          </Text>
        </GlassCard>

        <GlassButton
          variant="primary"
          size="lg"
          onPress={handleResend}
          loading={loading}
          disabled={loading}
          style={styles.button}
        >
          Resend verification email
        </GlassButton>

        <GlassButton variant="ghost" size="md" onPress={() => router.back()}>
          Back to sign in
        </GlassButton>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 180,
    height: 60,
    marginBottom: spacing.xxl,
  },
  card: {
    width: '100%',
    marginBottom: spacing.xl,
  },
  iconBadge: {
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  emailText: {
    color: colors.primary,
    fontWeight: '600',
  },
  button: {
    width: '100%',
    marginBottom: spacing.lg,
  },
});

import { useState } from 'react';
import { StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { api, ENDPOINTS } from '@/lib/api';

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
    <View style={styles.container}>
      <Text style={styles.title}>Verify your email</Text>
      <Text style={styles.subtitle}>
        We sent a verification link to {email || 'your email'}. Click the link to verify your account, then sign in.
      </Text>
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleResend}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Resend verification email'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
        <Text style={styles.backText}>Back to sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 24, opacity: 0.8 },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  backLink: { alignItems: 'center' },
  backText: { color: '#007AFF', fontSize: 16 },
});

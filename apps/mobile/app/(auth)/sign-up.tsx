import { StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Text, View } from '@/components/Themed';

export default function SignUpScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>
        Attend accounts are created by your administrator. Contact your department admin or college admin to get an account.
      </Text>
      <Text style={styles.note}>
        Teachers and admins are added by their department or college administrator.
      </Text>
      <TouchableOpacity style={styles.button} onPress={() => router.back()}>
        <Text style={styles.buttonText}>Back to Sign In</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 16, opacity: 0.9 },
  note: { fontSize: 14, textAlign: 'center', marginBottom: 32, opacity: 0.7 },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

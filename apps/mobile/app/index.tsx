import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/auth';

export default function Index() {
  const { token, hasHydrated } = useAuthStore();

  if (!hasHydrated) return null;
  if (token) return <Redirect href="/(tabs)" />;
  return <Redirect href="/(auth)/login" />;
}

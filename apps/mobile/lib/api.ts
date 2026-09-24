import { router } from 'expo-router';
import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { ENDPOINTS } from '@attend/shared';
import { useAuthStore } from '@/store/auth';

const BACKEND_PORT = (process.env.EXPO_PUBLIC_API_PORT || '8000').trim();

function isSimulator(): boolean {
  return Constants.isDevice === false;
}

function getExpoDevHost(): string | null {
  const debuggerHost = Constants.expoGoConfig?.debuggerHost?.split(':').shift();
  if (debuggerHost && debuggerHost !== 'localhost' && debuggerHost !== '127.0.0.1') {
    return debuggerHost;
  }
  const hostUri = Constants.expoConfig?.hostUri?.split(':').shift();
  if (hostUri && hostUri !== 'localhost' && hostUri !== '127.0.0.1') {
    return hostUri;
  }
  return null;
}

/** Resolve on every call — Expo debugger host is not always ready at first import. */
export function getApiBase(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  // Release APK / IPA: never use laptop IP or Expo debugger host.
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    if (!envUrl) {
      throw new Error('Missing EXPO_PUBLIC_API_URL in this release build.');
    }
    return envUrl.replace(/\/$/, '');
  }

  if (Platform.OS === 'web') {
    return `http://localhost:${BACKEND_PORT}`;
  }

  // Simulator must use loopback. A LAN IP in .env will fail here.
  if (isSimulator()) {
    if (Platform.OS === 'android') {
      return `http://10.0.2.2:${BACKEND_PORT}`;
    }
    return `http://localhost:${BACKEND_PORT}`;
  }

  // Physical device (Expo Go): use the same explicit URL that already works for login.
  if (envUrl) return envUrl.replace(/\/$/, '');

  const expoHost = getExpoDevHost();
  if (expoHost) {
    return `http://${expoHost}:${BACKEND_PORT}`;
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${BACKEND_PORT}`;
  }

  return `http://localhost:${BACKEND_PORT}`;
}

function isFormDataBody(data: unknown): boolean {
  if (typeof FormData !== 'undefined' && data instanceof FormData) return true;
  return !!data && typeof data === 'object' && Array.isArray((data as { _parts?: unknown })._parts);
}

export const api = axios.create({
  timeout: 120000,
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
});

api.interceptors.request.use((config) => {
  const base = getApiBase();
  config.baseURL = base;
  api.defaults.baseURL = base;
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (isFormDataBody(config.data)) {
    const headers = config.headers;
    if (headers && typeof headers.delete === 'function') {
      headers.delete('Content-Type');
      headers.delete('content-type');
    } else if (headers) {
      delete headers['Content-Type'];
      delete headers['content-type'];
    }
  } else if (!config.headers['Content-Type'] && !config.headers['content-type']) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      useAuthStore.getState().logout();
      router.replace('/(auth)/login');
    }
    return Promise.reject(err);
  }
);

/** Multipart upload using the same axios client as login (fetch fails on device). */
export async function uploadForm<T = unknown>(path: string, formData: FormData): Promise<T> {
  const { data } = await api.post<T>(path, formData, { timeout: 120000 });
  return data;
}

export { ENDPOINTS };

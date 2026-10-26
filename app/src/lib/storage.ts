import { Platform } from 'react-native';

/** Key-value storage: SecureStore on native, localStorage on web (see docs/privacy-and-security.md for the web trade-off). */
export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') return typeof localStorage === 'undefined' ? null : localStorage.getItem(`sc.${key}`);
      const SecureStore = await import('expo-secure-store');
      return await SecureStore.getItemAsync(`sc.${key}`);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') localStorage.setItem(`sc.${key}`, value);
      else {
        const SecureStore = await import('expo-secure-store');
        await SecureStore.setItemAsync(`sc.${key}`, value);
      }
    } catch {
      /* storage unavailable → in-memory only */
    }
  },
  async remove(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') localStorage.removeItem(`sc.${key}`);
      else {
        const SecureStore = await import('expo-secure-store');
        await SecureStore.deleteItemAsync(`sc.${key}`);
      }
    } catch {
      /* ignore */
    }
  },
};

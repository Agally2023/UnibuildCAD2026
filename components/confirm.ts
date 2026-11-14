import { Alert, Platform } from 'react-native';

// A yes/no question that works on the web and on phones. Resolves true when the person confirms.
export function askConfirm(title: string, message: string, okLabel = 'Delete'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false);
  return new Promise(res => Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel', onPress: () => res(false) }, { text: okLabel, style: 'destructive', onPress: () => res(true) }], { cancelable: true, onDismiss: () => res(false) }));
}

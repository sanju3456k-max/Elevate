const LOCAL_LAN_SERVER = '192.168.1.2:3000';

export function isNativeCapacitorApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as any).Capacitor?.isNativePlatform?.())
  );
}

export function getLiveApiBaseUrl(): string {
  if (isNativeCapacitorApp()) {
    return `http://${LOCAL_LAN_SERVER}`;
  }
  return '';
}

export function getLiveWsUrl(): string {
  if (isNativeCapacitorApp()) {
    return `ws://${LOCAL_LAN_SERVER}/ws`;
  }
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${window.location.host}/ws`;
}

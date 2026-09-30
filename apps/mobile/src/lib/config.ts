// Where the app gets its catalog. With EXPO_PUBLIC_API_URL set (in apps/mobile/.env), everything
// comes from the shortDrama API; without it, the app runs on its built-in sample data.
//
// Local testing on a phone: EXPO_PUBLIC_API_URL=http://<your Mac's LAN IP>:3101

export const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || undefined;

export const usingApi = API_URL !== undefined;

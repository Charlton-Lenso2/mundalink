// MundaLink profile types.

export type ProfileRole = "SELLER" | "BUYER" | "ADMIN" | "OBSERVER";

export interface ProfileRecord {
  id: string;
  firebaseUid: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  role: ProfileRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateProfileInput {
  displayName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  role?: ProfileRole;
}

export function toProfileRecord(p: {
  id: string;
  firebaseUid: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}): ProfileRecord {
  return { ...p, role: p.role as ProfileRole };
}

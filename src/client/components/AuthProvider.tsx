"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export interface AppUser {
  _id: string;
  firebaseUid: string;
  email: string;
  displayName: string;
  orgId: string;
  role: "admin" | "viewer";
}

export interface AppOrganization {
  _id: string;
  name: string;
}

interface PendingInvite {
  _id: string;
  orgId: string;
  orgName: string;
  role: string;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  user: AppUser | null;
  organization: AppOrganization | null;
  needsSetup: boolean;
  pendingInvites: PendingInvite[];
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  user: null,
  organization: null,
  needsSetup: false,
  pendingInvites: [],
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  refreshUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [organization, setOrganization] = useState<AppOrganization | null>(
    null
  );
  const [needsSetup, setNeedsSetup] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (fbUser: FirebaseUser) => {
    try {
      const token = await fbUser.getIdToken();
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch user");
      const data = await res.json();

      if (data.needsSetup) {
        setNeedsSetup(true);
        setPendingInvites(data.pendingInvites || []);
        setUser(null);
        setOrganization(null);
      } else {
        setNeedsSetup(false);
        setPendingInvites([]);
        setUser(data.user);
        setOrganization(data.organization);
      }
    } catch {
      setUser(null);
      setOrganization(null);
      setNeedsSetup(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await fetchMe(fbUser);
      } else {
        setUser(null);
        setOrganization(null);
        setNeedsSetup(false);
        setPendingInvites([]);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [fetchMe]);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOutFn = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setOrganization(null);
    setNeedsSetup(false);
  };

  const refreshUser = async () => {
    if (firebaseUser) {
      await fetchMe(firebaseUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        organization,
        needsSetup,
        pendingInvites,
        loading,
        signIn,
        signOut: signOutFn,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

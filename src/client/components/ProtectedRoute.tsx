"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { firebaseUser, user, needsSetup, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.push("/login");
    } else if (needsSetup) {
      router.push("/setup");
    }
  }, [loading, firebaseUser, needsSetup, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!firebaseUser || needsSetup || !user) {
    return null;
  }

  return <>{children}</>;
}

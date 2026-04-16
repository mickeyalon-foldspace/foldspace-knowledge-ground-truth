"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { authSignup, authJoin } from "@/lib/api";

export default function SetupPage() {
  const { firebaseUser, needsSetup, pendingInvites, loading, signOut, refreshUser } =
    useAuth();
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!firebaseUser) {
    router.push("/login");
    return null;
  }

  if (!needsSetup) {
    router.push("/");
    return null;
  }

  const handleCreateOrg = async () => {
    if (!orgName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await authSignup(orgName.trim());
      await refreshUser();
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create organization");
    } finally {
      setSaving(false);
    }
  };

  const handleJoin = async (inviteId: string) => {
    setSaving(true);
    setError(null);
    try {
      await authJoin(inviteId);
      await refreshUser();
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join organization");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Welcome!</h1>
        <p className="text-sm text-gray-500 mb-6">
          Signed in as {firebaseUser.email}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}

        {pendingInvites.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              You have been invited to:
            </h2>
            <div className="space-y-2">
              {pendingInvites.map((inv) => (
                <div
                  key={inv._id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {inv.orgName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Role: {inv.role}
                    </p>
                  </div>
                  <button
                    onClick={() => handleJoin(inv._id)}
                    disabled={saving}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-gray-400">
                  or create a new organization
                </span>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Organization Name
          </label>
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g. Foldspace"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
          />
          <button
            onClick={handleCreateOrg}
            disabled={saving || !orgName.trim()}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Organization"}
          </button>
        </div>

        <button
          onClick={signOut}
          className="w-full mt-4 text-xs text-gray-400 hover:text-gray-600"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

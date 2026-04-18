"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import {
  getUsers,
  getInvites,
  createInvite,
  revokeInvite,
  updateUserRole,
  removeUser,
} from "@/lib/api";
import type { UserListItem, InviteData } from "@/lib/api";

export default function SettingsPage() {
  const { user, organization } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [invites, setInvites] = useState<InviteData[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "viewer">("viewer");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const isAdmin = user?.role === "admin";

  const fetchData = async () => {
    try {
      const [u, i] = await Promise.all([getUsers(), getInvites()]);
      setUsers(u);
      setInvites(i.filter((inv) => inv.status === "pending"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchData();
    else setLoading(false);
  }, [isAdmin]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSending(true);
    setError(null);
    try {
      await createInvite(inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send invite");
    } finally {
      setSending(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateUserRole(userId, newRole);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!confirm("Remove this user from the organization?")) return;
    try {
      await removeUser(userId);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove user");
    }
  };

  const handleRevokeInvite = async (id: string) => {
    try {
      await revokeInvite(id);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke invite");
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

          <div className="bg-white rounded-lg border p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              Organization
            </h2>
            <p className="text-lg font-medium text-gray-900">
              {organization?.name}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Your role: <span className="font-medium capitalize">{user?.role}</span>
            </p>
          </div>

          <div className="bg-white rounded-lg border p-5 mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">
                Score Profiles
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Manage which criteria contribute to overall scores in the UI.
              </p>
            </div>
            <Link
              href="/settings/score-profiles"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Manage &rarr;
            </Link>
          </div>

          {!isAdmin && (
            <div className="bg-white rounded-lg border p-5 text-center text-gray-500 text-sm">
              Only admins can manage users and invites.
            </div>
          )}

          {isAdmin && (
            <>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                  {error}
                  <button
                    onClick={() => setError(null)}
                    className="ml-2 text-red-500"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Invite form */}
              <div className="bg-white rounded-lg border p-5 mb-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">
                  Invite User
                </h2>
                <div className="flex gap-3">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as "admin" | "viewer")
                    }
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={handleInvite}
                    disabled={sending || !inviteEmail.trim()}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Invite"}
                  </button>
                </div>
              </div>

              {/* Pending invites */}
              {invites.length > 0 && (
                <div className="bg-white rounded-lg border p-5 mb-6">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">
                    Pending Invites
                  </h2>
                  <div className="space-y-2">
                    {invites.map((inv) => (
                      <div
                        key={inv._id}
                        className="flex items-center justify-between py-2 border-b last:border-0"
                      >
                        <div>
                          <p className="text-sm text-gray-900">{inv.email}</p>
                          <p className="text-xs text-gray-500 capitalize">
                            {inv.role}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRevokeInvite(inv._id)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Members */}
              <div className="bg-white rounded-lg border p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">
                  Members
                </h2>
                {loading ? (
                  <p className="text-sm text-gray-500">Loading...</p>
                ) : (
                  <div className="space-y-2">
                    {users.map((u) => (
                      <div
                        key={u._id}
                        className="flex items-center justify-between py-2 border-b last:border-0"
                      >
                        <div>
                          <p className="text-sm text-gray-900">
                            {u.displayName}
                            {u._id === user?._id && (
                              <span className="ml-1 text-xs text-gray-400">
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {u._id !== user?._id ? (
                            <>
                              <select
                                value={u.role}
                                onChange={(e) =>
                                  handleRoleChange(u._id, e.target.value)
                                }
                                className="text-xs border border-gray-300 rounded px-2 py-1"
                              >
                                <option value="admin">Admin</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <button
                                onClick={() => handleRemoveUser(u._id)}
                                className="text-xs text-red-600 hover:text-red-800"
                              >
                                Remove
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400 capitalize">
                              {u.role}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import {
  getScoreProfiles,
  createScoreProfile,
  updateScoreProfile,
  deleteScoreProfile,
  setDefaultScoreProfile,
  ALL_SCORE_CRITERIA,
  type ScoreProfile,
  type ScoreCriterion,
} from "@/lib/api";

function CriterionChips({ criteria }: { criteria: ScoreCriterion[] }) {
  if (criteria.length === 0) {
    return <span className="text-xs text-gray-400">none</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {criteria.map((c) => (
        <span
          key={c}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 capitalize"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

interface ProfileModalState {
  open: boolean;
  mode: "create" | "edit";
  id?: string;
  name: string;
  criteria: ScoreCriterion[];
  isDefault: boolean;
}

const emptyModalState: ProfileModalState = {
  open: false,
  mode: "create",
  name: "",
  criteria: ["correctness", "completeness", "relevance"],
  isDefault: false,
};

export default function ScoreProfilesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [profiles, setProfiles] = useState<ScoreProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ProfileModalState>(emptyModalState);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      const list = await getScoreProfiles();
      setProfiles(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profiles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const openCreate = () => {
    setModal({ ...emptyModalState, open: true, mode: "create" });
  };

  const openEdit = (p: ScoreProfile) => {
    setModal({
      open: true,
      mode: "edit",
      id: p._id,
      name: p.name,
      criteria: [...p.enabledCriteria],
      isDefault: p.isDefault,
    });
  };

  const close = () => setModal(emptyModalState);

  const toggleCriterion = (c: ScoreCriterion) => {
    setModal((m) => ({
      ...m,
      criteria: m.criteria.includes(c)
        ? m.criteria.filter((x) => x !== c)
        : [...m.criteria, c],
    }));
  };

  const handleSave = async () => {
    if (!modal.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (modal.mode === "create") {
        await createScoreProfile({
          name: modal.name.trim(),
          enabledCriteria: modal.criteria,
          isDefault: modal.isDefault,
        });
      } else if (modal.id) {
        await updateScoreProfile(modal.id, {
          name: modal.name.trim(),
          enabledCriteria: modal.criteria,
          isDefault: modal.isDefault,
        });
      }
      close();
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this score profile?")) return;
    try {
      await deleteScoreProfile(id);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete profile");
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultScoreProfile(id);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set default");
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Score Profiles
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Named profiles controlling which criteria are used to compute
                overall scores in the UI.
              </p>
            </div>
            <Link
              href="/settings"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              &larr; Back to Settings
            </Link>
          </div>

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

          {isAdmin && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={openCreate}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
              >
                + New Profile
              </button>
            </div>
          )}

          <div className="bg-white rounded-lg border overflow-hidden">
            {loading ? (
              <p className="p-6 text-sm text-gray-500">Loading...</p>
            ) : profiles.length === 0 ? (
              <p className="p-6 text-sm text-gray-500">No profiles yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-left px-4 py-2">Enabled Criteria</th>
                    <th className="text-left px-4 py-2">Default</th>
                    {isAdmin && (
                      <th className="text-right px-4 py-2">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p._id} className="border-t">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {p.name}
                      </td>
                      <td className="px-4 py-3">
                        <CriterionChips criteria={p.enabledCriteria} />
                      </td>
                      <td className="px-4 py-3">
                        {p.isDefault ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-50 text-green-700">
                            default
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right space-x-2">
                          {!p.isDefault && (
                            <button
                              onClick={() => handleSetDefault(p._id)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Set default
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(p)}
                            className="text-xs text-gray-600 hover:text-gray-900"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(p._id)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {modal.open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {modal.mode === "create" ? "New Score Profile" : "Edit Score Profile"}
                </h2>

                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={modal.name}
                  onChange={(e) =>
                    setModal((m) => ({ ...m, name: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Without Faithfulness"
                />

                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Enabled Criteria
                </label>
                <div className="space-y-1.5 mb-4">
                  {ALL_SCORE_CRITERIA.map((c) => (
                    <label
                      key={c}
                      className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={modal.criteria.includes(c)}
                        onChange={() => toggleCriterion(c)}
                        className="h-4 w-4 text-blue-600 rounded"
                      />
                      <span className="capitalize">{c}</span>
                    </label>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-5">
                  <input
                    type="checkbox"
                    checked={modal.isDefault}
                    onChange={(e) =>
                      setModal((m) => ({ ...m, isDefault: e.target.checked }))
                    }
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span>Set as default for this org</span>
                </label>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={close}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !modal.name.trim()}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}

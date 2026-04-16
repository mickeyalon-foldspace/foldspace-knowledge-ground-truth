"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import FileUpload from "@/components/FileUpload";
import {
  getGoldenSets,
  getGoldenSet,
  previewGoldenSet,
  saveGoldenSet,
  deleteGoldenSet,
} from "@/lib/api";
import type { GoldenSetSummary, GoldenSetFull, GoldenSetEntry } from "@/lib/api";
import { isRtlLanguage } from "@/lib/rtl";

export default function GoldenSetsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [sets, setSets] = useState<GoldenSetSummary[]>([]);
  const [selectedSet, setSelectedSet] = useState<GoldenSetFull | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Preview state
  const [previewEntries, setPreviewEntries] = useState<GoldenSetEntry[] | null>(null);
  const [previewFormat, setPreviewFormat] = useState("");
  const [previewLangs, setPreviewLangs] = useState<string[]>([]);
  const [previewName, setPreviewName] = useState("");
  const [previewDescription, setPreviewDescription] = useState("");
  const [previewSelected, setPreviewSelected] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const fetchSets = async () => {
    try {
      const data = await getGoldenSets();
      setSets(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load golden sets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSets();
  }, []);

  const handleUpload = async (file: File, name: string, description: string) => {
    setIsUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await previewGoldenSet(file);
      setPreviewEntries(result.entries);
      setPreviewFormat(result.sourceFormat);
      setPreviewLangs(result.languages);
      setPreviewName(name);
      setPreviewDescription(description);
      // Select all by default
      setPreviewSelected(new Set(result.entries.map((_, i) => i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveSelected = async () => {
    if (!previewEntries) return;
    setIsSaving(true);
    setError(null);
    try {
      const selected = previewEntries.filter((_, i) => previewSelected.has(i));
      const result = await saveGoldenSet(
        previewName,
        previewDescription,
        selected,
        previewFormat
      );
      const r = result as Record<string, unknown>;
      const langs = (r.languages as string[]) || [];
      setSuccess(
        `Uploaded "${r.name}" — ${r.entryCount} entries ` +
          `(${previewFormat} format, languages: ${langs.map((l: string) => l.toUpperCase()).join(", ")})`
      );
      setPreviewEntries(null);
      await fetchSets();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const togglePreviewEntry = (index: number) => {
    setPreviewSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const togglePreviewAll = () => {
    if (!previewEntries) return;
    setPreviewSelected((prev) =>
      prev.size === previewEntries.length
        ? new Set()
        : new Set(previewEntries.map((_, i) => i))
    );
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this golden set?")) return;
    try {
      await deleteGoldenSet(id);
      setSets(sets.filter((s) => s._id !== id));
      if (selectedSet?._id === id) setSelectedSet(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleViewDetails = async (id: string) => {
    try {
      const full = await getGoldenSet(id);
      setSelectedSet(full);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load details");
    }
  };

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Golden Sets</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 whitespace-pre-wrap">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-500 hover:text-red-700"
            >
              Dismiss
            </button>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
            {success}
            <button
              onClick={() => setSuccess(null)}
              className="ml-2 text-green-500 hover:text-green-700"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload panel */}
          {isAdmin && (
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                Upload New Golden Set
              </h2>
              <FileUpload onUpload={handleUpload} isUploading={isUploading} />
            </div>
          </div>
          )}

          {/* List */}
          <div className={isAdmin ? "lg:col-span-2" : "lg:col-span-3"}>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : sets.length === 0 ? (
              <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
                No golden sets uploaded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {sets.map((set) => (
                  <div
                    key={set._id}
                    className="bg-white rounded-lg border p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {set.name}
                      </h3>
                      {set.description && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {set.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {set.entryCount} questions &middot;{" "}
                        {set.sourceFormat.toUpperCase()} &middot;{" "}
                        {new Date(set.createdAt).toLocaleDateString()}
                        {(set as any).languages?.length > 0 && (
                          <span>
                            {" "}&middot; {(set as any).languages.map((l: string) => l.toUpperCase()).join(", ")}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleViewDetails(set._id)}
                        className="text-xs text-blue-600 border border-blue-200 rounded px-3 py-1.5 hover:bg-blue-50 transition-colors"
                      >
                        Preview
                      </button>
                      {isAdmin && (
                      <button
                        onClick={() => handleDelete(set._id)}
                        className="text-xs text-red-600 border border-red-200 rounded px-3 py-1.5 hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Upload preview modal with row selection */}
        {previewEntries && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[85vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Preview: {previewName}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {previewSelected.size} of {previewEntries.length} entries selected
                    {previewLangs.length > 0 && (
                      <span>
                        {" "}&middot; Languages: {previewLangs.map((l) => l.toUpperCase()).join(", ")}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setPreviewEntries(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  &times;
                </button>
              </div>
              <div className="overflow-auto flex-1 p-4">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">
                        <input
                          type="checkbox"
                          checked={previewSelected.size === previewEntries.length}
                          onChange={togglePreviewAll}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500">#</th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500">Question</th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500">Expected Answer</th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500">Lang</th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500">Category</th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500">Topic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewEntries.map((entry, i) => {
                      const isRtl = isRtlLanguage(entry.language);
                      const checked = previewSelected.has(i);
                      return (
                        <tr
                          key={i}
                          className={`border-b border-gray-100 hover:bg-gray-50 ${
                            !checked ? "opacity-40" : ""
                          }`}
                        >
                          <td className="py-2 px-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePreviewEntry(i)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="py-2 px-2 text-gray-400">{i + 1}</td>
                          <td
                            className="py-2 px-2 max-w-xs truncate"
                            dir={isRtl ? "rtl" : "ltr"}
                            title={entry.question}
                          >
                            {entry.question}
                          </td>
                          <td
                            className="py-2 px-2 max-w-xs text-gray-600 truncate"
                            dir={isRtl ? "rtl" : "ltr"}
                            title={entry.expectedAnswer}
                          >
                            {entry.expectedAnswer.length > 80
                              ? entry.expectedAnswer.substring(0, 80) + "..."
                              : entry.expectedAnswer}
                          </td>
                          <td className="py-2 px-2 uppercase text-gray-500">
                            {entry.language}
                          </td>
                          <td className="py-2 px-2 text-gray-500">
                            {entry.category || "-"}
                          </td>
                          <td className="py-2 px-2 text-gray-500">
                            {entry.topic || "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-6 py-3 border-t bg-gray-50">
                <span className="text-sm text-gray-500">
                  {previewSelected.size} entries will be saved
                </span>
                <div className="flex gap-3">
                  <button
                    onClick={() => setPreviewEntries(null)}
                    className="text-sm text-gray-600 border border-gray-300 rounded-md px-4 py-2 hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveSelected}
                    disabled={isSaving || previewSelected.size === 0}
                    className="text-sm text-white bg-blue-600 rounded-md px-4 py-2 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSaving
                      ? "Saving..."
                      : `Save ${previewSelected.size} Selected`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Existing set preview modal */}
        {selectedSet && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedSet.name}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {selectedSet.entries.length} entries
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSet(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  &times;
                </button>
              </div>
              <div className="overflow-auto flex-1 p-4">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 text-xs text-gray-500">#</th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500">Question</th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500">Expected Answer</th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500">Lang</th>
                      <th className="text-left py-2 px-2 text-xs text-gray-500">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSet.entries.map((entry, i) => {
                      const isRtl = isRtlLanguage(entry.language);
                      return (
                        <tr
                          key={i}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-2 px-2 text-gray-400">{i + 1}</td>
                          <td
                            className="py-2 px-2 max-w-xs"
                            dir={isRtl ? "rtl" : "ltr"}
                          >
                            {entry.question}
                          </td>
                          <td
                            className="py-2 px-2 max-w-xs text-gray-600"
                            dir={isRtl ? "rtl" : "ltr"}
                          >
                            {entry.expectedAnswer.length > 100
                              ? entry.expectedAnswer.substring(0, 100) + "..."
                              : entry.expectedAnswer}
                          </td>
                          <td className="py-2 px-2 uppercase text-gray-500">
                            {entry.language}
                          </td>
                          <td className="py-2 px-2 text-gray-500">
                            {entry.category || "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
    </ProtectedRoute>
  );
}

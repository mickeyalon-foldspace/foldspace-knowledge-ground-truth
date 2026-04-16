"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import {
  getAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  testAgentAuth,
} from "@/lib/api";
import type { AgentData, AgentFormData } from "@/lib/api";

const EMPTY_FORM: AgentFormData = {
  name: "",
  url: "https://app.foldspace.ai/",
  apiBaseUrl: "https://app.foldspace.ai/agent/.../playground",
  backendUrl: "https://app-be.foldspace.ai",
  username: "",
  password: "",
};

export default function AgentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<AgentFormData>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    success: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchAgents = async () => {
    try {
      const data = await getAgents();
      setAgents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleSave = async () => {
    if (!form.name || !form.url || !form.username || !form.password) {
      setError("All fields are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateAgent(editingId, form);
      } else {
        await createAgent(form);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      await fetchAgents();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save agent");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (agent: AgentData) => {
    setForm({
      name: agent.name,
      url: agent.url,
      apiBaseUrl: agent.apiBaseUrl,
      backendUrl: agent.backendUrl || "",
      username: agent.username,
      password: "",
    });
    setEditingId(agent._id);
    setShowForm(true);
    setTestResult(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this agent configuration?")) return;
    try {
      await deleteAgent(id);
      await fetchAgents();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete agent");
    }
  };

  const handleTestAuth = async (id: string) => {
    setTesting(id);
    setTestResult(null);
    try {
      const result = await testAgentAuth(id);
      setTestResult({ id, ...result });
    } catch (e) {
      setTestResult({
        id,
        success: false,
        message: e instanceof Error ? e.message : "Test failed",
      });
    } finally {
      setTesting(null);
    }
  };

  const handleCancel = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setError(null);
  };

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          {!showForm && isAdmin && (
            <button
              onClick={() => {
                setForm(EMPTY_FORM);
                setEditingId(null);
                setShowForm(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              Add Agent
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-500 hover:text-red-700"
            >
              Dismiss
            </button>
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-lg border p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              {editingId ? "Edit Agent" : "New Agent"}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Production PSR Copilot"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  App URL
                </label>
                <input
                  type="text"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://app.foldspace.ai/"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Playground URL
                  <span className="text-gray-400 font-normal ml-1">(navigated to after login)</span>
                </label>
                <input
                  type="text"
                  value={form.apiBaseUrl}
                  onChange={(e) =>
                    setForm({ ...form, apiBaseUrl: e.target.value })
                  }
                  placeholder="https://dev.app.foldspace.ai/agent/.../playground"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Backend API URL
                  <span className="text-gray-400 font-normal ml-1">(for fetching articles)</span>
                </label>
                <input
                  type="text"
                  value={form.backendUrl || ""}
                  onChange={(e) =>
                    setForm({ ...form, backendUrl: e.target.value })
                  }
                  placeholder="https://dev.app-be.foldspace.ai"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Username (Email)
                </label>
                <input
                  type="email"
                  value={form.username}
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                  placeholder="user@example.com"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder={editingId ? "(leave blank to keep)" : ""}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : agents.length === 0 && !showForm ? (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
            No agents configured yet. Add one to start running evaluations.
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <div
                key={agent._id}
                className="bg-white rounded-lg border p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {agent.name}
                    </h3>
                    <div className="mt-1 text-xs text-gray-500 space-y-0.5">
                      <p>
                        <span className="text-gray-400">Login:</span> {agent.url}
                      </p>
                      <p>
                        <span className="text-gray-400">Playground:</span>{" "}
                        {agent.apiBaseUrl}
                      </p>
                      {agent.backendUrl && (
                        <p>
                          <span className="text-gray-400">Backend:</span>{" "}
                          {agent.backendUrl}
                        </p>
                      )}
                      <p>
                        <span className="text-gray-400">User:</span>{" "}
                        {agent.username}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                  <div className="flex gap-2 ml-4 shrink-0">
                    <button
                      onClick={() => handleTestAuth(agent._id)}
                      disabled={testing === agent._id}
                      className="text-xs text-green-600 border border-green-200 rounded px-3 py-1.5 hover:bg-green-50 disabled:opacity-50 transition-colors"
                    >
                      {testing === agent._id ? "Testing..." : "Test Auth"}
                    </button>
                    <button
                      onClick={() => handleEdit(agent)}
                      className="text-xs text-blue-600 border border-blue-200 rounded px-3 py-1.5 hover:bg-blue-50 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(agent._id)}
                      className="text-xs text-red-600 border border-red-200 rounded px-3 py-1.5 hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                  )}
                </div>
                {testResult && testResult.id === agent._id && (
                  <div
                    className={`mt-3 p-2 rounded text-xs ${
                      testResult.success
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {testResult.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
    </ProtectedRoute>
  );
}

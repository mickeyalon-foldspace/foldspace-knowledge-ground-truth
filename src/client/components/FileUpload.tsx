"use client";

import { useState, useCallback } from "react";

interface FileUploadProps {
  onUpload: (file: File, name: string, description: string) => Promise<void>;
  isUploading: boolean;
}

export default function FileUpload({ onUpload, isUploading }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    }
  }, [name]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    await onUpload(selectedFile, name, description);
    setSelectedFile(null);
    setName("");
    setDescription("");
  };

  const [showSchema, setShowSchema] = useState(false);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          dragActive
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".csv,.json,.xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
        />
        {selectedFile ? (
          <div>
            <p className="text-sm font-medium text-gray-900">
              {selectedFile.name}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
        ) : (
          <div>
            <svg
              className="mx-auto h-10 w-10 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="mt-2 text-sm text-gray-600">
              Drop a CSV, JSON, or XLSX file here, or click to browse
            </p>
          </div>
        )}
      </div>

      {/* Expected columns reference */}
      <div className="text-xs text-gray-500">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowSchema(!showSchema); }}
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          {showSchema ? "Hide" : "Show"} expected column format
        </button>
        {showSchema && (
          <div className="mt-2 bg-gray-50 border border-gray-200 rounded-md p-3 space-y-3">
            <div>
              <p className="font-semibold text-gray-700 mb-1">
                Option A &mdash; Flat format (one row per question)
              </p>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-1 pr-2 text-gray-500">Column</th>
                    <th className="py-1 text-gray-500">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { col: "question", req: true, note: "or: q, query, input, user_question" },
                    { col: "expected_answer", req: true, note: "or: answer, gold_answer" },
                    { col: "language", req: true, note: "ISO code: en, de, he, pt-br ..." },
                    { col: "category", req: false, note: "product / module grouping" },
                    { col: "topic", req: false, note: "feature / view / domain" },
                  ].map((r) => (
                    <tr key={r.col} className="border-b border-gray-100">
                      <td className="py-1 pr-2">
                        <code className="bg-gray-100 px-1 rounded text-gray-800">{r.col}</code>
                        <span className="text-gray-400 ml-1">{r.note}</span>
                      </td>
                      <td className="py-1">{r.req ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1">
                Option B &mdash; Pivoted multi-language format
              </p>
              <p className="text-gray-500 mb-1">
                Each row has shared metadata + Q&A column pairs per language:
              </p>
              <div className="overflow-x-auto">
                <table className="text-left whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-gray-200">
                      {["Product", "View", "User Question (EN)", "Backend Prompt (EN)", "User Question (DE)", "Backend Prompt (DE)", "..."].map((h) => (
                        <th key={h} className="py-1 pr-3">
                          <code className="bg-gray-100 px-1 rounded text-gray-800">{h}</code>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {["Gantt", "Filters", "How do I filter?", "Use the filter panel...", "Wie filtere ich?", "Verwenden Sie das Filterpanel...", "..."].map((v, i) => (
                        <td key={i} className="py-1 pr-3 text-gray-400 italic">{v}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-gray-400 mt-1">
                Language codes in parentheses: EN, DE, IT, HE, ES-ES, PT-BR, etc.
              </p>
            </div>

            <p className="text-gray-400 italic">
              Column names are flexible &mdash; AI will auto-detect the mapping if standard patterns aren&apos;t recognized.
            </p>
          </div>
        )}
      </div>

      {selectedFile && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Golden set name"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Brief description"
            />
          </div>
          <button
            type="submit"
            disabled={isUploading}
            className="w-full bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isUploading ? "Uploading..." : "Upload Golden Set"}
          </button>
        </>
      )}
    </form>
  );
}

"use client";

import { useState } from "react";
import type { SearchKnowledge } from "@/lib/api";

interface ArticlesPanelProps {
  searchKnowledge?: SearchKnowledge;
}

export default function ArticlesPanel({ searchKnowledge }: ArticlesPanelProps) {
  const [expandedChunk, setExpandedChunk] = useState<number | null>(null);

  if (!searchKnowledge || searchKnowledge.chunks.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        No knowledge chunks retrieved.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {searchKnowledge.queries.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">
            Search Queries
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {searchKnowledge.queries.map((q, i) => (
              <span
                key={i}
                className="inline-block text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5"
              >
                {q}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium text-gray-700">
          Retrieved Chunks ({searchKnowledge.chunks.length})
        </h4>
        <div className="mt-1 space-y-1.5">
          {searchKnowledge.chunks.map((chunk, idx) => (
            <div
              key={chunk.chunkId || idx}
              className="border border-gray-200 rounded-md overflow-hidden"
            >
              <button
                onClick={() =>
                  setExpandedChunk(expandedChunk === idx ? null : idx)
                }
                className="w-full flex items-center justify-between px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-gray-900 truncate">
                    {chunk.title}
                  </span>
                  {chunk.score != null && (
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {(chunk.score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {chunk.url && (
                    <a
                      href={chunk.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Article ↗
                    </a>
                  )}
                  <span className="text-xs text-gray-400">
                    {expandedChunk === idx ? "−" : "+"}
                  </span>
                </div>
              </button>
              {expandedChunk === idx && (
                <div className="px-3 py-2 bg-white text-xs text-gray-700 border-t border-gray-100">
                  {chunk.url && (
                    <a
                      href={chunk.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-blue-600 hover:underline mb-2 break-all"
                    >
                      {chunk.url}
                    </a>
                  )}
                  <div className="whitespace-pre-wrap max-h-64 overflow-auto">
                    {chunk.content}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { SearchKnowledge } from "@/lib/api";

interface ArticlesPanelProps {
  searchKnowledge?: SearchKnowledge;
}

interface ArticleGroup {
  title: string;
  url?: string;
  chunks: Array<{ chunkId: string; content: string; score?: number }>;
}

function groupByArticle(searchKnowledge: SearchKnowledge): ArticleGroup[] {
  const map = new Map<string, ArticleGroup>();
  for (const chunk of searchKnowledge.chunks) {
    const key = chunk.title || "Untitled";
    const existing = map.get(key);
    if (existing) {
      existing.chunks.push({
        chunkId: chunk.chunkId,
        content: chunk.content,
        score: chunk.score,
      });
      if (!existing.url && chunk.url) existing.url = chunk.url;
    } else {
      map.set(key, {
        title: key,
        url: chunk.url,
        chunks: [{ chunkId: chunk.chunkId, content: chunk.content, score: chunk.score }],
      });
    }
  }
  return Array.from(map.values());
}

export default function ArticlesPanel({ searchKnowledge }: ArticlesPanelProps) {
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  if (!searchKnowledge || searchKnowledge.chunks.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        No knowledge chunks retrieved.
      </p>
    );
  }

  const articles = groupByArticle(searchKnowledge);

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
          Retrieved Articles ({articles.length})
          <span className="text-xs text-gray-400 font-normal ml-1">
            · {searchKnowledge.chunks.length} chunks
          </span>
        </h4>
        <div className="mt-1 space-y-1.5">
          {articles.map((article) => {
            const isOpen = expandedArticle === article.title;
            return (
              <div
                key={article.title}
                className="border border-gray-200 rounded-md overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedArticle(isOpen ? null : article.title)
                  }
                  className="w-full flex items-center justify-between px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-gray-900 truncate">
                      {article.title}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {article.chunks.length} chunk{article.chunks.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {article.url && (
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Open ↗
                      </a>
                    )}
                    <span className="text-xs text-gray-400">
                      {isOpen ? "−" : "+"}
                    </span>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100">
                    {article.url && (
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-blue-600 hover:underline px-3 py-1.5 break-all bg-blue-50/30"
                      >
                        {article.url}
                      </a>
                    )}
                    {article.chunks.map((chunk, ci) => (
                      <div
                        key={chunk.chunkId || ci}
                        className="px-3 py-2 bg-white text-xs text-gray-700 border-t border-gray-50"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-medium text-gray-400 uppercase">
                            Chunk {ci + 1}
                          </span>
                          {chunk.score != null && (
                            <span className="text-[10px] text-gray-400">
                              {(chunk.score * 100).toFixed(0)}% match
                            </span>
                          )}
                        </div>
                        <div className="whitespace-pre-wrap max-h-48 overflow-auto">
                          {chunk.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

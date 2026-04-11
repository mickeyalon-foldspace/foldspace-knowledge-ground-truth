"use client";

import { useState } from "react";
import type { RetrievedArticle } from "@/lib/api";

interface ArticlesPanelProps {
  articles: RetrievedArticle[];
}

export default function ArticlesPanel({ articles }: ArticlesPanelProps) {
  const [expandedArticle, setExpandedArticle] = useState<number | null>(null);

  if (articles.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        No knowledge articles retrieved.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-700">
        Retrieved Articles ({articles.length})
      </h4>
      {articles.map((article, idx) => (
        <div
          key={idx}
          className="border border-gray-200 rounded-md overflow-hidden"
        >
          <button
            onClick={() =>
              setExpandedArticle(expandedArticle === idx ? null : idx)
            }
            className="w-full flex items-center justify-between px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="font-medium text-gray-900">{article.title}</span>
            <span className="text-xs text-gray-500">
              {article.chunkCount} chunk{article.chunkCount !== 1 ? "s" : ""}
              <span className="ml-2">{expandedArticle === idx ? "−" : "+"}</span>
            </span>
          </button>
          {expandedArticle === idx && (
            <div className="px-3 py-2 space-y-2 bg-white">
              {article.chunks.map((chunk, cIdx) => (
                <div
                  key={cIdx}
                  className="text-xs text-gray-700 bg-gray-50 rounded p-2 border border-gray-100"
                >
                  <div className="font-medium text-gray-500 mb-1">
                    Chunk {cIdx + 1}
                  </div>
                  <div className="whitespace-pre-wrap">{chunk.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

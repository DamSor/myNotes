import { Sparkles } from "lucide-react";
import type { AiContentWithTag } from "@/types";

interface DigestListProps {
  initialDigests: AiContentWithTag[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DigestList({ initialDigests }: DigestListProps) {
  if (initialDigests.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/10 p-8 text-center backdrop-blur-xl">
        <Sparkles className="mx-auto mb-3 size-8 text-purple-300/60" />
        <p className="text-sm text-blue-100/60">
          No digests yet. Select a tag on your{" "}
          <a href="/notes" className="text-purple-300 underline hover:text-purple-200">
            notes
          </a>{" "}
          and click &quot;Generate digest&quot; to get started.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {initialDigests.map((digest) => (
        <li key={digest.id} className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-2">
            {digest.tag_name && (
              <span className="inline-flex items-center rounded-full border border-purple-400/50 bg-purple-500/20 px-2.5 py-0.5 text-xs font-medium text-purple-200">
                {digest.tag_name}
              </span>
            )}
            <span className="text-xs text-blue-100/50">{formatDate(digest.created_at)}</span>
          </div>
          <div className="prose-invert prose-sm max-w-none text-sm leading-relaxed whitespace-pre-wrap text-blue-100/80">
            {digest.body}
          </div>
        </li>
      ))}
    </ul>
  );
}

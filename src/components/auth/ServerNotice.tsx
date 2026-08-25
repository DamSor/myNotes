import { TriangleAlert } from "lucide-react";

interface ServerNoticeProps {
  message?: string | null;
}

// Non-error advisory (e.g. partial success). Sibling to ServerError so downstream
// slices reuse one styled notice instead of re-inlining amber markup.
export function ServerNotice({ message }: ServerNoticeProps) {
  if (!message) return null;

  return (
    <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
      <TriangleAlert className="size-4 shrink-0" />
      {message}
    </p>
  );
}

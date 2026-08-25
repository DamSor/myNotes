import type { NoteWithTags } from "@/types";

// Single rendering path for every note row (existing + newly prepended), so the
// date-first-line / content / tag-chip markup can never diverge (F1). The creation date
// leads each item (FR-005).
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function NoteItem({ note }: { note: NoteWithTags }) {
  return (
    <li className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-medium text-blue-100/50">{formatDate(note.created_at)}</p>
      <p className="mt-1 whitespace-pre-wrap text-white">{note.content}</p>
      {note.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {note.tags.map((tag) => (
            <li
              key={tag.id}
              className="rounded-full border border-purple-400/40 bg-purple-500/20 px-2 py-0.5 text-xs text-purple-100"
            >
              {tag.name}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

import { useMemo, useState } from "react";
import { Loader2, NotebookPen, Search, Sparkles, X } from "lucide-react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { ServerNotice } from "@/components/auth/ServerNotice";
import { TagInput } from "@/components/notes/TagInput";
import { NoteItem } from "@/components/notes/NoteItem";
import { useNotes } from "@/components/hooks/useNotes";
import { cn } from "@/lib/utils";
import type { NoteWithTags, Tag } from "@/types";

interface NoteCaptureProps {
  initialNotes: NoteWithTags[];
  initialTags: Tag[];
}

// Owns the entire notes UI (F1): the capture form (plain-text + tag typeahead) and the
// flat newest-first list. Existing and newly prepended notes render through the same
// NoteItem so their markup can never diverge. Save awaits the server-returned row, then
// prepends it (via useNotes) for a truthful, refetch-free update.
export default function NoteCapture({ initialNotes, initialTags }: NoteCaptureProps) {
  const { notes, tags, createNote, updateNote, deleteNote } = useNotes(initialNotes, initialTags);
  const [content, setContent] = useState("");
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);

  const sortedTags = useMemo(() => [...tags].sort((a, b) => a.name.localeCompare(b.name)), [tags]);

  const filteredNotes = useMemo(() => {
    let result = notes;
    if (activeTagId) {
      result = result.filter((note) => note.tags.some((tag) => tag.id === activeTagId));
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((note) => note.content.toLowerCase().includes(query));
    }
    return result;
  }, [notes, activeTagId, searchQuery]);

  const canSubmit = content.trim().length > 0;

  async function handleGenerateDigest() {
    if (!activeTagId) return;
    setDigestError(null);
    setDigestLoading(true);
    try {
      const res = await fetch("/api/digests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: activeTagId }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setDigestError(body.error ?? "Failed to generate digest");
        return;
      }
      window.location.href = "/ai";
    } catch (_e) {
      setDigestError("Failed to generate digest. Please try again.");
    } finally {
      setDigestLoading(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    setWarning(null);
    if (!canSubmit) return;

    try {
      const result = await createNote(content.trim(), tagNames);
      setContent("");
      setTagNames([]);
      setActiveTagId(null);
      setSearchQuery("");
      if (!result.tagsAttached) {
        // Note-first partial success (Guardrail #2): the note is saved, tags aren't.
        setWarning("Note saved, but its tags couldn't be attached. You can add them again.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save note");
    }
  }

  return (
    <div className="space-y-6">
      <form
        action={handleSubmit}
        className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl"
      >
        <div>
          <label htmlFor="note-content" className="mb-1 block text-sm text-blue-100/80">
            New note
          </label>
          <textarea
            id="note-content"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
            }}
            placeholder="Write a plain-text note..."
            rows={4}
            className="w-full resize-y rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
          />
        </div>

        <TagInput available={tags} selected={tagNames} onChange={setTagNames} />

        <ServerError message={error} />
        <ServerNotice message={warning} />

        <SubmitButton pendingText="Saving..." icon={<NotebookPen className="size-4" />} disabled={!canSubmit}>
          Save note
        </SubmitButton>
      </form>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
          }}
          placeholder="Search notes..."
          className="w-full rounded-lg border border-white/20 bg-white/10 py-2 pr-9 pl-9 text-white placeholder-white/40 transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
            }}
            aria-label="Clear search"
            className="absolute top-1/2 right-3 -translate-y-1/2 text-white/40 hover:text-white"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTagId(null);
                setDigestError(null);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activeTagId === null
                  ? "border-purple-400 bg-purple-500/30 text-white"
                  : "border-white/20 bg-white/5 text-blue-100/70 hover:bg-white/10 hover:text-white",
              )}
            >
              All
            </button>
            {sortedTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => {
                  setActiveTagId(tag.id);
                  setDigestError(null);
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  activeTagId === tag.id
                    ? "border-purple-400 bg-purple-500/30 text-white"
                    : "border-white/20 bg-white/5 text-blue-100/70 hover:bg-white/10 hover:text-white",
                )}
              >
                {tag.name}
                {activeTagId === tag.id && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Clear ${tag.name} filter`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTagId(null);
                      setDigestError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        setActiveTagId(null);
                        setDigestError(null);
                      }
                    }}
                    className="ml-0.5 inline-flex items-center"
                  >
                    <X className="size-3" />
                  </span>
                )}
              </button>
            ))}
            {activeTagId && (
              <button
                type="button"
                onClick={() => void handleGenerateDigest()}
                disabled={digestLoading}
                className={cn(
                  "ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  "border-emerald-400/50 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30",
                  digestLoading && "cursor-not-allowed opacity-60",
                )}
              >
                {digestLoading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                {digestLoading ? "Generating..." : "Generate digest"}
              </button>
            )}
          </div>
          {digestError && (
            <div className="flex items-center gap-2 text-xs text-red-300">
              <span>{digestError}</span>
              <button
                type="button"
                onClick={() => void handleGenerateDigest()}
                className="underline hover:text-red-200"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-center text-sm text-blue-100/50">No notes yet. Write your first one above.</p>
      ) : filteredNotes.length === 0 ? (
        <p className="text-center text-sm text-blue-100/50">
          {searchQuery ? "No notes matching your search." : "No notes with this tag."}
        </p>
      ) : (
        <ul className="space-y-3">
          {filteredNotes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              availableTags={tags}
              onUpdate={updateNote}
              onDelete={deleteNote}
              onTagClick={setActiveTagId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

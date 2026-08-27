import { useMemo, useState } from "react";
import { NotebookPen, X } from "lucide-react";
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

  const sortedTags = useMemo(() => [...tags].sort((a, b) => a.name.localeCompare(b.name)), [tags]);

  const filteredNotes = useMemo(
    () => (activeTagId ? notes.filter((note) => note.tags.some((tag) => tag.id === activeTagId)) : notes),
    [notes, activeTagId],
  );

  const canSubmit = content.trim().length > 0;

  async function handleSubmit() {
    setError(null);
    setWarning(null);
    if (!canSubmit) return;

    try {
      const result = await createNote(content.trim(), tagNames);
      setContent("");
      setTagNames([]);
      setActiveTagId(null);
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

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTagId(null);
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
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      setActiveTagId(null);
                    }
                  }}
                  className="ml-0.5 inline-flex items-center"
                >
                  <X className="size-3" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-center text-sm text-blue-100/50">No notes yet. Write your first one above.</p>
      ) : filteredNotes.length === 0 ? (
        <p className="text-center text-sm text-blue-100/50">No notes with this tag.</p>
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

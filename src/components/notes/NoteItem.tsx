import { useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ServerError } from "@/components/auth/ServerError";
import { ServerNotice } from "@/components/auth/ServerNotice";
import { TagInput } from "@/components/notes/TagInput";
import { cn, formatDate } from "@/lib/utils";
import type { NoteWithTags, Tag, UpdateNoteDTO, UpdateNoteResponse } from "@/types";

interface NoteItemProps {
  note: NoteWithTags;
  availableTags: Tag[];
  onUpdate: (noteId: string, patch: UpdateNoteDTO) => Promise<UpdateNoteResponse>;
  onDelete: (noteId: string) => Promise<void>;
  onTagClick?: (tagId: string) => void;
}

function sameTagNames(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const aLower = a.map((name) => name.toLowerCase()).sort();
  const bLower = b.map((name) => name.toLowerCase()).sort();
  return aLower.every((name, i) => name === bLower[i]);
}

export function NoteItem({ note, availableTags, onUpdate, onDelete, onTagClick }: NoteItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(note.content);
  const [draftTagNames, setDraftTagNames] = useState(note.tags.map((tag) => tag.name));
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const savingRef = useRef(false);
  const deletingRef = useRef(false);

  const canSave = draftContent.trim().length > 0;

  function enterEdit() {
    setDraftContent(note.content);
    setDraftTagNames(note.tags.map((tag) => tag.name));
    setError(null);
    setWarning(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setDraftContent(note.content);
    setDraftTagNames(note.tags.map((tag) => tag.name));
    setError(null);
    setIsEditing(false);
  }

  async function handleSave() {
    if (savingRef.current) return;
    setError(null);
    setWarning(null);
    if (!canSave) return;

    const content = draftContent.trim();
    const originalNames = note.tags.map((tag) => tag.name);
    const patch: UpdateNoteDTO = {};
    if (content !== note.content) patch.content = content;
    if (!sameTagNames(draftTagNames, originalNames)) patch.tagNames = draftTagNames;

    if (Object.keys(patch).length === 0) {
      setIsEditing(false);
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    try {
      const result = await onUpdate(note.id, patch);
      setIsEditing(false);
      if (!result.tagsAttached) {
        setWarning("Note saved, but its tags couldn't be attached. You can add them again.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update note");
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setError(null);
    setIsDeleting(true);
    try {
      await onDelete(note.id);
      setDeleteOpen(false);
    } catch (e) {
      setDeleteOpen(false);
      setError(e instanceof Error ? e.message : "Failed to delete note");
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  }

  return (
    <li className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-blue-100/50">{formatDate(note.created_at)}</p>
        {!isEditing && (
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Edit note"
              className="size-8 text-blue-100/70 hover:bg-white/10 hover:text-white"
              onClick={enterEdit}
            >
              <Pencil className="size-4" />
            </Button>
            <AlertDialog
              open={deleteOpen}
              onOpenChange={(open) => {
                if (!isDeleting) setDeleteOpen(open);
              }}
            >
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Delete note"
                  className="size-8 text-red-300/80 hover:bg-red-900/30 hover:text-red-200"
                >
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                  <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={isDeleting}
                    onClick={(e) => {
                      e.preventDefault();
                      void handleConfirmDelete();
                    }}
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {isEditing ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <textarea
            value={draftContent}
            onChange={(e) => {
              setDraftContent(e.target.value);
            }}
            rows={4}
            aria-label="Note content"
            className="w-full resize-y rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
          />
          <TagInput
            id={`edit-tags-${note.id}`}
            available={availableTags}
            selected={draftTagNames}
            onChange={setDraftTagNames}
          />
          <ServerError message={error} />
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={!canSave || isSaving}
              className="bg-purple-600 text-white hover:bg-purple-500"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving}
              className="text-blue-100/80 hover:bg-white/10 hover:text-white"
              onClick={cancelEdit}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="mt-1 whitespace-pre-wrap text-white">{note.content}</p>
          {note.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {note.tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={
                    onTagClick
                      ? () => {
                          onTagClick(tag.id);
                        }
                      : undefined
                  }
                  className={cn(
                    "rounded-full border border-purple-400/40 bg-purple-500/20 px-2 py-0.5 text-xs text-purple-100",
                    onTagClick && "cursor-pointer hover:border-purple-400/60 hover:bg-purple-500/30",
                  )}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 space-y-2 empty:mt-0">
            <ServerError message={error} />
            <ServerNotice message={warning} />
          </div>
        </>
      )}
    </li>
  );
}

import { useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Pencil, Trash2 } from "lucide-react";
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
import { cn, formatDate } from "@/lib/utils";
import type { AiContentWithTag } from "@/types";

interface DigestItemProps {
  digest: AiContentWithTag;
  onUpdate: (id: string, body: string) => Promise<AiContentWithTag>;
  onDelete: (id: string) => Promise<void>;
}

export function DigestItem({ digest, onUpdate, onDelete }: DigestItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(digest.body);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const savingRef = useRef(false);
  const deletingRef = useRef(false);

  const canSave = draftBody.trim().length > 0;
  const isEdited = digest.updated_at > digest.created_at;
  const isWeekly = digest.kind === "weekly";
  const isFailed = digest.kind === "weekly-failed";
  const isEditable = !isFailed;

  function enterEdit() {
    setDraftBody(digest.body);
    setError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setDraftBody(digest.body);
    setError(null);
    setIsEditing(false);
  }

  async function handleSave() {
    if (savingRef.current) return;
    setError(null);
    if (!canSave) return;

    const body = draftBody.trim();
    if (body === digest.body) {
      setIsEditing(false);
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    try {
      await onUpdate(digest.id, body);
      setIsEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update digest");
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
      await onDelete(digest.id);
      setDeleteOpen(false);
    } catch (e) {
      setDeleteOpen(false);
      setError(e instanceof Error ? e.message : "Failed to delete digest");
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  }

  return (
    <li
      className={cn(
        "rounded-2xl border p-5 backdrop-blur-xl",
        isFailed ? "border-amber-400/40 bg-amber-900/10" : "border-white/10 bg-white/10",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {isFailed && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-200">
              <AlertTriangle className="size-3" />
              Weekly
            </span>
          )}
          {isWeekly && (
            <span className="inline-flex items-center gap-1 rounded-full border border-teal-400/50 bg-teal-500/20 px-2.5 py-0.5 text-xs font-medium text-teal-200">
              <CalendarDays className="size-3" />
              Weekly
            </span>
          )}
          {digest.tag_name && (
            <span className="inline-flex items-center rounded-full border border-purple-400/50 bg-purple-500/20 px-2.5 py-0.5 text-xs font-medium text-purple-200">
              {digest.tag_name}
            </span>
          )}
          <span className="text-xs text-blue-100/50">{formatDate(digest.created_at)}</span>
          {isEdited && <span className="text-xs font-medium text-purple-300/80">edited</span>}
        </div>
        {!isEditing && (
          <div className="flex shrink-0 gap-1">
            {isEditable && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Edit digest"
                className="size-8 text-blue-100/70 hover:bg-white/10 hover:text-white"
                onClick={enterEdit}
              >
                <Pencil className="size-4" />
              </Button>
            )}
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
                  aria-label="Delete digest"
                  className="size-8 text-red-300/80 hover:bg-red-900/30 hover:text-red-200"
                >
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this digest?</AlertDialogTitle>
                  <AlertDialogDescription>This will remove the digest from your list.</AlertDialogDescription>
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
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <textarea
            value={draftBody}
            onChange={(e) => {
              setDraftBody(e.target.value);
            }}
            rows={8}
            aria-label="Digest body"
            className="w-full resize-y rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm leading-relaxed text-blue-100/80 placeholder-white/40 transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
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
          {/* Body is LLM-sourced — render as text only. Do NOT use dangerouslySetInnerHTML or an unsanitized markdown renderer. */}
          <div
            className={cn(
              "prose-invert prose-sm max-w-none text-sm leading-relaxed whitespace-pre-wrap",
              isFailed ? "text-amber-200/70" : "text-blue-100/80",
            )}
          >
            {digest.body}
          </div>
          <div className="mt-3 empty:mt-0">
            <ServerError message={error} />
          </div>
        </>
      )}
    </li>
  );
}

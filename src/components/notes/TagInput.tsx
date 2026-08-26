import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Tag as TagIcon, X } from "lucide-react";
import type { Tag } from "@/types";

interface TagInputProps {
  available: Tag[];
  selected: string[];
  onChange: (names: string[]) => void;
  id?: string;
}

// Chip + typeahead tag input. Suggestions are filtered in-memory from the user's own tags
// (zero per-keystroke latency); a name matching none can be created on the fly (FR-009).
// Selection is case-insensitively deduped so the same tag can't be added twice.
export function TagInput({ available, selected, onChange, id = "tag-input" }: TagInputProps) {
  const [input, setInput] = useState("");

  const query = input.trim().toLowerCase();
  const selectedLower = new Set(selected.map((name) => name.toLowerCase()));

  const suggestions = query
    ? available.filter((tag) => tag.name.toLowerCase().includes(query) && !selectedLower.has(tag.name.toLowerCase()))
    : [];

  const canCreateNew =
    query.length > 0 && !available.some((tag) => tag.name.toLowerCase() === query) && !selectedLower.has(query);

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed || selectedLower.has(trimmed.toLowerCase())) {
      setInput("");
      return;
    }
    onChange([...selected, trimmed]);
    setInput("");
  }

  function removeTag(name: string) {
    onChange(selected.filter((n) => n !== name));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // Prevent the surrounding form from submitting when the user is adding a tag.
      e.preventDefault();
      if (input.trim()) addTag(input);
    } else if (e.key === "Backspace" && input.length === 0 && selected.length > 0) {
      removeTag(selected[selected.length - 1]);
    }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-blue-100/80">
        Tags
      </label>

      {selected.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {selected.map((name) => (
            <li
              key={name}
              className="flex items-center gap-1 rounded-full border border-purple-400/40 bg-purple-500/20 px-2 py-0.5 text-sm text-purple-100"
            >
              {name}
              <button
                type="button"
                aria-label={`Remove tag ${name}`}
                onClick={() => {
                  removeTag(name);
                }}
                className="text-purple-200/70 hover:text-white"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
          <TagIcon className="size-4" />
        </span>
        <input
          id={id}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Add a tag and press Enter"
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 pl-10 text-white placeholder-white/40 transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
          autoComplete="off"
        />

        {(suggestions.length > 0 || canCreateNew) && (
          <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-white/20 bg-slate-900/95 py-1 backdrop-blur-xl">
            {suggestions.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() => {
                    addTag(tag.name);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-blue-100 hover:bg-white/10"
                >
                  {tag.name}
                </button>
              </li>
            ))}
            {canCreateNew && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    addTag(input);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-purple-200 hover:bg-white/10"
                >
                  Create &ldquo;{input.trim()}&rdquo;
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

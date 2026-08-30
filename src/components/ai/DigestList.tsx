import { Sparkles } from "lucide-react";
import { DigestItem } from "@/components/ai/DigestItem";
import { useDigests } from "@/components/hooks/useDigests";
import type { AiContentWithTag } from "@/types";

interface DigestListProps {
  initialDigests: AiContentWithTag[];
}

export default function DigestList({ initialDigests }: DigestListProps) {
  const { digests, updateDigest, deleteDigest } = useDigests(initialDigests);

  if (digests.length === 0) {
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
      {digests.map((digest) => (
        <DigestItem key={digest.id} digest={digest} onUpdate={updateDigest} onDelete={deleteDigest} />
      ))}
    </ul>
  );
}

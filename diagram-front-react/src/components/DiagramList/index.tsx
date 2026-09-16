import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDiagrams } from "@/hooks/useDiagrams";
import type { DiagramSummary } from "diagram-supabase-wrapper";

export const DiagramList = () => {
  const { list, load } = useDiagrams();
  const [open, setOpen] = useState(false);
  const [diagrams, setDiagrams] = useState<DiagramSummary[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setDiagrams(null);
    list().then(setDiagrams);
  }, [open, list]);

  const handleLoad = async (id: string) => {
    await load(id);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          My Diagrams
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>My Diagrams</DialogTitle>
        </DialogHeader>
        {diagrams === null && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {diagrams?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No saved diagrams yet.
          </p>
        )}
        {diagrams && diagrams.length > 0 && (
          <ul className="flex flex-col gap-1">
            {diagrams.map((diagram) => (
              <li key={diagram.id}>
                <button
                  type="button"
                  onClick={() => handleLoad(diagram.id)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span>{diagram.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(diagram.updatedAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};

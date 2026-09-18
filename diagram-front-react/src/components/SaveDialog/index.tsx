import { useState, type FormEvent } from "react";
import { Save, SaveAll } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDiagrams } from "@/hooks/useDiagrams";

type SaveDialogProps = {
  // when set, "Save" overwrites this diagram in place instead of opening
  // the name dialog - see STAGE_8.md's "Save vs Save As" decision
  currentDiagramId: string | null;
  // lets the caller (App) make this the active diagram right after saving,
  // e.g. so a "Copy Link" button has something to share immediately
  onSaved?: (id: string) => void;
};

export const SaveDialog = ({ currentDiagramId, onSaved }: SaveDialogProps) => {
  const { save, update } = useDiagrams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSaveInPlace = async () => {
    if (!currentDiagramId) return;
    setSaving(true);
    await update(currentDiagramId);
    setSaving(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const summary = await save(name);
    setSaving(false);
    if (summary) {
      setName("");
      setOpen(false);
      onSaved?.(summary.id);
    }
  };

  return (
    <div className="flex gap-1">
      {currentDiagramId && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Save"
          title="Save"
          disabled={saving}
          onClick={handleSaveInPlace}
        >
          <Save />
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={currentDiagramId ? "Save As" : "Save"}
            title={currentDiagramId ? "Save As" : "Save"}
          >
            {currentDiagramId ? <SaveAll /> : <Save />}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>
                {currentDiagramId ? "Save as new diagram" : "Save diagram"}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="diagram-name">Name</Label>
              <Input
                id="diagram-name"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

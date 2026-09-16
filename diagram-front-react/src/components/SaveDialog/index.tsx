import { useState, type FormEvent } from "react";
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
  // lets the caller (App) make this the active diagram right after saving,
  // e.g. so a "Copy Link" button has something to share immediately
  onSaved?: (id: string) => void;
};

export const SaveDialog = ({ onSaved }: SaveDialogProps) => {
  const { save } = useDiagrams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Save
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Save diagram</DialogTitle>
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
  );
};

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useDiagrams } from "@/hooks/useDiagrams";
import { useDiagramRealtime } from "@/hooks/useDiagramRealtime";
import { useDiagramAutosave } from "@/hooks/useDiagramAutosave";
import { AuthForm } from "@/components/AuthForm";
import { Canvas } from "@/components/Canvas";
import { SaveDialog } from "@/components/SaveDialog";
import { DiagramList } from "@/components/DiagramList";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { RemoteCursors } from "@/components/RemoteCursors";
import { Toolbar } from "@/components/Toolbar";
import { Button } from "@/components/ui/button";

export const App = () => {
  const { session, loading, signOut } = useAuth();
  const { load } = useDiagrams();
  // the app's one active-diagram concept: set by picking from "My Diagrams",
  // by saving a new diagram, or by opening a ?diagram=<id> shared link
  const [currentDiagramId, setCurrentDiagramId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("diagram")
  );
  const peers = useDiagramRealtime(currentDiagramId);
  useDiagramAutosave(currentDiagramId);

  // the single place a diagram actually gets fetched, keyed off the id -
  // covers both a shared link opened on load and picking one from the list
  useEffect(() => {
    if (!currentDiagramId) return;
    load(currentDiagramId);
  }, [currentDiagramId, load]);

  const handleCopyLink = async () => {
    if (!currentDiagramId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("diagram", currentDiagramId);
    await navigator.clipboard.writeText(url.toString());
    toast.success("Link copied");
  };

  // avoid flashing the sign-in form while the initial session check is in flight
  if (loading) return null;

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <AuthForm />
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas />
      <RemoteCursors peers={peers} />
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <Toolbar />
      </div>
      <div
        className="flex items-center gap-2"
        style={{ position: "absolute", top: 8, right: 8 }}
      >
        <PresenceIndicator users={peers} />
        <SaveDialog onSaved={setCurrentDiagramId} />
        <DiagramList onSelect={setCurrentDiagramId} />
        {currentDiagramId && (
          <Button variant="outline" size="sm" onClick={handleCopyLink}>
            Copy Link
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
};

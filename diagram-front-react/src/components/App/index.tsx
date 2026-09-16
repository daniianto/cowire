import { useAuth } from "@/hooks/useAuth";
import { AuthForm } from "@/components/AuthForm";
import { Canvas } from "@/components/Canvas";
import { KeyboardHint } from "@/components/KeyboardHint";
import { SaveDialog } from "@/components/SaveDialog";
import { DiagramList } from "@/components/DiagramList";
import { Button } from "@/components/ui/button";

export const App = () => {
  const { session, loading, signOut } = useAuth();

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
      <KeyboardHint />
      <div
        className="flex gap-2"
        style={{ position: "absolute", top: 8, right: 8 }}
      >
        <SaveDialog />
        <DiagramList />
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
};

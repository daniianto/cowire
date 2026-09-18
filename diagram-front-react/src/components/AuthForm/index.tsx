import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";

type Mode = "sign-in" | "sign-up";

export const AuthForm = () => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // set after a sign-up call that returned no session - email confirmation
  // is required before the account can actually sign in
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "sign-in") {
        await signIn(email, password);
      } else {
        const session = await signUp(email, password);
        if (!session) setConfirmationSent(true);
      }
    } catch (err) {
      // a rejected sign-in/sign-up is tied directly to this submit action,
      // so it renders as an inline block rather than a toast
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmationSent) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-lg font-medium">Check your email</h1>
        <Alert>
          <AlertDescription>
            We sent a confirmation link to {email}. Follow it to activate your
            account, then sign in.
          </AlertDescription>
        </Alert>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setConfirmationSent(false);
            setMode("sign-in");
          }}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-sm flex-col gap-4"
    >
      <h1 className="text-lg font-medium">
        {mode === "sign-in" ? "Sign in" : "Create an account"}
      </h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete={
            mode === "sign-in" ? "current-password" : "new-password"
          }
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={submitting}>
        {mode === "sign-in" ? "Sign in" : "Sign up"}
      </Button>

      <button
        type="button"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        onClick={() =>
          setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"))
        }
      >
        {mode === "sign-in"
          ? "Need an account? Sign up"
          : "Already have an account? Sign in"}
      </button>
    </form>
  );
};

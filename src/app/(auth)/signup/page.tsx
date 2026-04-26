"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
  }>({});

  function validate() {
    const next: typeof errors = {};
    if (!fullName.trim()) next.fullName = "שדה חובה";
    if (!email.trim()) next.email = "שדה חובה";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = "אימייל לא תקין";
    if (!password) next.password = "שדה חובה";
    else if (password.length < 8)
      next.password = "סיסמה קצרה מדי";
    return next;
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
        },
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("החשבון נוצר — בדוק את האימייל שלך לאישור.");
      router.push("/login?message=check-email");
    } catch {
      toast.error("משהו השתבש. נסה שוב.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-16 bg-[var(--color-background)]"
      dir="rtl"
    >
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        {/* Wordmark */}
        <div className="text-center mb-8">
          <span
            className="text-4xl font-medium tracking-[0.06em] text-[var(--color-accent)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            reelio
          </span>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            בואו נתחיל
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-7 shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_8px_32px_rgba(0,0,0,0.4)]">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <Input
              label="שם מלא"
              type="text"
              autoComplete="name"
              placeholder="ישראל ישראלי"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              error={errors.fullName}
              disabled={loading}
            />

            <Input
              label="אימייל"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              disabled={loading}
            />

            <Input
              label="סיסמה"
              type="password"
              autoComplete="new-password"
              placeholder="לפחות 8 תווים"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              disabled={loading}
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full mt-1"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  טוען...
                </>
              ) : (
                "הרשם"
              )}
            </Button>
          </form>
        </div>

        {/* Footer link */}
        <p className="text-center text-sm text-[var(--color-muted)] mt-6">
          כבר יש לך חשבון?{" "}
          <Link
            href="/login"
            className="text-[var(--color-foreground)] hover:text-[var(--color-accent)] transition-colors duration-150 underline underline-offset-2"
          >
            התחבר
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

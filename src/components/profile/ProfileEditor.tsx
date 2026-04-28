"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2, Upload } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

type ProfileFields = {
  full_name: string;
  headline: string;
  tagline: string;
  avatar_url: string;
  watermark_url: string;
  instagram_handle: string;
  tiktok_handle: string;
  youtube_handle: string;
};

type Props = {
  email: string;
  initial: ProfileFields;
  plan: string | null;
};

const FIELD_KEYS: (keyof ProfileFields)[] = [
  "full_name",
  "headline",
  "tagline",
  "avatar_url",
  "watermark_url",
  "instagram_handle",
  "tiktok_handle",
  "youtube_handle",
];

type SaveState = "idle" | "saving" | "saved" | "error";
const PROFILE_UPDATED_EVENT = "reelio:profile-updated";

async function uploadFile(file: File): Promise<string> {
  const presignRes = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });
  if (!presignRes.ok) throw new Error("presign failed");
  const { presignedUrl, publicUrl } = (await presignRes.json()) as {
    presignedUrl: string;
    publicUrl: string;
  };
  const putRes = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error("upload failed");
  return publicUrl;
}

export function ProfileEditor({ email, initial, plan }: Props) {
  const { t, dir } = useI18n();
  const router = useRouter();
  const [fields, setFields] = useState<ProfileFields>(initial);
  const [baseline, setBaseline] = useState<ProfileFields>(initial);
  const [save, setSave] = useState<SaveState>("idle");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [watermarkBusy, setWatermarkBusy] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);

  const isDirty = useMemo(
    () => FIELD_KEYS.some((k) => (fields[k] ?? "") !== (baseline[k] ?? "")),
    [fields, baseline],
  );

  const planLabel = !plan || plan === "free" ? t.profile.free : plan;
  const initialLetter = (fields.full_name || email || "?").charAt(0).toUpperCase();

  function update<K extends keyof ProfileFields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    if (save !== "idle") setSave("idle");
  }

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDirty || save === "saving") return;
    setSave("saving");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error("save failed");
      const json = (await res.json()) as { profile: Partial<ProfileFields> | null };
      const persisted: ProfileFields = {
        full_name: json.profile?.full_name ?? "",
        headline: json.profile?.headline ?? "",
        tagline: json.profile?.tagline ?? "",
        avatar_url: json.profile?.avatar_url ?? "",
        watermark_url: json.profile?.watermark_url ?? "",
        instagram_handle: json.profile?.instagram_handle ?? "",
        tiktok_handle: json.profile?.tiktok_handle ?? "",
        youtube_handle: json.profile?.youtube_handle ?? "",
      };
      setFields(persisted);
      setBaseline(persisted);
      window.dispatchEvent(
        new CustomEvent(PROFILE_UPDATED_EVENT, {
          detail: {
            profile: {
              full_name: persisted.full_name || null,
              avatar_url: persisted.avatar_url || null,
              email,
              plan,
            },
          },
        }),
      );
      setSave("saved");
      router.refresh();
    } catch {
      setSave("error");
    }
  }

  async function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
    target: "avatar_url" | "watermark_url",
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const setBusy = target === "avatar_url" ? setAvatarBusy : setWatermarkBusy;
    setBusy(true);
    try {
      const url = await uploadFile(file);
      update(target, url);
    } catch {
      setSave("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex flex-col profile-editor-form"
      style={{ width: "100%", gap: 18, color: "var(--fg-0)" }}
      dir={dir}
    >
      <style>{`
        .profile-editor-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
        }
        @media (max-width: 768px) {
          .profile-editor-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }
        }
        @media (max-width: 640px) {
          .profile-editor-watermark {
            flex-wrap: wrap;
          }
          .profile-editor-watermark > .meta {
            flex-basis: 100%;
            order: 3;
          }
        }
      `}</style>
      {/* Header card */}
      <div
        className="card"
        style={{
          padding: 24,
          display: "flex",
          gap: 18,
          alignItems: "center",
        }}
      >
        <AvatarSlot
          url={fields.avatar_url}
          letter={initialLetter}
          busy={avatarBusy}
          onPick={() => avatarInputRef.current?.click()}
          onClear={() => update("avatar_url", "")}
          uploadLabel={t.profile.upload}
          replaceLabel={t.profile.replace}
          removeLabel={t.profile.remove}
          uploadingLabel={t.profile.uploading}
        />
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleImageChange(e, "avatar_url")}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="kicker" style={{ marginBottom: 6 }}>
            {t.profile.memberLabel} · {t.profile.plan} · {planLabel}
          </div>
          <h1
            className="serif"
            style={{
              fontSize: 28,
              margin: 0,
              letterSpacing: "-0.02em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {fields.full_name || t.profile.memberLabel}
          </h1>
          <div
            style={{
              color: "var(--fg-3)",
              fontSize: 12,
              marginTop: 4,
              fontFamily: "var(--font-mono)",
            }}
          >
            {email}
          </div>
        </div>
      </div>

      {/* Account + Brand side-by-side on desktop */}
      <div className="profile-editor-grid">
        <Section title={t.profile.account}>
          <Field label={t.profile.fullName}>
            <Input
              value={fields.full_name}
              placeholder={t.profile.fullNamePlaceholder}
              onChange={(v) => update("full_name", v)}
            />
          </Field>
          <Field label={t.profile.headline}>
            <Input
              value={fields.headline}
              placeholder={t.profile.headlinePlaceholder}
              onChange={(v) => update("headline", v)}
            />
          </Field>
        </Section>

        <Section title={t.profile.brand}>
          <Field label={t.profile.watermark}>
            <WatermarkSlot
              url={fields.watermark_url}
              busy={watermarkBusy}
              onPick={() => watermarkInputRef.current?.click()}
              onClear={() => update("watermark_url", "")}
              uploadLabel={t.profile.upload}
              replaceLabel={t.profile.replace}
              removeLabel={t.profile.remove}
              uploadingLabel={t.profile.uploading}
            />
            <input
              ref={watermarkInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => handleImageChange(e, "watermark_url")}
            />
          </Field>
          <Field label={t.profile.tagline}>
            <Input
              value={fields.tagline}
              placeholder={t.profile.taglinePlaceholder}
              onChange={(v) => update("tagline", v)}
            />
          </Field>
        </Section>
      </div>

      {/* Social section */}
      <Section title={t.profile.social}>
        <Field label={t.profile.instagram}>
          <Input
            value={fields.instagram_handle}
            placeholder={t.profile.handlePlaceholder}
            onChange={(v) => update("instagram_handle", v)}
          />
        </Field>
        <Field label={t.profile.tiktok}>
          <Input
            value={fields.tiktok_handle}
            placeholder={t.profile.handlePlaceholder}
            onChange={(v) => update("tiktok_handle", v)}
          />
        </Field>
        <Field label={t.profile.youtube}>
          <Input
            value={fields.youtube_handle}
            placeholder={t.profile.handlePlaceholder}
            onChange={(v) => update("youtube_handle", v)}
          />
        </Field>
      </Section>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 12,
        }}
      >
        <SaveStatus state={save} t={t} />
        <button
          type="submit"
          className="btn-generate"
          disabled={!isDirty || save === "saving"}
          style={{ height: 38, opacity: !isDirty ? 0.5 : 1 }}
        >
          {save === "saving" ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {t.profile.saving}
            </>
          ) : (
            <>
              <Check size={14} />
              {t.profile.save}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="kicker" style={{ marginBottom: 14 }}>
        {title}
      </div>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <div
        className="kicker"
        style={{ marginBottom: 6, fontSize: 12 }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        height: 36,
        padding: "0 12px",
        background: "var(--bg-2)",
        border: "1px solid var(--line-soft)",
        borderRadius: 8,
        outline: "none",
        color: "var(--fg-0)",
        fontSize: 13,
        boxSizing: "border-box",
      }}
    />
  );
}

function AvatarSlot({
  url,
  letter,
  busy,
  onPick,
  onClear,
  uploadLabel,
  replaceLabel,
  removeLabel,
  uploadingLabel,
}: {
  url: string;
  letter: string;
  busy: boolean;
  onPick: () => void;
  onClear: () => void;
  uploadLabel: string;
  replaceLabel: string;
  removeLabel: string;
  uploadingLabel: string;
}) {
  return (
    <div
      style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}
    >
      <button
        type="button"
        onClick={onPick}
        disabled={busy}
        title={url ? replaceLabel : uploadLabel}
        style={{
          width: 72,
          height: 72,
          borderRadius: 999,
          border: "1px solid var(--line-soft)",
          background: url
            ? `center / cover no-repeat url(${JSON.stringify(url)})`
            : "linear-gradient(135deg, oklch(0.86 0.14 82), oklch(0.55 0.10 72))",
          color: "var(--on-gold)",
          fontFamily: "var(--font-display)",
          fontSize: 30,
          letterSpacing: "-0.02em",
          cursor: busy ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 6px 18px -8px oklch(0.66 0.12 75 / 0.5)",
        }}
      >
        {busy ? (
          <Loader2 size={20} className="animate-spin" />
        ) : url ? (
          ""
        ) : (
          letter
        )}
      </button>
      <div
        style={{
          fontSize: 11,
          color: "var(--fg-3)",
          textAlign: "center",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.04em",
        }}
      >
        {busy ? uploadingLabel : url ? (
          <button
            type="button"
            onClick={onClear}
            style={{
              all: "unset",
              cursor: "pointer",
              color: "var(--fg-2)",
              textDecoration: "underline",
            }}
          >
            {removeLabel}
          </button>
        ) : (
          uploadLabel
        )}
      </div>
    </div>
  );
}

function WatermarkSlot({
  url,
  busy,
  onPick,
  onClear,
  uploadLabel,
  replaceLabel,
  removeLabel,
  uploadingLabel,
}: {
  url: string;
  busy: boolean;
  onPick: () => void;
  onClear: () => void;
  uploadLabel: string;
  replaceLabel: string;
  removeLabel: string;
  uploadingLabel: string;
}) {
  return (
    <div
      className="profile-editor-watermark"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 12,
        border: "1px solid var(--line-soft)",
        borderRadius: 8,
        background: "var(--bg-2)",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 6,
          background: "var(--bg-0)",
          border: "1px solid var(--line-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          backgroundImage: url ? `url(${JSON.stringify(url)})` : "none",
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      >
        {!url && <Upload size={16} color="var(--fg-3)" />}
      </div>
      <div className="meta" style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: "var(--fg-1)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {busy ? uploadingLabel : url ? url.split("/").pop() : uploadLabel}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          style={smallButtonStyle}
        >
          {url ? replaceLabel : uploadLabel}
        </button>
        {url && (
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            style={smallButtonStyle}
            aria-label={removeLabel}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

const smallButtonStyle: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  fontSize: 12,
  background: "transparent",
  border: "1px solid var(--line-soft)",
  borderRadius: 6,
  color: "var(--fg-1)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

function SaveStatus({
  state,
  t,
}: {
  state: SaveState;
  t: ReturnType<typeof useI18n>["t"];
}) {
  if (state === "saved") {
    return (
      <span
        style={{
          fontSize: 12,
          color: "var(--positive)",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Check size={12} /> {t.profile.saved}
      </span>
    );
  }
  if (state === "error") {
    return (
      <span style={{ fontSize: 12, color: "var(--fg-3)" }}>
        {t.profile.saveFailed}
      </span>
    );
  }
  return null;
}

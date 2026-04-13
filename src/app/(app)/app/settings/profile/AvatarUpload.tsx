"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";

import { uploadAvatar, removeAvatar } from "./actions";
import { Button } from "@/components/ui/button";
import { StaffAvatar } from "@/components/ui/staff-avatar";

interface AvatarUploadProps {
  currentUrl: string | null;
  staffName: string;
}

export function AvatarUpload({ currentUrl, staffName }: AvatarUploadProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    setPreview(URL.createObjectURL(file));
    setError(null);

    // Upload
    const formData = new FormData();
    formData.set("avatar", file);

    startTransition(async () => {
      const result = await uploadAvatar(formData);
      if (!result.ok) {
        setError(result.error ?? "Upload failed");
        setPreview(null);
        return;
      }
      router.refresh();
    });
  };

  const handleRemove = () => {
    setError(null);
    setPreview(null);
    startTransition(async () => {
      const result = await removeAvatar();
      if (!result.ok) {
        setError(result.error ?? "Failed to remove");
        return;
      }
      router.refresh();
    });
  };

  const displayUrl = preview ?? currentUrl;

  return (
    <div className="flex items-center gap-6">
      <div className="relative">
        <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-muted">
          <StaffAvatar src={displayUrl} name={staffName} size={96} className="bg-muted text-muted-foreground" />
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isPending}
          className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <div>
        <p className="font-medium">{staffName}</p>
        <p className="text-sm text-muted-foreground">
          {isPending ? "Uploading..." : "Click the camera icon to upload a photo"}
        </p>
        {currentUrl && !isPending && (
          <Button size="sm" variant="outline" className="mt-2 gap-1 text-xs text-destructive" onClick={handleRemove}>
            <Trash2 className="h-3.5 w-3.5" /> Remove photo
          </Button>
        )}
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
